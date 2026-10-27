// ExamPool 문항의 그림·그래프 만들기(5E 본창 쪽). 기존 엔진을 그대로 부른다.
// - 그래프: 설명 그래프 엔진(그래프 생성 탭과 같은 계약) → 편집 가능한 그래프 객체(수식·데이터·축·범위) + PNG.
// - 그림: 시험용 한 줄 설명 하네스(이미지 생성 탭과 같은 지침) → 비트맵 PNG. 편집 가능한 벡터가 아니다.
// 작업 범위는 문항마다 따로 둔다. 5E 이미지 작업실의 작업을 덮어쓰지 않는다.
import {createTaskBridge} from './ai-task-workspaces.js?v=1.7.0-four-session-integration';
import {defaultAIModelSelection} from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import {parseAiEvent} from './ai-events.js?v=1.7.0-four-session-integration';
import {graphDescriptionSource,prepareGraphDescriptionPlan} from './graph/description-contract.js?v=1.7.0-four-session-integration';
import {createGraphReconstructionWorkflow} from './graph/reconstruction-workflow.js?v=1.7.0-four-session-integration';
import {GRAPH_WORKBENCH_SELECTION,validateWorkbenchGraph,buildWorkbenchGraph,workbenchGraphDataUrl,editWorkbenchGraph} from './graph/workbench-result.js?v=1.7.0-four-session-integration';
import {buildExamBriefPrompt} from './ai-exam-brief.js?v=1.7.0-four-session-integration';
const IMAGE_TIMEOUT=300000;
// 그래프 렌더러는 SVG를 준다. 문항 그림 칸·엑셀·한글은 PNG를 쓰므로 인쇄용으로 3배 해상도 PNG로 바꾼다.
async function svgToPng(svg,width,height,scale=3){const i=new Image();i.src=svg;await i.decode();const c=document.createElement('canvas');c.width=Math.round(width*scale);c.height=Math.round(height*scale);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(i,0,0,c.width,c.height);return {data:c.toDataURL('image/png'),width:c.width,height:c.height};}
const sizeOf=data=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>resolve({width:null,height:null});i.src=data;});
export function createFigureEngines({base=()=>window.fiveEDesktop||window.fiveEWebAI}={}){
  const bridge=(kind,qid)=>{const b=base();if(!b?.send)throw Error('AI 연결을 확인해 주세요.');return createTaskBridge(b,`exampool-${kind}:${String(qid).slice(0,80)}`);};
  // 설명 → 그래프. prior가 있으면 그 그래프를 기준으로 고친다(기존 수식·수동 편집을 함께 보낸다).
  async function graph({qid,description,prior=null}){
    const t0=Date.now(),b=bridge('graph',qid);
    const workflow=createGraphReconstructionWorkflow({transport:{send:p=>b.send(p),interrupt:x=>b.interrupt?.(x)}});
    const off=b.onEvent?.(event=>workflow.handleEvent(event));
    try{
      const catalog=await b.models(),priorPlan=prior?.plan||null,priorObjects=prior?.objects||null;
      const source=await graphDescriptionSource(description,priorPlan,priorObjects);
      const restored=await workflow.analyze({source,selection:GRAPH_WORKBENCH_SELECTION,catalog,description,priorPlan,priorObjects});
      if(restored.blocked)throw Error('그래프 검증에 막혔습니다: '+(restored.quality?.issues?.filter(i=>i.severity==='critical').map(i=>i.message).join(' / ')||'확인하지 못한 축 또는 계열이 있습니다.'));
      const result=buildWorkbenchGraph(prepareGraphDescriptionPlan(restored.plan),source,{descriptionLayout:true,priorResult:prior||null,...(prior?{request:description}:{})});
      result.description={request:description,qualitative:restored.plan.coordinateMode==='observed'};
      const png=await svgToPng(await workbenchGraphDataUrl(result),result.source.width,result.source.height);
      return {...png,graph:result,engine:'native-graph',model:GRAPH_WORKBENCH_SELECTION.model,ms:Date.now()-t0,issues:(result.quality?.issues||[]).map(i=>i.message).slice(0,8)};
    }finally{off?.();}
  }
  // 그래프 세부 편집(5E 그래프 편집기). 적용하면 새 그래프 객체와 PNG를 돌려준다.
  function editGraph(result){
    validateWorkbenchGraph(result);
    return new Promise((resolve,reject)=>{let done=false;
      editWorkbenchGraph(result,{onApply:async edited=>{done=true;try{resolve({...await svgToPng(await workbenchGraphDataUrl(edited),edited.source.width,edited.source.height),graph:edited,engine:'native-graph'});}catch(e){reject(e);}},onClose:()=>{if(!done)resolve(null);}});});
  }
  // 한 줄 설명 → 시험용 흑백 그림. prior(이전 결과 PNG)가 있으면 그 그림을 고친다.
  async function image({qid,description,mustNot=[],prior=null}){
    const t0=Date.now(),b=bridge('image',qid),selection=defaultAIModelSelection(await b.models());
    const request=[description,mustNot.length?`그리지 말 것: ${mustNot.join(', ')}`:''].filter(Boolean).join('\n');
    const text=buildExamBriefPrompt({request,revision:Boolean(prior)});
    const attachments=prior?[{id:'prior',name:'이전 결과.png',data:prior,role:'revision'}]:[];
    return new Promise((resolve,reject)=>{
      let turnId=null,src=null,done=false;const queue=[];
      const finish=(e,v)=>{if(done)return;done=true;clearTimeout(timer);off?.();e?reject(e):resolve(v);};
      const handle=async ev=>{if(turnId&&ev.turnId&&ev.turnId!==turnId)return;
        if(ev.kind==='image'&&ev.src)src=ev.src;
        else if(ev.kind==='error')finish(Error(ev.text));
        // 데스크톱 앱은 그림이 나오면 「interrupted」나 끝 확인(finalization)만 보낸다 — 그림을 받았으면 성공으로 받는다(H13, ai-panel과 같은 규칙).
        else if(ev.kind==='done'||(ev.kind==='finalization'&&['confirmed','recovered'].includes(ev.state)&&src)){if(ev.kind==='done'&&!(ev.status==='completed'||ev.status==='interrupted'&&src))return finish(Error(ev.error||'그림 만들기가 끝나지 못했습니다.'));if(!src)return finish(Error('그림 결과를 받지 못했습니다.'));
          if(!/^data:image\/png;base64,/.test(src))return finish(Error('PNG가 아닌 결과는 문항에 넣지 않습니다.'));
          finish(null,{data:src,...await sizeOf(src),engine:'ai-image',model:selection.model,ms:Date.now()-t0});}};
      const off=b.onEvent?.(m=>{const ev=parseAiEvent(m);if(ev.kind==='ignore')return;if(!turnId){queue.push(ev);return;}void handle(ev);});
      const timer=setTimeout(()=>{void b.interrupt?.().catch(()=>{});finish(Error('이미지 생성이 너무 오래 걸려 중단했습니다.'));},IMAGE_TIMEOUT);
      b.send({text,attachments,purpose:'image',ephemeralRender:true,conversationId:null,...selection}).then(r=>{turnId=r?.turnId||null;for(const ev of queue.splice(0))void handle(ev);}).catch(e=>finish(e));
    });
  }
  return {graph,editGraph,image};
}
