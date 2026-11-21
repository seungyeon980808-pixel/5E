// ExamPool 출제 대화 하네스(5E 본창 쪽). 문항 시트(iframe)가 보낸 출제 요청을 기존 5E AI 연결로 실행한다.
// - 작업 범위는 문항마다 따로(exampool:<문항 ID>) 둔다. 5E 이미지 작업실의 대화 상태를 덮어쓰지 않는다.
// - 응답 JSON을 계약대로 검사하고, 형식이 틀리면 한 번 다시 묻는다. 모델이 근거를 요청하면 읽기 전용 검색을 한 뒤 다시 묻는다.
// - 결과를 문항에 쓰지 않는다. 문항 반영·버전·적용 여부는 시트가 정한다.
import {createTaskBridge} from './ai-task-workspaces.js?v=1.7.0-four-session-integration';
import {defaultAIModelSelection} from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import {parseAiEvent} from './ai-events.js?v=1.7.0-four-session-integration';
import {parseAuthoringResponse} from '../assets/exampool/authoring/contract.js';
import {buildAuthoringPrompt} from '../assets/exampool/authoring/prompt.js';
import {GUIDELINES_VERSION} from '../assets/exampool/authoring/guidelines.js';
// PATHFIX(11-20): IPC 거절의 영어 머리말·Codex 실행 오류를 한국어로.
import {aiErrorText,aiErrorCode} from './ai-error-copy.js?v=1.7.0-four-session-integration';
// 11-22(시험 결함 10~12): 실패 까닭(설치·로그인·인터넷)을 고르는 공통 판별을 그대로 쓴다.
import {failureReason} from './ai-generation-copy.js?v=1.7.0-four-session-integration';
export const HARNESS_VERSION='exampool-authoring-harness-1';
const MAX_EVIDENCE_ROUNDS=2,TURN_TIMEOUT=300000,RETRY_STALL=90000;
// 11-22(결함 11·12): Codex가 스트림을 다시 잇는 동안 보내는 「Reconnecting... 2/5」(method:error, willRetry:true)는 실패가 아니라 진행이다.
// 예전에는 이 영어 원문이 그대로 오류가 되거나 진행이 멈춘 채 남았다. 진행으로 받아 한국어로 보이고, 끝내 실패하면 까닭별 최종 오류로 바꾼다.
const RETRY_TEXT=/^\s*Reconnecting\.*\s*(\d+)\s*\/\s*(\d+)/i;
export function retryInfo(message){if(message?.method!=='error')return null;const p=message.params||{},text=String(p.error?.message||p.message||''),m=text.match(RETRY_TEXT);
  if(!p.willRetry&&!m)return null;return {attempt:m?Number(m[1]):null,total:m?Number(m[2]):null,text};}
