// Question typesetting keeps the editable text, but makes table edge gestures
// opt-in. Studio paints its blue marker before a drag starts; hiding that marker
// with CSS would leave the destructive hit target active.
const installed=new WeakSet();
const rendererLocks=new WeakMap();
const structureGuards=new WeakSet();
// 구조 잠금: 잠겨 있으면 글(입력·글자/문단 모양·들여쓰기)만 고칠 수 있고, 표·그림의 틀(크기·줄/칸·합치기·
// 나누기·테두리·넣기·옮기기·돌리기)은 잠금을 풀어야 바뀐다. 메뉴·단축키 명령은 모두 Studio 명령 전달기를 지나므로 거기서 막는다.
export const STRUCTURE_LOCK_MESSAGE='구조 잠금 중 · 표·그림의 크기나 틀은 구조 잠금을 풀고 바꾸세요. 글은 그대로 고칠 수 있습니다.';
const TEXT_TABLE_COMMANDS=new Set(['table:block-sum','table:block-avg','table:block-product','table:block-formula','table:decimal-add','table:decimal-remove','table:thousand-sep','table:transpose-copy']);
export function isStructureCommand(id){
  id=String(id||'');
  if(id.startsWith('table:'))return !TEXT_TABLE_COMMANDS.has(id);
  return /^insert:(image|shape|textbox|picture-|rotate-|flip-|caption-)/.test(id);
}
function installStructureGuard(input){
  if(structureGuards.has(input))return;structureGuards.add(input);
  const notice=()=>input.examStructureNotice?.(STRUCTURE_LOCK_MESSAGE);
  const dispatcher=input.dispatcher;
  if(dispatcher&&typeof dispatcher.dispatchWithResult==='function'){
    const run=dispatcher.dispatchWithResult.bind(dispatcher);
    dispatcher.dispatchWithResult=(id,...args)=>{
      if(input.examTableLayoutLocked&&isStructureCommand(id)){notice();return{ok:false,reason:'structure-locked',message:STRUCTURE_LOCK_MESSAGE};}
      return run(id,...args);
    };
  }
  // 마우스로 그림·표를 옮기고 돌리고 크기를 바꾸는 중간 단계, 화살표로 선택 개체를 옮기는 것도 막는다.
  for(const name of ['updatePictureMoveDrag','updatePictureRotateDrag','updatePictureResizeDrag','updateMoveDrag','moveSelectedPicture','resizeSelectedPicture','moveSelectedTable','resizeCellByKeyboard','resizeTableProportional']){
    if(typeof input[name]!=='function')continue;
    const original=input[name].bind(input);let warned=0;
    input[name]=(...args)=>{
      if(!input.examTableLayoutLocked)return original(...args);
      const now=Date.now();if(now-warned>1500){warned=now;notice();}
    };
  }
  // 그림 크기는 끄는 중이 아니라 놓을 때 정해지므로, 잠겨 있으면 놓을 때 바꾸지 않고 끄기만 정리한다.
  if(typeof input.finishPictureResizeDrag==='function'){
    const finish=input.finishPictureResizeDrag;
    input.finishPictureResizeDrag=function(...args){
      if(!input.examTableLayoutLocked)return finish.apply(this,args);
      this.cleanupPictureResizeDrag?.();this.renderPictureObjectSelection?.();
    };
  }
}
export function setTableLayoutLocked(input,locked){
  if(!input)return;
  input.examTableLayoutLocked=!!locked;
  installStructureGuard(input);
  // Geometry-only hosts (and tests) expose no table resize runtime to guard.
  if(typeof input.setTableResizeRenderer!=='function')return;
  if(!installed.has(input)){
    installed.add(input);
    const decorate=renderer=>{
      if(!renderer)return renderer;
      const previous=rendererLocks.get(renderer);
      if(previous){previous.input=input;return renderer;}
      const state={input};rendererLocks.set(renderer,state);
      const hit=renderer.hitTestBorder.bind(renderer),show=renderer.showMarker.bind(renderer);
      renderer.hitTestBorder=(...args)=>state.input.examTableLayoutLocked?null:hit(...args);
      renderer.showMarker=(...args)=>state.input.examTableLayoutLocked?renderer.clear():show(...args);
      return renderer;
    };
    const setter=input.setTableResizeRenderer.bind(input);
    input.setTableResizeRenderer=renderer=>setter(decorate(renderer));
    decorate(input.tableResizeRenderer);
    const start=input.startResizeDrag.bind(input);
    input.startResizeDrag=(...args)=>input.examTableLayoutLocked?undefined:start(...args);
    // An outer-edge click can also select the entire table, exposing a second
    // set of handles and a move gesture. Disable that route while locked too.
    const render=input.renderTableObjectSelection.bind(input);
    input.renderTableObjectSelection=(...args)=>{
      if(!input.examTableLayoutLocked)return render(...args);
      input.cursor.exitTableObjectSelection();input.tableObjectRenderer?.clear();
    };
  }
  if(input.isResizeDragging)input.cleanupResizeDrag();
  input.clearTableResizeRuntimeCache();
  if(input.resizeHoverRafId){input.container.ownerDocument.defaultView.cancelAnimationFrame(input.resizeHoverRafId);input.resizeHoverRafId=0;}
  input.tableResizeRenderer?.clear();
  if(locked&&input.cursor.isInTableObjectSelection()){
    input.cursor.exitTableObjectSelection();input.tableObjectRenderer?.clear();
    input.eventBus.emit('table-object-selection-changed',false);input.updateCaret();
  }
  input.container.style.cursor='';
}
