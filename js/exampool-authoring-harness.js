// ExamPool 출제 대화 하네스(5E 본창 쪽). 문항 시트(iframe)가 보낸 출제 요청을 기존 5E AI 연결로 실행한다.
// - 작업 범위는 문항마다 따로(exampool:<문항 ID>) 둔다. 5E 이미지 작업실의 대화 상태를 덮어쓰지 않는다.
// - 응답 JSON을 계약대로 검사하고, 형식이 틀리면 한 번 다시 묻는다. 모델이 근거를 요청하면 읽기 전용 검색을 한 뒤 다시 묻는다.
// - 결과를 문항에 쓰지 않는다. 문항 반영·버전·적용 여부는 시트가 정한다.
import {createTaskBridge} from './ai-task-workspaces.js?v=1.7.0-four-session-integration';
import {defaultAIModelSelection} from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import {parseAiEvent} from './ai-events.js?v=1.7.0-four-session-integration';
import {parseAuthoringResponse} from '/assets/exampool/authoring/contract.js';
import {buildAuthoringPrompt} from '/assets/exampool/authoring/prompt.js';
import {GUIDELINES_VERSION} from '/assets/exampool/authoring/guidelines.js';
export const HARNESS_VERSION='exampool-authoring-harness-1';
const MAX_EVIDENCE_ROUNDS=2,TURN_TIMEOUT=300000;
export async function fetchEvidence(request){
  const r=await fetch('/api/exampool-evidence',{method:'POST',headers:{'content-type':'application/json','x-5e-request':'1'},body:JSON.stringify(request)});
  if(r.status===404)return {available:false,results:[],warning:'이 실행 환경에는 근거 검색이 연결되어 있지 않습니다. 근거는 미확보로 남습니다.'};
  const body=await r.json().catch(()=>({}));if(!r.ok)return {available:false,results:[],warning:body.error||'근거 검색 실패'};return body;
}
// 한 차례 AI 요청: 최종 답 글이 오고 차례가 끝날 때까지 기다린다. 취소·시간 초과는 중단 요청을 보낸다.
function runTurn(bridge,payload,{signal,timeout=TURN_TIMEOUT,onSent}={}){
  return new Promise((resolve,reject)=>{
    let text='',turnId=null,done=false;const buffered=[];
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);off?.();signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const handle=event=>{if(turnId&&event.turnId&&event.turnId!==turnId)return;
      if(event.kind==='assistant'&&event.text)text=event.text;
      else if(event.kind==='error')finish(Error(event.text));
      else if(event.kind==='done')event.status==='completed'?finish(null,text):finish(Error(event.error||`AI 요청이 끝나지 못했습니다(${event.status}).`));};
    const off=bridge.onEvent?.(message=>{const event=parseAiEvent(message);if(event.kind==='ignore')return;if(!turnId){buffered.push(event);return;}handle(event);});
    const abort=()=>{void bridge.interrupt?.().catch(()=>{});finish(Object.assign(Error('출제 요청을 취소했습니다.'),{cancelled:true}));};
    const timer=setTimeout(()=>{void bridge.interrupt?.().catch(()=>{});finish(Error('AI 응답이 너무 오래 걸려 중단했습니다.'));},timeout);
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
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
      selection=defaultAIModelSelection(await bridge.models());
      // 문항의 실제 그림을 함께 보낸다. 모두 보냈을 때만 '그림을 읽었다'고 표시한다(그림 축 통과의 조건).
      const figures=(packet.figures||[]).filter(f=>/^data:image\/(png|jpeg|webp);base64,/.test(f.data||'')).slice(0,6);
      var attachments=figures.map((f,i)=>({id:'figure-'+i,name:`${f.label||'그림'}.png`,data:f.data}));
      var figuresSeen=Boolean(packet.figureCount)&&figures.length===packet.figureCount;
      for(let round=1,retried=false;round<=MAX_EVIDENCE_ROUNDS+1;){
        const text=buildAuthoringPrompt(packet,{evidence:found,round,errors});
        onProgress?.({stage:'turn',round});const t0=Date.now(),raw=await turn(bridge,{purpose:'chat',text,attachments,...selection,conversationId:null},{signal:controller.signal,onSent:r=>{if(r?.droppedAttachments)figuresSeen=false;}});
        const parsed=parseAuthoringResponse(raw);attempts.push({round,ms:Date.now()-t0,ok:parsed.ok,errors:parsed.errors||[]});log({round,ok:parsed.ok});
        if(!parsed.ok){if(retried)throw Object.assign(Error('AI 응답 형식이 계약과 맞지 않습니다: '+parsed.errors.join(' / ')),{raw:parsed.raw});retried=true;errors=parsed.errors;continue;}
        errors=[];response=parsed.value;
        const asks=(response.evidenceRequests||[]).filter(r=>!found.some(f=>f.query===r.query&&f.kind===r.kind));
        if(!asks.length||round>MAX_EVIDENCE_ROUNDS)break;
        let added=0;onProgress?.({stage:'evidence',round,count:asks.length});
        for(const ask of asks){const result=await evidence({kind:ask.kind,terms:String(ask.query).split(/[,·/]/).map(s=>s.trim()).filter(Boolean).slice(0,4),edition:ask.edition,sentence:ask.query,limit:4});
          found.push({kind:ask.kind,query:ask.query,marker:true,available:result.available,warning:result.warning});for(const e of result.results||[])if(!found.some(f=>f.ref===e.ref)){found.push(e);added++;}}
        // 검색에서 새 근거가 없으면 다시 묻지 않는다(같은 답을 다시 쓰게 될 뿐). 근거는 미확보로 남는다.
        if(!added)break;
        round++;onProgress?.({stage:'rewrite',round});
      }
      const evidenceResults=found.filter(f=>f.ref);
      return {response,evidence:evidenceResults,searches:found.filter(f=>f.marker).map(({kind,query,available,warning})=>({kind,query,available,warning})),
        meta:{harness:HARNESS_VERSION,guidelines:GUIDELINES_VERSION,model:selection?.model,effort:selection?.effort,ms:Date.now()-started,attempts,live:true,figuresSeen,contentHash:packet.contentHash||null}};
    }finally{if(requestId)controllers.delete(requestId);}
  }
  function cancel(requestId){const c=controllers.get(requestId);if(!c)return false;c.abort();return true;}
  return {request,cancel,version:HARNESS_VERSION};
}
