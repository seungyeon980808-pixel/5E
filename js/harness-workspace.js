// 1.8.0 출제 하네스(실험 설정) — 5E 본창 쪽. 넷째 덧창에 하네스 화면(assets/harness/)을 띄우고, AI·도구 요청을 잇는다.
// - 켜는 법: localStorage 「5e.harness」=「1」 또는 주소 ?harness=1. 꺼져 있으면 아무것도 하지 않는다(기존 화면 그대로).
// - AI: 문항 단위 출제·대화는 기존 출제 대화 엔진(exampool-authoring-harness)을 그대로 쓰고(JSON 계약·근거 검색·재시도),
//   시험지 대화·풀이 검사는 같은 연결로 한 차례(runTurn)씩 부른다. 결과를 문항에 쓰지 않는다 — 반영은 하네스 화면이 정한다.
// - 도구: image·exam·hwp는 기존 전환(fiveEAppSwitch)으로 열고, 하네스 사이드바는 왼쪽에 남긴다(시안 v8).
import {createTaskBridge} from './ai-task-workspaces.js?v=1.7.0-four-session-integration';
import {defaultAIModelSelection} from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import {runTurn,authoringError,fetchEvidence} from './exampool-authoring-harness.js?v=1.7.0-four-session-integration';
import {aiErrorText,aiErrorCode} from './ai-error-copy.js?v=1.7.0-four-session-integration';
import {getColorMode,setColorMode,nextColorMode} from './color-mode.js?v=1.7.0-four-session-integration';

const FLAG='5e.harness';
export function harnessEnabled(){try{if(new URLSearchParams(location.search).get('harness')==='1')return true;return localStorage.getItem(FLAG)==='1';}catch{return false;}}
const FILE_MODE=location.protocol==='file:',OWN=FILE_MODE?'*':location.origin;
const SIDE_W=224;

