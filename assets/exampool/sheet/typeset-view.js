// Chrome and camera changes belong to the view, never the HWPX document.
export function attachTypesetView(bridge,host){
  const panel=host.parentElement,doc=bridge.editor.element.contentDocument;
  const detail=panel.querySelector('#typeset-detail'),expand=panel.querySelector('#typeset-expand');
  const context=panel.querySelector('#typeset-context'),options=panel.querySelector('#typeset-options');
  let detailed=false,interacted=false,frame=0;
  // 조판 안내 줄(용지 높이 자동 조절·본문 폭·문항 길이)은 늘 펼쳐 둘 필요가 없어 ⓘ 단추에 마우스를 올리거나 누르면 보인다.
  // 오류(조판 저장 막힘 등)나 출력 기준을 넘었을 때만 줄을 그대로 보인다(office-layout.css).
  {const controls=panel.querySelector('.typeset-view-controls'),status=panel.querySelector('#typeset-status'),metrics=panel.querySelector('#typeset-metrics');
   if(controls&&status&&!controls.querySelector('#typeset-info-btn')){
     const wrap=document.createElement('span');wrap.className='typeset-info-wrap';
     wrap.innerHTML='<button type="button" id="typeset-info-btn" aria-label="조판 정보" aria-expanded="false" aria-describedby="typeset-info-pop">i</button><span id="typeset-info-pop" role="tooltip" hidden></span>';
     controls.append(wrap);const btn=wrap.firstChild,pop=wrap.lastChild;
     const fill=()=>{pop.replaceChildren();for(const n of [status,metrics]){const s=(n?.textContent||'').trim();if(!s)continue;const line=document.createElement('span');line.textContent=s;if(n.dataset.error==='true'||n.dataset.exceeded==='true')line.className='warn';pop.append(line);}
       btn.dataset.warn=String(status.dataset.error==='true'||metrics?.dataset.exceeded==='true');};
     const show=v=>{fill();pop.hidden=!v;btn.setAttribute('aria-expanded',String(v));};
     btn.addEventListener('mouseenter',()=>show(true));btn.addEventListener('mouseleave',()=>show(false));
     btn.addEventListener('focus',()=>show(true));btn.addEventListener('blur',()=>show(false));
     btn.addEventListener('click',()=>show(pop.hidden));
     new MutationObserver(()=>{fill();}).observe(panel.querySelector('.typeset-info'),{subtree:true,childList:true,characterData:true,attributes:true});fill();}}
  const style=doc.createElement('style');
  style.textContent=`
    body[data-question-compact] #menu-bar,
    body[data-question-compact] #icon-toolbar,
    body[data-question-compact] #style-bar,
    body[data-question-compact] #status-bar,
    body[data-question-compact] #h-ruler,
    body[data-question-compact] #v-ruler,
    body[data-question-compact] #ruler-corner{display:none!important}
    body[data-question-compact] #editor-area{grid-template-rows:minmax(0,1fr);grid-template-columns:minmax(0,1fr)}
    body[data-question-compact] #scroll-container{grid-area:1 / 1;background:#edf0ed}
    /* 미리보기 칸 안 한글 창(수식 편집 등)도 ExamPool 팝업 규칙: 창 12px·단추 6px 모서리, 「확인」은 카드의 은은한 파란 단추와 같은 색 */
    .dialog-wrap{border-radius:12px!important;overflow:hidden;border-color:#d8dde3!important;box-shadow:0 12px 32px rgba(16,20,26,.22)!important}
    .dialog-title{border-radius:12px 12px 0 0}
    .dialog-btn{border-radius:6px!important;min-height:30px}
    .dialog-btn-primary{background:#eaf2fd!important;color:#1a5fb4!important;border-color:transparent!important;box-shadow:inset 0 0 0 1px #2f6fd6!important}
    .dialog-btn-primary:hover{background:#dde9fb!important}
    .dialog-wrap{max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto}
  `;
  doc.head.append(style);
  // 확대하지 않은 동안은 종이를 칸 폭에 맞춰 좌우로 움직일 것이 없게 한다(「상세 조판」에서도).
  // - 칸 폭은 세로 스크롤 막대를 뺀 실제 보이는 폭(#scroll-container clientWidth).
  // - 한글 엔진은 한 쪽 보기에서 내용 폭을 「종이 폭 + 40px」로 잡으므로 44px을 남기고 맞춘다.
  // - 엔진은 배율이 바뀔 때만 내용 폭을 다시 재므로, 종이가 다 읽히기 전에 맞춘 배율이 그대로면 옛 폭이 남아
  //   좌우로 밀렸다. 내용 폭이 칸보다 넓으면 배율을 한 번 흔들어 다시 재게 한다.
  // - 사용자가 직접 확대·축소하면(마지막으로 맞춘 배율과 다르면) 그 배율을 지키고, 그때는 좌우로 움직일 수 있다.
  //   새 문항을 열면(refresh) 다시 폭 맞춤.
  let fitted=null;
  function fit(){
    frame=0;if(panel.hidden||!bridge.wasm.doc||!host.clientWidth)return;
    const raw=bridge.wasm.borrowDocumentHandle().getPageDef(0),page=typeof raw==='string'?JSON.parse(raw):raw;
    const manager=bridge.input?.viewportManager;if(!manager)return;
    // Keep the native zoom coordinate system, caret and hit testing together.
    if(fitted!==null&&Math.abs(manager.getZoom()-fitted)>.002)return;// 사용자가 직접 바꾼 배율은 지킨다
    const view=doc.querySelector('#scroll-container')?.clientWidth||host.clientWidth;
    const next=Math.min(1.4,Math.max(.25,(view-44)/(page.width/75)));
    const content=doc.querySelector('#scroll-content'),stale=!!content&&content.offsetWidth>view+1;
    if(Math.abs(manager.getZoom()-next)>.002||stale){if(stale&&Math.abs(manager.getZoom()-next)<=.002)manager.setZoom(next+.01,{x:.5,y:0},'none');manager.setZoom(next,{x:.5,y:0},'none');}
    fitted=manager.getZoom();
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};
  function selection(){
    const cursor=bridge.input?.cursor,inTable=!!(cursor?.isInCell()||cursor?.isInTableObjectSelection());
    // 도구 줄이 나타났다 사라지면 종이가 위아래로 밀렸다 — 칸에 붙은 미리보기에서는 자리를 늘 두고, 고르기 전에는 흐리게만.
    context.hidden=!interacted&&!panel.classList.contains('docked');context.toggleAttribute('data-idle',!interacted);
    const char=context.querySelector('[data-native-format="char"]');
    char.disabled=!bridge.input?.getSelection();char.title='글자를 드래그하여 선택한 뒤 크기·자간·글꼴 조절';
    panel.querySelector('#typeset-table-tools').hidden=!inTable;

  }
  function setDetail(value){
    detailed=value;doc.body.toggleAttribute('data-question-compact',!value);
    detail.setAttribute('aria-pressed',String(value));detail.textContent=value?'접기':'상세 조판';options.hidden=!value;
    schedule();
  }
  detail.onclick=()=>setDetail(!detailed);
  expand.onclick=()=>{const value=panel.dataset.expanded!=='true';panel.dataset.expanded=String(value);expand.setAttribute('aria-pressed',String(value));expand.textContent=value?'시트 옆으로':'크게 보기';schedule();};
  context.querySelectorAll('[data-native-format]').forEach(button=>{
    button.addEventListener('pointerdown',e=>e.preventDefault());
    button.onclick=async()=>{
      const command=button.dataset.nativeFormat==='char'?'format:char-shape':'format:para-shape';
      try{const result=await bridge.editor.commands.execute(command,undefined,{allowDialog:true});if(result?.ok===false)throw Error(result.message||'글이나 문단을 선택한 뒤 다시 시도하세요.');}catch(e){const status=panel.querySelector('#typeset-status');status.textContent=e.message;status.dataset.error='true';}
    };
  });
  doc.addEventListener('pointerup',()=>{interacted=true;selection();});
  doc.addEventListener('keyup',()=>{interacted=true;selection();});
  for(const event of ['cursor-cell-changed','cursor-para-changed','table-object-selection-changed','picture-object-selection-changed'])bridge.deps.eventBus.on(event,selection);
  const observer=new ResizeObserver(schedule);observer.observe(host);
  // 종이가 다 읽힌 뒤에도 한 번 더 맞춘다(읽히기 전에 맞춘 폭이 남지 않게).
  for(const name of ['document-view-loaded','document-layout-refreshed'])bridge.deps?.eventBus?.on?.(name,schedule);
  setDetail(false);
  return {refresh(){interacted=false;context.hidden=!panel.classList.contains('docked');context.toggleAttribute('data-idle',true);fitted=null;schedule();},fit:schedule};
}
