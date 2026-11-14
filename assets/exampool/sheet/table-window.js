// 11-15(사용자: 너무 크지 않은 작은 한글 창으로 표 편집기): 문항 카드 표의 연필·누르기·표 만들기, 미리보기 표의 표 모양 명령에서 뜬다.
// 창 안은 조판 미리보기와 같은 한글 엔진(rhwp)이고 이 표 하나만 문항 조판 때와 같은 폭으로 쪽 가득 보인다. 한글 메뉴 줄·글자 모양 줄·단축키를 그대로 쓴다.
// (엔진이 표 안의 표는 줄·칸 넣기·합치기를 바깥 틀 표에 적용해, 미리보기에서 바로 하지 않고 표만 따로 연다.)
// 「완료」(⌘Enter)면 표를 읽어(table-read.js) 카드 표 자료로 바꾼다 — 카드 ⌘Z 한 번으로 되돌림. 「취소」는 고친 것을 버린다.
import {RhwpExamBridge} from '../../../js/rhwp-exam-bridge.js?v=1.7.0-four-session-integration';
import {snapshotTable,tableFromSnapshot} from './table-read.js';

const CSS=`
.tw-ov{position:fixed;inset:0;z-index:1400;background:rgba(13,17,23,.38);display:grid;place-items:center;opacity:0;transition:opacity .16s ease}
.tw-ov.show{opacity:1}
.tw-win{width:min(760px,calc(100vw - 48px));height:min(600px,calc(100vh - 48px));background:#fff;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;transform:translateY(8px) scale(.985);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.tw-ov.show .tw-win{transform:none}
.tw-hd{height:46px;flex:none;display:flex;align-items:center;gap:10px;padding:0 10px 0 16px;background:#0d1117;color:#e6edf3;font-size:14px}
.tw-hd b{font-weight:700}.tw-hd small{color:#8b949e;font-size:12.5px}.tw-hd .sp{flex:1}
.tw-hd button{height:30px;border:0;border-radius:6px;padding:0 14px;background:#21262d;color:#c9d1d9;font:inherit;font-size:13px;cursor:pointer}
.tw-hd button:hover{background:#30363d}.tw-hd button.pri{background:#2f6fd6;color:#fff}.tw-hd button.pri:hover{background:#2a62bf}
.tw-hd button:disabled{opacity:.5;cursor:default}
.tw-body{flex:1;min-height:0;position:relative;background:#e9ebee}
.tw-host{position:absolute;inset:0}.tw-host iframe{width:100%;height:100%;border:0;display:block}
.tw-wait{position:absolute;inset:0;display:grid;place-items:center;color:#57606a;font-size:13px;background:#f3f4f6}
.tw-ft{height:32px;flex:none;display:flex;align-items:center;gap:14px;padding:0 14px;border-top:1px solid #e6e9ed;font-size:12px;color:#57606a;overflow:hidden;white-space:nowrap}
.tw-ft kbd{font:600 11px -apple-system,sans-serif;background:#f0f2f4;border:1px solid #d0d7de;border-radius:4px;padding:1px 5px;margin-right:3px}
.tw-ft .err{color:#cf222e}
@media (prefers-reduced-motion:reduce){.tw-ov,.tw-win{transition:none}}`;

let busy=false;
const mac=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'');
const mod=mac?'⌘':'Ctrl';

