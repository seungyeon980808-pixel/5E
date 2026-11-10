/* Opt-in loopback development transport. Browser credentials are never forwarded. */
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {createInterface}=require('node:readline');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildEphemeralThreadStartParams}=require('../desktop/ai-thread-profile.cjs');
const {createDirectImageClient}=require('../desktop/ai-direct-image.cjs');
// 11-10: 직접 호출은 100초·재시도 1번(렌더러 생성 시도 240초 안에 끝나도록).
// 11-09: AI 요청이 실패한 순간을 기록한다(원인 확인용). 맥은 ~/Library/Logs/5E/ai-bridge.log, 5MB가 넘으면 .1로 넘긴다.
function createAiBridgeLog(){
  const dir=process.env.FIVEE_AI_LOG_DIR||path.join(os.homedir(),...(process.platform==='darwin'?['Library','Logs','5E']:['.5e-logs'])),file=path.join(dir,'ai-bridge.log');
  return entry=>{try{fs.mkdirSync(dir,{recursive:true});try{if(fs.statSync(file).size>5e6)fs.renameSync(file,file+'.1');}catch{}fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...entry})+'\n');}catch{}};
}
function createLocalCodexBridge({binary,spawnProcess=spawn,takeoverWaitMs=8000,log=spawnProcess===spawn?createAiBridgeLog():()=>{},directImageClient=createDirectImageClient({log,timeoutMs:100000,retries:1})}={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'5e-local-ai-'));
  let child,ready,serial=0,closed=false;
  const pending=new Map(),scopes=new Map(),threads=new Map();
  const rejectAll=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};
  function rpc(method,params={}) {
    return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);log({event:'rpc-timeout',method});reject(Error('로컬 AI 응답 시간이 초과됐습니다. 화면에서 자동으로 다시 보냅니다.'));},method==='turn/start'?120000:30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});});
  }
  async function start() {
    if(closed)throw Error('로컬 AI 서버가 종료됐습니다.');
    if(!ready)ready=(async()=>{
      child=spawnProcess(binary,['app-server','--listen','stdio://'],{cwd:dir,stdio:['pipe','pipe','pipe']});
      child.on('error',error=>{log({event:'codex-error',message:String(error?.message||error).slice(0,300)});rejectAll(error);});child.on('exit',(code,signal)=>{log({event:'codex-exit',code,signal});rejectAll(Error('로컬 Codex가 종료됐습니다. 서버를 다시 실행하세요.'));for(const s of scopes.values()){s.active=false;s.events.push({clientScope:s.id,method:'error',params:{turnId:s.turnId,error:{message:'로컬 Codex 연결 종료'}}});}});
      child.stdin.on('error',rejectAll);child.stderr.resume();
      createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
        if(m.id!==undefined && pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message||'Codex 요청 실패')):p.resolve(m.result);return;}
        const owner=threads.get(m.params?.threadId||m.params?.thread?.id);if(!owner || owner.threadId!==(m.params?.threadId||m.params?.thread?.id))return;
        const item=m.params?.item;if(item?.type==='imageGeneration'&&item.savedPath){try{const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(item.savedPath).toLowerCase()];if(mime&&fs.statSync(item.savedPath).size<=20000000)item.imageDataUrl=`data:${mime};base64,${fs.readFileSync(item.savedPath).toString('base64')}`;}catch{}}
        owner.events.push({...m,clientScope:owner.id});
        if(m.method==='error')log({event:'turn-error',scope:owner.id,turnId:owner.turnId||null,message:String(m.params?.error?.message||'').slice(0,300)});
        if(m.method==='turn/completed'){const turn=m.params?.turn||{};log({event:'turn-completed',scope:owner.id,turnId:turn.id||owner.turnId||null,status:turn.status||null,error:turn.error?String(turn.error.message||turn.error).slice(0,300):null,ms:owner.startedAt?Date.now()-owner.startedAt:null,purpose:owner.purpose||null,model:owner.model||null});owner.active=false;for(const f of owner.files||[])fs.rmSync(f,{force:true});owner.files=[];}
      });
      await rpc('initialize',{clientInfo:{name:'5e-local-preview',version:'1.7.0'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    })();return ready;
  }
  // 11-10: 보내기 응답은 바로 돌려주고(합성 turnId), 생성은 뒤에서 진행해 끝나면 이벤트를 쌓는다.
  // 입력·로그인 확인(동기)이 실패하면 null을 돌려줘 app-server 경로가 이어 받는다. 생성 중 실패는 실패 종료 이벤트로 알린다.
  function sendDirectImage(id,scope,payload,selection,attachments) {
    const model=selection.model||'gpt-6-luna',images=attachments.map(a=>a.data);
    try{directImageClient.precheck({model,text:payload.text,attachments:images,image:true});}
    catch(error){log({event:'direct-fallback',scope:id,code:error?.code||'DIRECT_UNKNOWN',status:error?.status??null});return null;}
    const turnId=`direct-${randomUUID()}`,controller=new AbortController(),startedAt=Date.now();
    scope.directAbort=controller;scope.turnId=turnId;scope.startedAt=startedAt;scope.purpose='image';scope.model=selection.model||null;scope.active=true;
    const finish=(result,error)=>{
      // 새 요청이 이미 같은 칸을 차지했으면 끊긴 요청의 소식은 버린다.
      if(scope.turnId!==turnId)return;
      scope.directAbort=null;
      const cancelled=!result&&(error?.code==='DIRECT_ABORTED'||controller.signal.aborted);
      const status=result?'completed':cancelled?'interrupted':'failed';
      const turn={id:turnId,status};
      if(status==='failed'){turn.error={message:'그림 생성에 실패했습니다. 다른 모델로 다시 시도합니다.'};log({event:'direct-failed',scope:id,turnId,code:error?.code||'DIRECT_UNKNOWN',status:error?.status??null});}
      if(result)scope.events.push({method:'item/completed',params:{turnId,item:{type:'imageGeneration',status:'completed',imageDataUrl:result.imageDataUrl}},clientScope:id});
      scope.events.push({method:'turn/completed',params:{turn},clientScope:id});
      log({event:'turn-completed',scope:id,turnId,status,ms:Date.now()-startedAt,purpose:'image',model:scope.model});
      scope.active=false;
    };
    directImageClient.generate({model,text:payload.text,attachments:images,signal:controller.signal}).then(r=>finish(r,null),e=>finish(null,e)).catch(()=>{});
    return {threadId:turnId,turnId,conversationId:turnId};
  }
  async function handle(action,payload={}) {
    await start();
    // 11-10: 라벨 읽기(글자 호출)는 대화 칸 없이 직접 부른다. 본문·이미지 형식을 확인한 뒤 결과 글만 돌려준다.
    if(action==='bridge-read-text'){
      if(typeof payload.text!=='string'||payload.text.length>1000000)throw Error('잘못된 읽기 요청입니다.');
      const images=Array.isArray(payload.attachments)?payload.attachments:[];if(images.length>16)throw Error('참고 이미지 수가 너무 많습니다.');
      const attachments=images.map(a=>typeof a==='string'?a:a?.data);
      const r=await directImageClient.readText({model:payload.model||'gpt-6.1-sol',text:payload.text,attachments});return {text:r.text};
    }
    if(action==='bridge-status'){const r=await rpc('account/read');return {server:true,login:{loggedIn:Boolean(r.account)},local:true};}
    if(action==='bridge-models')return rpc('model/list',{limit:100,includeHidden:false});
    if(action==='bridge-account'){const [a,l]=await Promise.all([rpc('account/read'),rpc('account/rateLimits/read')]);return {...a,...l};}
    const id=typeof payload.clientScope==='string'?payload.clientScope:'';
    if(id.length>200)throw Error('잘못된 작업 범위입니다.');
    if(!scopes.has(id)){
      // 11-09: 창마다 작업 칸 이름이 달라져(창 고유 앞머리) 쌓이므로, 가득 차면 끝난 칸부터 비운다(오류로 막지 않음).
      if(scopes.size>=256)for(const [key,old] of scopes){if(old.active)continue;threads.delete(old.threadId);scopes.delete(key);if(scopes.size<192)break;}
      if(scopes.size>=256)throw Error('로컬 작업 수가 너무 많습니다. 서버를 다시 실행하세요.');scopes.set(id,{id,events:[],active:false});}
    const scope=scopes.get(id);
    if(action==='bridge-events'){const cursor=payload.cursor??0;if(!Number.isInteger(cursor)||cursor<0||cursor>scope.events.length)throw Error('잘못된 이벤트 위치입니다.');return {cursor:scope.events.length,events:scope.events.slice(cursor)};}
    if(action==='bridge-interrupt'){if(scope.directAbort){scope.directAbort.abort();return {ok:true,acknowledged:true};}if(scope.active&&scope.turnId)await rpc('turn/interrupt',{threadId:scope.threadId,turnId:scope.turnId});return {ok:true,acknowledged:true};}
    if(action!=='bridge-send')throw Error('허용되지 않은 로컬 요청입니다.');
    if(scope.active){
      // 11-09 사용자 원칙: AI 요청은 실패로 끝내지 않는다. 같은 칸에서 새 요청이 오면(웹 화면은 새 요청을 보내면 앞 요청의 소식을 더 받지 않는다)
      // 앞 요청을 끊고 잠깐(최대 takeoverWaitMs) 기다린 뒤 보낸다.
      log({event:'takeover',scope:id,threadId:scope.threadId||null,turnId:scope.turnId||null});
      if(scope.directAbort)scope.directAbort.abort();else if(scope.threadId&&scope.turnId)await Promise.race([rpc('turn/interrupt',{threadId:scope.threadId,turnId:scope.turnId}).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,Math.min(3000,takeoverWaitMs)))]);
      const deadline=Date.now()+takeoverWaitMs;
      while(scope.active&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(200,takeoverWaitMs)));
      if(scope.active){threads.delete(scope.threadId);scope.active=false;for(const f of scope.files||[])fs.rmSync(f,{force:true});scope.files=[];}
    }
    if(typeof payload.text!=='string'||payload.text.length>1000000)throw Error('잘못된 AI 요청입니다.');
    const catalog=await rpc('model/list',{limit:100,includeHidden:false});const {resolveAIModelSelection}=await import('../js/ai-model-capabilities.js');const selection=resolveAIModelSelection(payload,catalog);
    // 그래프 복원은 Sol 6.1 / medium. 응답이 없을 때 화면이 다시 보내는 마지막 시도만 Luna / medium을 허용한다(11-09, 사용자 승인).
    if(payload.purpose==='scene'&&payload.sceneKind==='graph'&&(!['gpt-6.1-sol','gpt-6-luna'].includes(selection.model)||selection.effort!=='medium'))throw Error('그래프 복원은 Sol 6.1 / medium을 사용합니다.');
    let outputSchema;
    if(payload.outputSchema!==undefined){
      if(payload.purpose!=='scene'||!payload.outputSchema||typeof payload.outputSchema!=='object'||Array.isArray(payload.outputSchema))throw Error('출력 스키마는 scene JSON 객체여야 합니다.');
      const encoded=JSON.stringify(payload.outputSchema);
      if(Buffer.byteLength(encoded,'utf8')>200000)throw Error('출력 스키마 크기가 200KB를 초과합니다.');
      outputSchema=JSON.parse(encoded);
    }
    const attachments=payload.attachments||[];if(!Array.isArray(attachments)||attachments.length>16)throw Error('참고 이미지 수가 너무 많습니다.');
    threads.delete(scope.threadId);scope.active=true;scope.events=[];scope.files=[];
    if(payload.purpose==='image'&&process.env.FIVE_E_IMAGE_TRANSPORT!=='agent'){const direct=sendDirectImage(id,scope,payload,selection,attachments);if(direct)return direct;}
    try{
      const input=[{type:'text',text:payload.text}];
      for(const a of attachments){const match=typeof a.data==='string'&&a.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Error('PNG/JPEG/WebP 참고 이미지가 필요합니다.');
        // 11-10: 그림 요청은 파일 경로 대신 데이터 주소로 보낸다(에이전트가 쓸 경로가 없게 한다).
        if(payload.purpose==='image'){input.push({type:'image',url:a.data});continue;}
        const bytes=Buffer.from(match[2],'base64');if(bytes.length>20000000)throw Error('참고 이미지가 너무 큽니다.');const f=path.join(dir,`${randomUUID()}.${match[1]}`);fs.writeFileSync(f,bytes);scope.files.push(f);input.push({type:'localImage',path:f});}
      const purpose=payload.purpose==='scene'?'scene':payload.purpose==='image'?'image':'chat';
      const r=await rpc('thread/start',buildEphemeralThreadStartParams({...selection,purpose,cwd:dir}));scope.threadId=r.thread.id;threads.set(scope.threadId,scope);
      scope.startedAt=Date.now();scope.purpose=purpose;scope.model=selection.model||null;
      const t=await rpc('turn/start',{threadId:scope.threadId,input,...selection,...(outputSchema!==undefined?{outputSchema}:{})});scope.turnId=t.turn.id;
      log({event:'send',scope:id,turnId:scope.turnId,purpose,model:selection.model||null,effort:selection.effort||null,attachments:attachments.length});return {threadId:scope.threadId,turnId:scope.turnId,conversationId:scope.threadId};
    }catch(error){log({event:'send-failed',scope:id,message:String(error?.message||error).slice(0,300)});scope.active=false;for(const f of scope.files)fs.rmSync(f,{force:true});scope.files=[];throw error;}
  }
  const close=()=>{closed=true;child?.kill();rejectAll(Error('로컬 서버 종료'));fs.rmSync(dir,{recursive:true,force:true});};
  return {handle,close};
}
module.exports={createLocalCodexBridge};
