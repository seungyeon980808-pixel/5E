import test from 'node:test';
import assert from 'node:assert/strict';
import {setTableLayoutLocked} from '../js/rhwp-exam-layout-lock.js';

test('locked edges have no hover hit target or drag mutation; unlocking restores both',()=>{
  let drags=0,markers=0,clears=0;
  const makeRenderer=()=>({hitTestBorder:()=>({type:'col'}),showMarker:()=>markers++,clear:()=>clears++});
  let selected=false,objectHandles=0;
  const input={tableResizeRenderer:makeRenderer(),cursor:{isInTableObjectSelection:()=>selected,exitTableObjectSelection(){selected=false;}},renderTableObjectSelection(){objectHandles++;},tableObjectRenderer:{clear(){}},eventBus:{emit(){}},updateCaret(){},container:{style:{cursor:''},ownerDocument:{defaultView:{cancelAnimationFrame(){}}}},setTableResizeRenderer(r){this.tableResizeRenderer=r;},startResizeDrag(){drags++;},clearTableResizeRuntimeCache(){},cleanupResizeDrag(){}};
  setTableLayoutLocked(input,true);
  assert.equal(input.tableResizeRenderer.hitTestBorder(),null);
  input.tableResizeRenderer.showMarker();input.startResizeDrag();assert.equal(markers,0);assert.equal(drags,0);assert(clears>0);
  selected=true;input.renderTableObjectSelection();assert.equal(selected,false);assert.equal(objectHandles,0);
  setTableLayoutLocked(input,false);assert.equal(input.tableResizeRenderer.hitTestBorder().type,'col');input.tableResizeRenderer.showMarker();input.startResizeDrag();assert.equal(markers,1);assert.equal(drags,1);
  // Studio replaces its renderer when a document is reloaded.
  setTableLayoutLocked(input,true);input.setTableResizeRenderer(makeRenderer());assert.equal(input.tableResizeRenderer.hitTestBorder(),null);input.startResizeDrag();assert.equal(drags,1);
  // A newly loaded document may reuse Studio's renderer with a new input.
  const replacement={...input,examTableLayoutLocked:false,setTableResizeRenderer(r){this.tableResizeRenderer=r;},startResizeDrag(){drags++;},renderTableObjectSelection(){objectHandles++;}};
  setTableLayoutLocked(replacement,false);assert.equal(replacement.tableResizeRenderer.hitTestBorder().type,'col');
  setTableLayoutLocked(replacement,true);assert.equal(replacement.tableResizeRenderer.hitTestBorder(),null);
});