// open({title,load:()=>Promise<{bytes}>,base:카드 표,apply:newTable=>boolean,status})
export async function openTableWindow({title,load,base,apply,status}){
  if(busy)return;busy=true;
  if(!document.getElementById('tw-style')){const s=document.createElement('style');s.id='tw-style';s.textContent=CSS;document.head.append(s);}
  const ov=document.createElement('div');ov.className='tw-ov';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label',`표 편집 · ${title}`);
  ov.innerHTML=`<div class="tw-win"><div class="tw-hd"><b>표 편집</b><small>${title.replace(/[<>&]/g,'')} · 한글처럼 고칩니다</small><span class="sp"></span><button type="button" data-tw="cancel" title="고친 것을 버리고 닫기">취소</button><button type="button" class="pri" data-tw="done" title="${mod}Enter" disabled>완료 ${mod}Enter</button></div>
    <div class="tw-body"><div class="tw-host"></div><div class="tw-wait">표를 한글 문서로 여는 중…</div></div>
    <div class="tw-ft"><span><kbd>F5</kbd>칸 고르기</span><span><kbd>M</kbd>합치기</span><span><kbd>S</kbd>나누기</span><span><kbd>${mod}</kbd><kbd>↑↓←→</kbd>칸 크기</span><span><kbd>$</kbd>…<kbd>$</kbd> 수식</span><span>줄·칸 넣기·칸 색은 「표」 메뉴</span><span class="err" hidden></span></div></div>`;
  document.body.append(ov);requestAnimationFrame(()=>ov.classList.add('show'));
  const host=ov.querySelector('.tw-host'),wait=ov.querySelector('.tw-wait'),doneBtn=ov.querySelector('[data-tw="done"]'),err=ov.querySelector('.tw-ft .err');
  const fail=m=>{err.hidden=false;err.textContent=m;};
  let bridge=null,before=null,changed=false,closed=false;
  const close=()=>{if(closed)return;closed=true;busy=false;ov.classList.remove('show');setTimeout(()=>{try{bridge?.editor?.destroy?.();}catch{}ov.remove();},170);removeEventListener('keydown',key,true);};
  const finish=()=>{if(!bridge||!before)return;let next;
    try{next=tableFromSnapshot(base,before,snapshotTable(bridge.wasm.borrowDocumentHandle()));}catch(e){fail(e.message);return;}
    if(apply(next)!==false)close();};
  const cancel=()=>{if(changed&&!confirm('표에서 고친 것을 버리고 닫을까요?'))return;close();};
  function key(e){if(closed)return;if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.stopPropagation();finish();}}
  addEventListener('keydown',key,true);
  ov.addEventListener('click',e=>{const k=e.target.closest('[data-tw]')?.dataset.tw;if(k==='done')finish();else if(k==='cancel')cancel();});
  try{
    const [{bytes},b]=await Promise.all([load(),RhwpExamBridge.create(host,{showEditingBorders:true,tableLayoutLocked:false,onChange:error=>{if(error){fail(error.message);return;}if(before)changed=true;}})]);
    bridge=b;if(closed)return;
    // 새 엔진 창은 빈 문서를 먼저 연 뒤에야 다른 문서를 불러올 수 있다(조판 미리보기와 같은 순서).
    await bridge.newDocument();await bridge.load(bytes,'표 편집.hwpx');
    const doc=bridge.editor.element.contentDocument;
    // 작은 창: 한글 메뉴 줄·글자 모양 줄만 남기고 큰 도구 그림 줄·자·상태 줄은 숨긴다.
    {const st=doc.createElement('style');st.textContent=`#icon-toolbar,#h-ruler,#v-ruler,#ruler-corner,#status-bar{display:none!important}
      #editor-area{grid-template-rows:minmax(0,1fr)!important;grid-template-columns:minmax(0,1fr)!important}#scroll-container{grid-area:1 / 1!important;background:#e9ebee}
      .dialog-wrap{border-radius:12px!important;overflow:hidden}.dialog-btn{border-radius:6px!important}`;doc.head.append(st);}
    // 창 안에서도 ⌘Enter = 완료(엔진 안 키는 바깥으로 올라오지 않는다).
    doc.addEventListener('keydown',key,true);
    // 표를 한눈에: 종이 폭을 창 폭에 맞춘다.
    // 표를 크게: 쪽(표 폭 + 좁은 여백)을 창 폭에 맞춘다. 엔진이 불러온 뒤 한 번 더 제 배율을 잡으므로 잠시 뒤 맞춘다.
    const fitZoom=()=>{try{const raw=bridge.wasm.borrowDocumentHandle().getPageDef(0),page=typeof raw==='string'?JSON.parse(raw):raw,m=bridge.input?.viewportManager,view=doc.querySelector('#scroll-container')?.clientWidth||host.clientWidth;
      if(m&&page?.width)m.setZoom(Math.min(2,Math.max(.5,(view-60)/(page.width/75))),{x:.5,y:0},'none');}catch{}};
    await new Promise(r=>setTimeout(r,250));fitZoom();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));fitZoom();
    before=snapshotTable(bridge.wasm.borrowDocumentHandle());
    // 커서를 첫 칸에 둔다.
    try{bridge.input.cursor.moveTo?.({sectionIndex:0,paragraphIndex:0,charOffset:0});}catch{}
    wait.remove();doneBtn.disabled=false;
    try{bridge.editor.element.focus();bridge.editor.element.contentWindow.focus();}catch{}
  }catch(e){console.error("[표 편집 창]",e);wait.textContent=`표를 열지 못했습니다: ${e.message}`;status?.(`표 편집 창을 열지 못했습니다: ${e.message}`,true);busy=false;}
}