export function initHarness({doc=document}={}){
  if(!harnessEnabled()||doc.getElementById('harness-workspace'))return null;
  const win=doc.defaultView,root=doc.documentElement;
  const host=doc.createElement('section');host.id='harness-workspace';host.setAttribute('aria-label','5E 출제 하네스');
  host.style.cssText='position:fixed;inset:0;z-index:30001;display:flex;background:var(--ds-app,#0f141c)';
  // 이름표(title)는 마우스를 올릴 때마다 화면 아래에 「5E 출제 하네스」 말풍선으로 떴다(사용자 캡처 11-26) → 읽기 프로그램용 이름만 둔다.
  const frame=doc.createElement('iframe');frame.setAttribute('aria-label','5E 출제 하네스');frame.src='assets/harness/index.html?v=1.8.0-harness';frame.style.cssText='flex:1;border:0;width:100%;height:100%';
  host.append(frame);doc.body.append(host);
  // 도구를 열면 하네스는 사이드바 폭만 남기고, 도구 화면은 그 오른쪽으로 민다.
  const style=doc.createElement('style');style.id='harness-tool-style';
  style.textContent=`html.harness-tool #harness-workspace{right:auto!important;width:${SIDE_W}px}
html.harness-tool body>.app{margin-left:${SIDE_W}px!important;width:calc(100% - ${SIDE_W}px)!important}
html.harness-tool #exampool-sheet-workspace,html.harness-tool #rhwp-exam-workspace{left:${SIDE_W}px!important;margin-left:0!important;width:calc(100% - ${SIDE_W}px)!important}
#hx-crumb{position:fixed;left:${SIDE_W}px;top:0;width:192px;height:56px;z-index:30005;display:none;align-items:center;gap:6px;padding:0 12px 0 14px;box-sizing:border-box;font:13px/1 var(--ds-font,system-ui);color:var(--ds-ink-2,#aab);border-right:1px solid var(--ds-line,rgba(255,255,255,.08))}
html.harness-tool #hx-crumb{display:flex}
#hx-crumb button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:3px;min-width:0;border-radius:6px;padding:4px 6px;margin-left:-6px;color:var(--ds-ink-2,#aab)}
#hx-crumb button:hover{background:var(--ds-hover,rgba(255,255,255,.06));color:var(--ds-ink,#fff)}
#hx-crumb .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92px}
#hx-crumb .sl{color:var(--ds-ink-3,#778)}
#hx-crumb b{font:italic 700 17px/1 Georgia,serif;color:var(--ds-ink,#fff)}
.modal-overlay{z-index:30010!important}`;
  doc.head.append(style);
  const send=msg=>frame.contentWindow?.postMessage({channel:'5e-harness',...msg},OWN);
  const fromFrame=e=>e.source===frame.contentWindow&&(e.origin===win.location.origin||FILE_MODE)&&e.data?.channel==='5e-harness';
  // 시안 v7 「선생님」 메뉴: 화면 색 네 가지. 「시스템 따라가기」는 맥 설정이 어두우면 마지막으로 고른 어두운 색, 밝으면 화이트.
  const AUTO_KEY='5e.harness.colorAuto',DARK_KEY='5e.harness.colorDark';
  const store={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}}};
  const mq=win.matchMedia?.('(prefers-color-scheme: dark)');
  const colorPref=()=>store.get(AUTO_KEY)==='1'?'auto':getColorMode(root);
  const theme=()=>({theme:root.getAttribute('data-theme')||'dark',palette:root.getAttribute('data-palette')||'classic',pref:colorPref()});
  const applyAuto=()=>{if(store.get(AUTO_KEY)!=='1')return;const dark=store.get(DARK_KEY)||'navy';const want=mq?.matches===false?'white':dark;if(getColorMode(root)!==want)setColorMode(want);else send({action:'theme',...theme()});};
  mq?.addEventListener?.('change',applyAuto);applyAuto();
  const pickColor=mode=>{if(mode==='auto'){store.set(AUTO_KEY,'1');applyAuto();send({action:'theme',...theme()});return;}
    store.set(AUTO_KEY,null);if(mode!=='white')store.set(DARK_KEY,mode);setColorMode(mode);send({action:'theme',...theme()});};
  win.addEventListener('5e:color-mode-change',()=>send({action:'theme',...theme()}));

  // ── AI ──
  let authoringPromise,enginesPromise;
  // 11-25 밤샘: 출제 엔진을 처음 부를 때 인터넷이 끊겨 있으면 「Failed to fetch dynamically imported module …」 영어 원문이 문항 대화에 그대로 떴다.