const OFFLINE_TEXT='AI와의 연결이 끊겨 답을 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 요청하세요. 입력한 내용은 그대로입니다.';
const STREAM_LOST=/stream disconnected|error sending request|Reconnecting|connection (?:reset|closed|refused)|timed? ?out/i;
/** 출제 요청 실패를 화면용 오류로: 설치 없음·로그인 없음은 Codex 코드(연결 화면으로 데려감), 인터넷은 한국어 안내, 나머지는 원문을 한국어로. */
export function authoringError(error,{online=globalThis.navigator?.onLine}={}){
  if(error?.cancelled)return error;
  let reason=failureReason(error,{online});
  // 다시 잇기 끝에 온 실패(영어 원문)는 연결 끊김으로 본다.
  if(reason==='ai'&&!aiErrorCode(error)&&(error?.retry||error?.code==='AI_RECONNECT_FAILED'||STREAM_LOST.test(String(error?.message||''))))reason='offline';
  const code=reason==='install'?'CODEX_NOT_FOUND':reason==='login'?'CODEX_NOT_LOGGED_IN':aiErrorCode(error);
  const text=reason==='offline'?OFFLINE_TEXT:code?aiErrorText({code}):aiErrorText(error);
  return Object.assign(Error(text),{code:code||error?.code||'',reason,cause:error});
}
export async function fetchEvidence(request){
  // 데스크톱 앱은 IPC로, 로컬 서버는 같은 원점 API로 검색한다.
  if(typeof window.fiveEDesktop?.examEvidence==='function'){try{return await window.fiveEDesktop.examEvidence(request);}catch(error){return {available:false,results:[],warning:'근거 검색 실패: '+aiErrorText(error)};}}
  // 공개 웹(정적 사이트·/preview/)에는 근거 검색 서버가 없다: 404·405·네트워크 오류는 '연결 안 됨'으로 조용히 넘긴다.
  const offline={available:false,results:[],warning:'이 실행 환경에는 근거 검색이 연결되어 있지 않습니다. 근거는 미확보로 남습니다.'};
  let r;try{r=await fetch('/api/exampool-evidence',{method:'POST',headers:{'content-type':'application/json','x-5e-request':'1'},body:JSON.stringify(request)});}catch{return offline;}
  if(r.status===404||r.status===405||r.status===501)return offline;
  const body=await r.json().catch(()=>({}));if(!r.ok)return {available:false,results:[],warning:body.error||'근거 검색 실패'};return body;
}
// 한 차례 AI 요청: 최종 답 글이 오고 차례가 끝날 때까지 기다린다. 취소·시간 초과는 중단 요청을 보낸다.
function runTurn(bridge,payload,{signal,timeout=TURN_TIMEOUT,onSent,onRetry,stall=RETRY_STALL,online=()=>globalThis.navigator?.onLine}={}){
  return new Promise((resolve,reject)=>{
    let text='',turnId=null,done=false,stallTimer=0,lastRetry=null;const buffered=[];
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(stallTimer);off?.();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    // 다시 잇기가 오래 멈추거나 인터넷이 끊겼으면 기다리지 않고 「연결 안 됨」으로 끝낸다(진행 표시가 몇 분씩 남지 않게).
    const giveUp=()=>{void bridge.interrupt?.().catch(()=>{});finish(Object.assign(Error('AI 연결이 끊겨 다시 잇지 못했습니다: '+(lastRetry?.text||'')),{code:'AI_RECONNECT_FAILED',retry:lastRetry}));};
    const retrying=info=>{lastRetry=info;onRetry?.(info);clearTimeout(stallTimer);
      if(online()===false){giveUp();return;}
      stallTimer=setTimeout(giveUp,stall);};
    const handle=event=>{if(turnId&&event.turnId&&event.turnId!==turnId)return;
      if(event.retry){retrying(event.retry);return;}
      if(event.kind==='assistant'&&event.text)text=event.text;
      else if(event.kind==='error')finish(Object.assign(Error(event.text),lastRetry?{retry:lastRetry}:{}));
      else if(event.kind==='done')event.status==='completed'?finish(null,text):finish(Object.assign(Error(event.error||`AI 요청이 끝나지 못했습니다(${event.status}).`),lastRetry?{retry:lastRetry}:{}));};
    const off=bridge.onEvent?.(message=>{const retry=retryInfo(message);const event=retry?{kind:'retry',retry,turnId:message.params?.turnId||null}:parseAiEvent(message);
      // 다시 이은 뒤 오는 신호(생각 중 등 화면에 안 쓰는 것 포함)는 연결이 살아 있다는 뜻 — 포기 시계를 멈춘다.
      if(!retry&&lastRetry&&(!turnId||!message?.params?.turnId||message.params.turnId===turnId))clearTimeout(stallTimer);
      if(event.kind==='ignore')return;if(!turnId){buffered.push(event);return;}handle(event);});
    const abort=()=>{void bridge.interrupt?.().catch(()=>{});finish(Object.assign(Error('출제 요청을 취소했습니다.'),{cancelled:true}));};
    const timer=setTimeout(()=>{void bridge.interrupt?.().catch(()=>{});finish(Error('AI 응답이 너무 오래 걸려 중단했습니다.'));},timeout);
    // 이미 취소된 요청은 차례를 보내지 않았으니 중단 요청도 보내지 않는다. 보내면 같은 문항의 새 요청을 끊었다(M25 나).
    if(signal?.aborted){finish(Object.assign(Error('출제 요청을 취소했습니다.'),{cancelled:true}));return;}signal?.addEventListener('abort',abort,{once:true});
    bridge.send(payload).then(r=>{onSent?.(r);turnId=r?.turnId||null;for(const e of buffered.splice(0))handle(e);}).catch(error=>finish(error));
  });
}
export function createAuthoringHarness({base=()=>window.fiveEDesktop||window.fiveEWebAI,evidence=fetchEvidence,turn=runTurn,log=()=>{}}={}){
  const bridges=new Map(),controllers=new Map();
  const bridgeFor=qid=>{const b=base();if(!b?.send)throw Error('AI 연결을 확인해 주세요. 5E 상단의 AI 연결에서 로그인한 뒤 다시 요청하세요.');const scope='exampool:'+String(qid).slice(0,80);if(!bridges.has(scope)||bridges.get(scope).base!==b)bridges.set(scope,{base:b,bridge:createTaskBridge(b,scope)});return bridges.get(scope).bridge;};
  async function request(packet,{requestId,onProgress}={}){
    const bridge=bridgeFor(packet.question?.id||'none'),controller=new AbortController();if(requestId)controllers.set(requestId,controller);
    const started=Date.now(),attempts=[];let found=[],errors=[],response=null,selection=null;
    try{
      // 11-22(결함 10·11): 차례를 보내기 전에 설치·로그인을 먼저 본다(AI 호출 없음). 로그인이 없으면 Codex가 「Reconnecting...」만 되풀이하며 몇 분을 끌었다.
      if(typeof bridge.status==='function'){const st=await bridge.status().catch(()=>null),login=st?.login??null;
        if(st&&(st.installed===false||login?.installed===false))throw Object.assign(Error(aiErrorText({code:'CODEX_NOT_FOUND'})),{code:'CODEX_NOT_FOUND'});
        if(login&&login.loggedIn===false)throw Object.assign(Error(aiErrorText({code:'CODEX_NOT_LOGGED_IN'})),{code:'CODEX_NOT_LOGGED_IN'});}
      selection=defaultAIModelSelection(await bridge.models().catch(error=>{throw Object.assign(Error(aiErrorText(error)),{code:aiErrorCode(error)||error?.code,cause:error});}));
      // 문항의 실제 그림을 함께 보낸다. 모두 보냈을 때만 '그림을 읽었다'고 표시한다(그림 축 통과의 조건).
      const figures=(packet.figures||[]).filter(f=>/^data:image\/(png|jpeg|webp);base64,/.test(f.data||'')).slice(0,6);
      var attachments=figures.map((f,i)=>({id:'figure-'+i,name:`${f.label||'그림'}.png`,data:f.data}));
      var figuresSeen=Boolean(packet.figureCount)&&figures.length===packet.figureCount;
      for(let round=1,retried=false,emptyRetried=false;round<=MAX_EVIDENCE_ROUNDS+1;){
        const text=buildAuthoringPrompt(packet,{evidence:found,round,errors});
        onProgress?.({stage:'turn',round});const t0=Date.now(),raw=await turn(bridge,{purpose:'chat',text,attachments,...selection,conversationId:null},{signal:controller.signal,onSent:r=>{if(r?.droppedAttachments)figuresSeen=false;},onRetry:info=>onProgress?.({stage:'reconnect',round,attempt:info.attempt,total:info.total})});
        const parsed=parseAuthoringResponse(raw);attempts.push({round,ms:Date.now()-t0,ok:parsed.ok,errors:parsed.errors||[]});log({round,ok:parsed.ok});
        if(!parsed.ok){if(retried)throw Object.assign(Error('AI 응답 형식이 계약과 맞지 않습니다: '+parsed.errors.join(' / ')),{raw:parsed.raw});retried=true;errors=parsed.errors;continue;}
        errors=[];response=parsed.value;
        const asks=(response.evidenceRequests||[]).filter(r=>!found.some(f=>f.query===r.query&&f.kind===r.kind));
        if(!asks.length||round>MAX_EVIDENCE_ROUNDS)break;
        let added=0;onProgress?.({stage:'evidence',round,count:asks.length});
        for(const ask of asks){const result=await evidence({kind:ask.kind,terms:String(ask.query).split(/[,·/]/).map(s=>s.trim()).filter(Boolean).slice(0,4),edition:ask.edition,sentence:ask.query,limit:4});
          found.push({kind:ask.kind,query:ask.query,marker:true,available:result.available,warning:result.warning});for(const e of result.results||[])if(!found.some(f=>f.ref===e.ref)){found.push(e);added++;}}
        // 검색에서 새 근거가 없으면, 「근거 확인 후 드리겠습니다」 같은 첫 답이 최종 답이 되지 않게 한 번만 다시 묻는다(M25 가).
        // 다시 쓸 때는 찾지 못한 검색이 표시되어 근거 없이 최종 답을 쓴다. 두 번째도 새 근거가 없으면 멈춘다(근거는 미확보로 남는다).
        if(!added){if(emptyRetried)break;emptyRetried=true;}
        round++;onProgress?.({stage:'rewrite',round});
      }
      const evidenceResults=found.filter(f=>f.ref);
      return {response,evidence:evidenceResults,searches:found.filter(f=>f.marker).map(({kind,query,available,warning})=>({kind,query,available,warning})),
        meta:{harness:HARNESS_VERSION,guidelines:GUIDELINES_VERSION,model:selection?.model,effort:selection?.effort,ms:Date.now()-started,attempts,live:true,figuresSeen,contentHash:packet.contentHash||null}};
    }catch(error){throw authoringError(error);}
    finally{if(requestId)controllers.delete(requestId);}
  }
  function cancel(requestId){const c=controllers.get(requestId);if(!c)return false;c.abort();return true;}
  return {request,cancel,version:HARNESS_VERSION};
}
