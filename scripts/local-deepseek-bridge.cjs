/* Opt-in loopback development transport for DeepSeek (사용자 본인 API 키). 로컬 Codex 브리지와 같은 handle(action,payload) 계약.
 * - 글 작업(chat: 출제 대화·검토, scene: 그래프 JSON 계획)은 DeepSeek /chat/completions로 보낸다.
 * - DeepSeek는 그림을 만들지 않고 이미지 입력도 받지 않는다. 그림 요청은 imageBridge(예: 로컬 Codex)로 넘기고, 없으면 분명히 실패한다.
 *   첨부 그림은 보내지 않으며 droppedAttachments로 알려, 앱이 '그림을 읽었다'로 표시하지 않게 한다.
 * - 웹 화면은 gpt-6.1-sol 모델 ID를 기대하므로 그 ID로 광고하고 표시 이름에 실제 공급자를 적는다.
 * 키는 환경 변수(DEEPSEEK_API_KEY)로만 받는다. 브라우저 자격 증명은 넘기지 않는다. */
const {randomUUID}=require('node:crypto');
const {SCENE_BASE_INSTRUCTIONS,SCENE_DEVELOPER_INSTRUCTIONS}=require('../desktop/ai-thread-profile.cjs');
const ADVERTISED=[{id:'gpt-6.1-sol',effort:'medium'},{id:'gpt-6-luna',effort:'low'}];
function createDeepSeekBridge({apiKey,model='deepseek-chat',baseUrl='https://api.deepseek.com',fetchImpl=globalThis.fetch,imageBridge=null,timeoutMs=180000}={}){
  const scopes=new Map();
  const scopeOf=payload=>{const id=typeof payload.clientScope==='string'?payload.clientScope:'';if(id.length>200)throw Error('잘못된 작업 범위입니다.');if(!scopes.has(id)){if(scopes.size>=256)throw Error('로컬 작업 수가 너무 많습니다. 서버를 다시 실행하세요.');scopes.set(id,{id,events:[],active:false,controller:null,turnId:null});}return scopes.get(id);};
  const catalog=()=>({data:ADVERTISED.map((m,i)=>({model:m.id,displayName:`DeepSeek · ${model}`,isDefault:i===0,defaultReasoningEffort:m.effort,supportedReasoningEfforts:[{reasoningEffort:m.effort}],serviceTiers:[]}))});
  async function complete(scope,payload,turnId){
    const scene=payload.purpose==='scene',messages=[];
    if(scene)messages.push({role:'system',content:[SCENE_BASE_INSTRUCTIONS,SCENE_DEVELOPER_INSTRUCTIONS,payload.outputSchema?`출력은 다음 JSON 스키마를 따르는 JSON 객체 하나: ${JSON.stringify(payload.outputSchema)}`:''].filter(Boolean).join('\n\n')});
    messages.push({role:'user',content:payload.text});
    const body={model,messages,stream:false,...(scene?{response_format:{type:'json_object'}}:{}),temperature:scene?0:0.4};
    const push=(method,params)=>scope.events.push({clientScope:scope.id,method,params:{turnId,threadId:turnId,...params}});
    try{
      const r=await fetchImpl(`${baseUrl}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${apiKey}`},body:JSON.stringify(body),signal:scope.controller.signal});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(data?.error?.message?`DeepSeek: ${data.error.message}`:`DeepSeek 요청 실패(${r.status})`);
      const text=String(data?.choices?.[0]?.message?.content||'');if(!text)throw Error('DeepSeek가 빈 답을 보냈습니다.');
      push('item/completed',{item:{type:'agentMessage',id:randomUUID(),text}});
      if(data.usage)push('thread/tokenUsage/updated',{tokenUsage:{last:{inputTokens:data.usage.prompt_tokens,outputTokens:data.usage.completion_tokens}}});
      push('turn/completed',{turn:{id:turnId,status:'completed'}});
    }catch(error){
      const aborted=error?.name==='AbortError';
      push(aborted?'turn/completed':'error',aborted?{turn:{id:turnId,status:'interrupted'}}:{error:{message:error.message||'DeepSeek 요청 실패'}});
      if(!aborted)push('turn/completed',{turn:{id:turnId,status:'failed',error:{message:error.message}}});
    }finally{scope.active=false;scope.controller=null;}
  }
  async function handle(action,payload={}){
    if(action==='bridge-status')return {server:true,login:{loggedIn:Boolean(apiKey)},local:true,provider:'deepseek'};
    if(action==='bridge-models')return catalog();
    if(action==='bridge-account')return {account:{type:'apiKey',provider:'deepseek'},rateLimits:{}};
    const scope=scopeOf(payload);
    // 그림 요청은 그림을 지원하는 연결로 넘기고, 그 작업 범위의 이벤트·중단도 그쪽으로 보낸다(한 범위에 요청은 하나씩).
    if(action==='bridge-send'&&payload.purpose==='image'){
      if(!imageBridge)throw Error('DeepSeek는 그림을 만들지 않습니다. 그림 만들기는 Codex 등 그림을 지원하는 연결이 필요합니다.');
      scope.route='image';return imageBridge.handle(action,payload);
    }
    if(scope.route==='image'&&(action==='bridge-events'||action==='bridge-interrupt'))return imageBridge.handle(action,payload);
    if(action==='bridge-events'){
      const cursor=payload.cursor??0;if(!Number.isInteger(cursor)||cursor<0||cursor>scope.events.length)throw Error('잘못된 이벤트 위치입니다.');
      return {cursor:scope.events.length,events:scope.events.slice(cursor)};
    }
    if(action==='bridge-interrupt'){scope.controller?.abort();return {ok:true,acknowledged:true};}
    if(action!=='bridge-send')throw Error('허용되지 않은 로컬 요청입니다.');
    if(!apiKey)throw Error('DEEPSEEK_API_KEY가 없습니다. 서버를 실행한 셸에 본인 키를 넣어 주세요.');
    if(scope.active)throw Error('이 작업의 AI 요청이 이미 실행 중입니다.');
    if(typeof payload.text!=='string'||payload.text.length>1000000)throw Error('잘못된 AI 요청입니다.');
    const dropped=Array.isArray(payload.attachments)?payload.attachments.length:0;
    const turnId=randomUUID();scope.route='text';scope.active=true;scope.events=[];scope.turnId=turnId;scope.controller=new AbortController();
    const timer=setTimeout(()=>scope.controller?.abort(),timeoutMs);
    void complete(scope,dropped?{...payload,text:payload.text+'\n\n[알림] 이 공급자는 첨부 그림을 읽지 못한다. 그림에 대한 판단은 unverified로 둔다.'}:payload,turnId).finally(()=>clearTimeout(timer));
    return {threadId:turnId,turnId,conversationId:turnId,...(dropped?{droppedAttachments:dropped}:{})};
  }
  return {handle,close(){for(const s of scopes.values())s.controller?.abort();imageBridge?.close?.();}};
}
module.exports={createDeepSeekBridge};