const MODULE_FAIL='AI 출제 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 요청하세요. 입력한 내용은 그대로입니다.';
  const authoring=()=>window.fiveEAuthoringHarness?Promise.resolve(window.fiveEAuthoringHarness):authoringPromise||=import('./exampool-authoring-harness.js?v=1.7.0-four-session-integration').then(x=>x.createAuthoringHarness()).catch(error=>{authoringPromise=null;throw Object.assign(Error(MODULE_FAIL),{cause:error});});
  const engines=()=>enginesPromise||=(window.fiveEFigureEngines?Promise.resolve(window.fiveEFigureEngines):import('./exampool-figure-engines.js?v=1.7.0-four-session-integration').then(x=>x.createFigureEngines()));
  const base=()=>window.fiveEDesktop||window.fiveEWebAI;
  const bridges=new Map(),controllers=new Map();
  const bridgeFor=scope=>{const b=base();if(!b?.send)throw Object.assign(Error('AI 연결을 확인해 주세요. 상단 AI 연결에서 로그인한 뒤 다시 요청하세요.'),{code:'CODEX_NOT_LOGGED_IN'});
    const key='harness:'+String(scope).slice(0,80);if(!bridges.has(key)||bridges.get(key).base!==b)bridges.set(key,{base:b,bridge:createTaskBridge(b,key)});return bridges.get(key).bridge;};
  const need=error=>{const code=aiErrorCode(error)||error?.code;return code==='CODEX_NOT_FOUND'?'install':code==='CODEX_NOT_LOGGED_IN'?'login':'';};
  // 예외 시나리오: 「5E 상단의 AI 연결에서 로그인」이라 안내했지만 하네스가 그 막대를 가린다(막다른 안내) → exam처럼 연결 화면을 바로 열고,
  // 하네스는 사이드바 폭으로 줄여 연결 창이 보이게 한다. 연결되면 하네스로 돌아와 같은 말을 이어서 보낸다.
  let resumeSeq=0;
  function openConnection(){if(!(window.fiveEDesktop&&!window.fiveEDesktop.web))return false;const seq=++resumeSeq;root.classList.add('harness-tool');
    win.dispatchEvent(new CustomEvent('5e:web-login-request',{detail:{resumeAi:()=>{if(seq!==resumeSeq)return;closeTool();send({action:'resume'});}}}));return true;}
  // 한 차례: 프롬프트 글 → 답 글. model을 주면 그 모델로(풀이 검사의 두 모델).
  async function turn({scope,text,model,effort,requestId,attachments=[]}){
    const bridge=bridgeFor(scope),controller=new AbortController();if(requestId)controllers.set(requestId,controller);const t0=Date.now();
    try{
      if(typeof bridge.status==='function'){const st=await bridge.status().catch(()=>null);if(st?.login?.loggedIn===false)throw Object.assign(Error(aiErrorText({code:'CODEX_NOT_LOGGED_IN'})),{code:'CODEX_NOT_LOGGED_IN'});}
      const list=await bridge.models();let selection=defaultAIModelSelection(list);
      if(model){const m=(list?.data||list||[]).find?.(x=>x.model===model||x.id===model);if(m)selection={...selection,model:m.model||m.id,effort:effort||m.defaultReasoningEffort||selection.effort};}
      const files=(attachments||[]).filter(f=>/^data:image\/(png|jpeg|webp);base64,/.test(f?.data||'')).slice(0,6).map((f,i)=>({id:'att-'+i,name:String(f.name||`그림 ${i+1}.png`).slice(0,80),data:f.data}));
      const raw=await runTurn(bridge,{purpose:'chat',text,attachments:files,...selection,conversationId:null},{signal:controller.signal});
      return {text:raw,model:selection.model,ms:Date.now()-t0};
    }catch(error){throw authoringError(error);}finally{if(requestId)controllers.delete(requestId);}
  }
  win.addEventListener('message',async e=>{
    if(!fromFrame(e))return;const m=e.data;
    if(m.action==='ready'){send({action:'theme',...theme(),desktop:!!window.fiveEDesktop});return;}
    if(m.action==='turn'){try{send({action:'turn-ready',requestId:m.requestId,result:await turn(m)});}catch(error){const n=need(error);send({action:'turn-ready',requestId:m.requestId,error:error.message,cancelled:!!error.cancelled,need:n,opened:n?openConnection():false});}return;}
    if(m.action==='author'){try{const h=await authoring();const result=await h.request(m.packet,{requestId:m.requestId,onProgress:p=>send({action:'author-progress',requestId:m.requestId,progress:p})});send({action:'author-ready',requestId:m.requestId,result});}
      catch(error){const n=need(error);send({action:'author-ready',requestId:m.requestId,error:error.message||String(error),cancelled:!!error.cancelled,need:n,opened:n?openConnection():false});}return;}
    if(m.action==='evidence'){try{send({action:'evidence-ready',requestId:m.requestId,result:await fetchEvidence(m.request)});}catch(error){send({action:'evidence-ready',requestId:m.requestId,result:{available:false,results:[],warning:error.message}});}return;}
    if(m.action==='cancel'){controllers.get(m.requestId)?.abort();try{(await authoring()).cancel(m.requestId);}catch{}return;}
    if(m.action==='figure'){try{const en=await engines();const r=m.kind==='graph'?await en.graph({description:m.description,mustNot:m.mustNot||[]}):await en.image({qid:m.qid,description:m.description,mustNot:m.mustNot||[]});
        send({action:'figure-ready',requestId:m.requestId,result:{data:r.data,width:r.width,height:r.height,engine:r.engine||null,ms:r.ms||null}});}
      catch(error){send({action:'figure-ready',requestId:m.requestId,error:aiErrorText(error)});}return;}
    if(m.action==='color-mode'){pickColor(m.mode==='next'?(colorPref()==='auto'?'navy':nextColorMode(getColorMode(root))):m.mode);return;}
    // 설정(⌘,)·키보드 단축키: 본창의 원래 창을 그대로 연다(하네스 위로 뜨게 .modal-overlay를 올려 둠).
    if(m.action==='settings'){doc.getElementById(m.which==='shortcuts'?'open-shortcuts':'open-screen')?.click();return;}
    if(m.action==='crumb'){crumbTitle=String(m.title||'5E').slice(0,80);if(tool)paintCrumb();return;}
    if(m.action==='tool'){openTool(m.tool);return;}
    if(m.action==='home'){closeTool();return;}
    if(m.action==='open-project'){win.dispatchEvent(new CustomEvent('5e:project-open',{detail:{name:String(m.name||'시험지.5e'),bytes:new Uint8Array(m.bytes)}}));openTool('exam',{already:true});return;}
    if(m.action==='library'){try{const {openPdfReferencePicker}=await import('./pdf-library/reference-picker.js?v=1.7.0-four-session-integration');openTool('image',{silent:true});
        await openPdfReferencePicker({onAdd:r=>{send({action:'library-picked',items:[{data:r.dataUrl||r.src,name:String(r.name||'라이브러리 자료').slice(0,200)}]});closeTool();return ['harness'];},onAddMany:list=>{send({action:'library-picked',items:list.map(r=>({data:r.dataUrl||r.src,name:String(r.name||'').slice(0,200)}))});closeTool();return list.map(()=>'harness');},onStatus:()=>{},onClose:()=>closeTool(),bindClose:()=>{}});}
      catch(error){send({action:'library-picked',items:[],error:error.message});closeTool();}return;}
  });
  // ── 도구 오가기 ──
  let tool=null,crumbTitle='5E';
  const crumb=doc.createElement('div');crumb.id='hx-crumb';crumb.innerHTML='<button type="button" title="시험지로 돌아가기  ⌥⌘0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg><span class="t"></span></button><span class="sl">/</span><b></b>';doc.body.append(crumb);
  const paintCrumb=()=>{crumb.querySelector('.t').textContent=crumbTitle||'5E';crumb.querySelector('b').textContent=tool||'';const hd=doc.querySelector('.app-shell-header');crumb.style.background=(hd&&getComputedStyle(hd).backgroundColor)||'var(--ds-bar,#0d1117)';};
  crumb.querySelector('button').onclick=()=>{closeTool();send({action:'tool-back'});frame.contentWindow?.focus();};
  win.addEventListener('5e:color-mode-change',()=>setTimeout(paintCrumb,50));
  function openTool(name,{silent=false,already=false}={}){
    if(!['image','exam','hwp'].includes(name))return;tool=name;root.classList.add('harness-tool');paintCrumb();
    if(!already&&name!=='image')win.fiveEAppSwitch?.(name);
    if(name==='image')win.fiveEAppSwitch?.('image');
    if(!silent)send({action:'tool-opened',tool:name});
    setTimeout(hookFrames,1500);setTimeout(hookFrames,6000);
  }
  function closeTool(){tool=null;root.classList.remove('harness-tool');send({action:'tool-closed'});}
  // ⌥⌘0: 하네스 첫 화면으로
  const homeKey=e=>{if((e.metaKey||e.ctrlKey)&&e.altKey&&e.code==='Digit0'){e.preventDefault();closeTool();frame.contentWindow?.focus();}};
  doc.addEventListener('keydown',homeKey);
  // 11-25 완주 1: exam·hwp 칸(iframe) 안에 포커스가 있으면 ⌥⌘0이 본창까지 오지 않아 하네스로 못 돌아왔다 → 도구 칸 문서에도 단다(같은 출처만).
  const hooked=new WeakSet();const hookFrames=()=>{for(const f of doc.querySelectorAll('#exampool-sheet-workspace iframe,#rhwp-exam-workspace iframe')){try{const d=f.contentDocument;if(d&&!hooked.has(d)){hooked.add(d);d.addEventListener('keydown',homeKey);}}catch{}}};
  win.fiveEHarness={open:()=>{closeTool();host.hidden=false;},frame};
  return {host,frame};
}
