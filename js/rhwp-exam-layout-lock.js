// Question typesetting keeps the editable text, but makes table edge gestures
// opt-in. Studio paints its blue marker before a drag starts; hiding that marker
// with CSS would leave the destructive hit target active.
const installed=new WeakSet();
const rendererLocks=new WeakMap();
export function setTableLayoutLocked(input,locked){
  if(!input)return;
  input.examTableLayoutLocked=!!locked;
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
