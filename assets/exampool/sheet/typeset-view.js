// Chrome and camera changes belong to the view, never the HWPX document.
export function attachTypesetView(bridge,host){
  const panel=host.parentElement,doc=bridge.editor.element.contentDocument;
  const detail=panel.querySelector('#typeset-detail'),expand=panel.querySelector('#typeset-expand');
  const context=panel.querySelector('#typeset-context'),options=panel.querySelector('#typeset-options');
  let detailed=false,interacted=false,frame=0;
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
    #scroll-container{overflow-x:hidden!important}
    /* 미리보기 칸 안 한글 창(수식 편집 등)도 ExamPool 팝업 규칙: 창 12px·단추 6px 모서리, 「확인」은 카드의 은은한 파란 단추와 같은 색 */
    .dialog-wrap{border-radius:12px!important;overflow:hidden;border-color:#d8dde3!important;box-shadow:0 12px 32px rgba(16,20,26,.22)!important}
    .dialog-title{border-radius:12px 12px 0 0}
    .dialog-btn{border-radius:6px!important;min-height:30px}
    .dialog-btn-primary{background:#eaf2fd!important;color:#1a5fb4!important;border-color:transparent!important;box-shadow:inset 0 0 0 1px #2f6fd6!important}
    .dialog-btn-primary:hover{background:#dde9fb!important}
    .dialog-wrap{max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto}
  `;
  doc.head.append(style);
  function fit(){
    // 미리보기 칸에서는 「상세 조판」을 열어도 종이를 칸 폭에 맞춘다 — 맞추지 않으면 종이가 칸보다 넓어 좌우로 밀렸다.
    // 칸 폭은 세로 스크롤 막대를 뺀 실제 보이는 폭(#scroll-container clientWidth)으로 잰다.
    frame=0;if(panel.hidden||!bridge.wasm.doc||!host.clientWidth)return;
    const raw=bridge.wasm.borrowDocumentHandle().getPageDef(0),page=typeof raw==='string'?JSON.parse(raw):raw;
    const manager=bridge.input?.viewportManager;if(!manager)return;
    // Keep the native zoom coordinate system, caret and hit testing together.
    const view=doc.querySelector('#scroll-container')?.clientWidth||host.clientWidth;
    const next=Math.min(1.4,Math.max(.25,(view-28)/(page.width/75)));
    if(Math.abs(manager.getZoom()-next)>.002)manager.setZoom(next,{x:.5,y:0},'none');
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};
  function selection(){
    const cursor=bridge.input?.cursor,inTable=!!(cursor?.isInCell()||cursor?.isInTableObjectSelection());
    context.hidden=!interacted;
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
  setDetail(false);
  return {refresh(){interacted=false;context.hidden=true;schedule();},fit:schedule};
}
