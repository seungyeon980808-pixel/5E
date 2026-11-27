// 1.8.0 출제 하네스 — 「AI가 5E 도구를 직접 부르는」 엔진의 화면 쪽(11-27 계획-엔진전환 2단계).
// 본창(js/harness-workspace.js)을 거쳐 본체의 다리(desktop/harness-agent.cjs)와 이야기한다.
//  - 보내기: {action:'agent', requestId, payload} → {action:'agent-ready', requestId, result|error}
//  - 받기:   {action:'agent-event', event}  (event.kind = delta · item · tool · done · leak · warning)
// 도구는 여기(화면)에서 실행한다 — 시험지 상태가 화면에 있으므로. 도구 정의와 규칙 검사는 부르는 쪽(app.js)이 넘긴다.

const CHANNEL='5e-harness';

// 본창과의 통로. post = app.js의 post(같은 봉투를 씀).
export function createAgentClient({post}){
  const pending=new Map(),listeners=new Map();
  addEventListener('message',e=>{if(e.source!==window.parent||e.data?.channel!==CHANNEL)return;const m=e.data;
    if(m.action==='agent-ready'){const p=pending.get(m.requestId);if(!p)return;pending.delete(m.requestId);
      if(m.error){const err=typeof m.error==='string'?{message:m.error}:m.error;p.reject(Object.assign(Error(err.message||'AI 요청 실패'),{code:err.code||m.code||null}));}else p.resolve(m.result);return;}
    if(m.action==='agent-event'&&m.event?.conversation){listeners.get(m.event.conversation)?.(m.event);}});
  const call=payload=>new Promise((resolve,reject)=>{const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});post({action:'agent',requestId,payload});});
  return {call,listen(conversation,handler){listeners.set(conversation,handler);return()=>{if(listeners.get(conversation)===handler)listeners.delete(conversation);};}};
}

// 한 대화의 엔진. tools = {이름:{description, inputSchema, run(args, ctx) → 결과(객체) | throw}}.
// hooks: onDelta(text, all) · onTool({tool,args,callId}) · onToolDone({tool,args,result,ok,ms}) · onLeak(type) · onWarning(msg)
export function createAgentEngine({client,conversation,tools,toolsVersion,instructions,thread=null,hooks={}}){
  let active=null,saved=thread;// saved = {threadId, toolsKey} — 파일에 넣어 두었다가 다시 열 때 이어 쓴다
  const specs=()=>Object.entries(tools).map(([name,t])=>({name,description:t.description,inputSchema:t.inputSchema||{type:'object',properties:{}}}));
  const reply=(callId,result,ok)=>client.call({action:'tool-reply',conversation,callId,result,ok}).catch(()=>{});
  async function runTool(turn,event){const t=tools[event.tool],t0=Date.now(),args=event.arguments&&typeof event.arguments==='object'?event.arguments:{};
    hooks.onTool?.({tool:event.tool,args,callId:event.callId});
    let result,ok=true;
    try{if(!t)throw Error('모르는 도구');result=await t.run(args,{turn});if(result&&result.error)ok=false;}
    catch(error){ok=false;result={error:String(error?.message||error).slice(0,500)};}
    // 차례가 이미 끝났으면(멈춤·시간 초과) 늦게 끝난 도구 결과는 돌려보내지 않는다.
    if(active===turn)await reply(event.callId,result??{ok:true},ok);
    turn.toolLog.push({tool:event.tool,args,ok,ms:Date.now()-t0});
    hooks.onToolDone?.({tool:event.tool,args,result,ok,ms:Date.now()-t0,late:active!==turn});}
  function onEvent(event){const turn=active;if(!turn)return;if(event.turnId&&turn.turnId&&event.turnId!==turn.turnId)return;
    if(event.kind==='delta'){turn.text+=event.text;hooks.onDelta?.(event.text,turn.text);return;}
    if(event.kind==='item'){if(event.itemType==='agentMessage'&&event.phase==='started'&&turn.text&&!/\n\n$/.test(turn.text)){turn.text+='\n\n';}hooks.onItem?.(event);return;}
    if(event.kind==='tool'){void runTool(turn,event);return;}
    if(event.kind==='leak'){turn.leak=event.itemType;hooks.onLeak?.(event.itemType);return;}
    if(event.kind==='warning'){hooks.onWarning?.(event.message);return;}
    if(event.kind==='done'){active=null;turn.off();turn.resolve({status:event.status,text:turn.text.trim(),toolLog:turn.toolLog,usage:event.usage||null,ms:event.ms,leak:turn.leak||null,error:event.error||null,code:event.code||null});}}
  // 한 차례 보내기. context = 5E가 넣는 지금 상태 요약(새 스레드·바뀐 것).
  async function send(text,{context=null,model=null,effort=null}={}){
    if(active)throw Object.assign(Error('아직 일하는 중이에요.'),{code:'HARNESS_TURN_ACTIVE'});
    const turn={text:'',toolLog:[],turnId:null,leak:null};active=turn;
    const done=new Promise(resolve=>{turn.resolve=resolve;});turn.off=client.listen(conversation,onEvent);
    try{const r=await client.call({action:'start',conversation,text,tools:specs(),toolsVersion,instructions,context,model,effort,...(saved?{threadId:saved.threadId,toolsKey:saved.toolsKey}:{})});
      turn.turnId=r.turnId||null;saved={threadId:r.threadId,toolsKey:r.toolsKey};turn.fresh=!!r.fresh;hooks.onThread?.(saved,r.fresh);}
    catch(error){active=null;turn.off();throw error;}
    return done;}
  return {send,
    get busy(){return !!active;},get thread(){return saved;},
    interrupt:()=>client.call({action:'interrupt',conversation}),
    // 일하는 중에 말 더하기. 일하는 중이 아니면 false(부르는 쪽이 새 차례로 보냄).
    steer:async text=>{if(!active)return false;const r=await client.call({action:'steer',conversation,text});return !!r?.ok;}};
}
