/* Opt-in loopback development transport. Browser credentials are never forwarded. */
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {createInterface}=require('node:readline');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildEphemeralThreadStartParams}=require('../desktop/ai-thread-profile.cjs');
function createLocalCodexBridge({binary,spawnProcess=spawn}={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'5e-local-ai-'));
  let child,ready,serial=0,closed=false;
  const pending=new Map(),scopes=new Map(),threads=new Map();
  const rejectAll=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
  function rpc(method,params={}) {
    return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('로컬 AI 응답 시간이 초과됐습니다. 자동 재전송하지 않습니다.'));},method==='turn/start'?120000:30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});});
  }
  async function start() {
    if(closed)throw Error('로컬 AI 서버가 종료됐습니다.');
    if(!ready)ready=(async()=>{
      child=spawnProcess(binary,['app-server','--listen','stdio://'],{cwd:dir,stdio:['pipe','pipe','pipe']});
      child.on('error',rejectAll);child.on('exit',()=>{rejectAll(Error('로컬 Codex가 종료됐습니다. 서버를 다시 실행하세요.'));for(const s of scopes.values()){s.active=false;s.events.push({clientScope:s.id,method:'error',params:{turnId:s.turnId,error:{message:'로컬 Codex 연결 종료'}}});}});
      child.stdin.on('error',rejectAll);child.stderr.resume();
      createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
        if(m.id!==undefined && pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message||'Codex 요청 실패')):p.resolve(m.result);return;}
        const owner=threads.get(m.params?.threadId||m.params?.thread?.id);if(!owner || owner.threadId!==(m.params?.threadId||m.params?.thread?.id))return;
        const item=m.params?.item;if(item?.type==='imageGeneration'&&item.savedPath){try{const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(item.savedPath).toLowerCase()];if(mime&&fs.statSync(item.savedPath).size<=20000000)item.imageDataUrl=`data:${mime};base64,${fs.readFileSync(item.savedPath).toString('base64')}`;}catch{}}
        owner.events.push({...m,clientScope:owner.id});
        if(m.method==='turn/completed'){owner.active=false;for(const f of owner.files||[])fs.rmSync(f,{force:true});owner.files=[];}
      });
      await rpc('initialize',{clientInfo:{name:'5e-local-preview',version:'1.7.0'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    })();return ready;
  }
  async function handle(action,payload={}) {
    await start();
    if(action==='bridge-status'){const r=await rpc('account/read');return {server:true,login:{loggedIn:Boolean(r.account)},local:true};}
    if(action==='bridge-models')return rpc('model/list',{limit:100,includeHidden:false});
    if(action==='bridge-account'){const [a,l]=await Promise.all([rpc('account/read'),rpc('account/rateLimits/read')]);return {...a,...l};}
    const id=typeof payload.clientScope==='string'?payload.clientScope:'';
    if(id.length>200)throw Error('잘못된 작업 범위입니다.');
    if(!scopes.has(id)){if(scopes.size>=256)throw Error('로컬 작업 수가 너무 많습니다. 서버를 다시 실행하세요.');scopes.set(id,{id,events:[],active:false});}
    const scope=scopes.get(id);
    if(action==='bridge-events'){const cursor=payload.cursor??0;if(!Number.isInteger(cursor)||cursor<0||cursor>scope.events.length)throw Error('잘못된 이벤트 위치입니다.');return {cursor:scope.events.length,events:scope.events.slice(cursor)};}
    if(action==='bridge-interrupt'){if(scope.active&&scope.turnId)await rpc('turn/interrupt',{threadId:scope.threadId,turnId:scope.turnId});return {ok:true,acknowledged:true};}
    if(action!=='bridge-send')throw Error('허용되지 않은 로컬 요청입니다.');
    if(scope.active)throw Error('이 작업의 AI 요청이 이미 실행 중입니다.');
    if(typeof payload.text!=='string'||payload.text.length>1000000)throw Error('잘못된 AI 요청입니다.');
    const catalog=await rpc('model/list',{limit:100,includeHidden:false});const {resolveAIModelSelection}=await import('../js/ai-model-capabilities.js');const selection=resolveAIModelSelection(payload,catalog);
    if(payload.purpose==='scene'&&payload.sceneKind==='graph'&&(selection.model!=='gpt-6.1-sol'||selection.effort!=='medium'))throw Error('그래프 복원은 Sol 6.1 / medium을 사용합니다.');
    let outputSchema;
    if(payload.outputSchema!==undefined){
      if(payload.purpose!=='scene'||!payload.outputSchema||typeof payload.outputSchema!=='object'||Array.isArray(payload.outputSchema))throw Error('출력 스키마는 scene JSON 객체여야 합니다.');
      const encoded=JSON.stringify(payload.outputSchema);
      if(Buffer.byteLength(encoded,'utf8')>200000)throw Error('출력 스키마 크기가 200KB를 초과합니다.');
      outputSchema=JSON.parse(encoded);
    }
    const attachments=payload.attachments||[];if(!Array.isArray(attachments)||attachments.length>16)throw Error('참고 이미지 수가 너무 많습니다.');
    threads.delete(scope.threadId);scope.active=true;scope.events=[];scope.files=[];
    try{
      const input=[{type:'text',text:payload.text}];
      for(const a of attachments){const match=typeof a.data==='string'&&a.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('PNG/JPEG/WebP 참고 이미지가 필요합니다.');const bytes=Buffer.from(match[2],'base64');if(bytes.length>20000000)throw Error('참고 이미지가 너무 큽니다.');const f=path.join(dir,`${randomUUID()}.${match[1]}`);fs.writeFileSync(f,bytes);scope.files.push(f);input.push({type:'localImage',path:f});}
      const purpose=payload.purpose==='scene'?'scene':payload.purpose==='image'?'image':'chat';
      const r=await rpc('thread/start',buildEphemeralThreadStartParams({...selection,purpose,cwd:dir}));scope.threadId=r.thread.id;threads.set(scope.threadId,scope);
      const t=await rpc('turn/start',{threadId:scope.threadId,input,...selection,...(outputSchema!==undefined?{outputSchema}:{})});scope.turnId=t.turn.id;return {threadId:scope.threadId,turnId:scope.turnId,conversationId:scope.threadId};
    }catch(error){scope.active=false;for(const f of scope.files)fs.rmSync(f,{force:true});scope.files=[];throw error;}
  }
  const close=()=>{closed=true;child?.kill();rejectAll(Error('로컬 서버 종료'));fs.rmSync(dir,{recursive:true,force:true});};
  return {handle,close};
}
module.exports={createLocalCodexBridge};
