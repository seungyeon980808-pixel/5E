// Adapt the pinned RHWP's own handles. Document resizing never edits PNG/crop
// metadata; the native snapshot keeps this a single reversible document change.
export function pictureResize(state, props, dx, dy) {
  const {w,h}=state.bbox,angle=(state.rotationAngle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const x=dx*c+dy*s,y=-dx*s+dy*c,dir=state.dir;
  const sx=dir.includes('e')?1:dir.includes('w')?-1:0,sy=dir.includes('s')?1:dir.includes('n')?-1:0;
  const scale=Math.max(283/props.width,283/props.height,1+(sx*x*w+sy*y*h)/(sx*sx*w*w+sy*sy*h*h));
  const width=Math.round(props.width*scale),height=Math.round(props.height*scale);
  const cx=sx*w*(scale-1)/2,cy=sy*h*(scale-1)/2;
  const shiftX=cx*c-cy*s,shiftY=cx*s+cy*c;
  const result={width,height};
  if(!props.treatAsChar){
    const anchorX=props.horzAlign==='Center'?.5:props.horzAlign==='Right'?1:0,anchorY=props.vertAlign==='Center'?.5:props.vertAlign==='Bottom'?1:0;
    // RHWP measures Right/Bottom offsets inward from the far reference edge.
    const signX=props.horzAlign==='Right'?-1:1,signY=props.vertAlign==='Bottom'?-1:1;
    result.horzOffset=Math.round((props.horzOffset||0)+signX*(shiftX*75+(width-props.width)*(anchorX-.5)));
    result.vertOffset=Math.round((props.vertOffset||0)+signY*(shiftY*75+(height-props.height)*(anchorY-.5)));
  }
  return {props:result,box:{x:state.bbox.x+shiftX-w*(scale-1)/2,y:state.bbox.y+shiftY-h*(scale-1)/2,width:w*scale,height:h*scale}};
}

const installed=new WeakSet();
const keyListeners=new WeakMap();
export function installPictureResize(input,bridge) {
  if(installed.has(input))return;installed.add(input);
  for(const doc of [bridge.editor?.element?.contentDocument,bridge.editor?.element?.ownerDocument].filter(Boolean)){
    const previous=keyListeners.get(doc);if(previous)doc.removeEventListener('keydown',previous,true);
    const cancel=event=>{
      const current=bridge.deps.getInputHandler(),state=current?.pictureResizeState;
      if(event.key!=='Escape'||state?.ref?.type!=='image'||state.multiRefs?.length)return;
      event.preventDefault();event.stopImmediatePropagation();current.cleanupPictureResizeDrag();current.renderPictureObjectSelection();
    };
    doc.addEventListener('keydown',cancel,true);keyListeners.set(doc,cancel);
  }
  const update=input.updatePictureResizeDrag,finish=input.finishPictureResizeDrag;
  function resized(event){
    const state=input.pictureResizeState;
    if(!state || state.ref?.type!=='image' || state.multiRefs?.length)return null;
    state.fiveEOriginalProps ||= structuredClone(bridge.properties(state.ref));
    if(state.fiveEOriginalProps.sizeProtect)return null;
    const zoom=input.viewportManager.getZoom();
    return pictureResize(state,state.fiveEOriginalProps,(event.clientX-state.startClientX)/zoom,(event.clientY-state.startClientY)/zoom);
  }
  input.updatePictureResizeDrag=function(event){
    const next=resized(event);if(!next)return update.call(this,event);
    this.pictureObjectRenderer.renderDragPreview({pageIndex:this.pictureResizeState.pageIndex,...next.box},this.viewportManager.getZoom(),this.pictureResizeState.rotationAngle||0);
  };
  input.finishPictureResizeDrag=function(event){
    const next=resized(event);if(!next)return finish.call(this,event);
    const state=this.pictureResizeState;
    try{if(Object.entries(next.props).some(([k,v])=>state.fiveEOriginalProps[k]!==v))bridge.transaction('resize-picture',()=>{bridge.setProperties(state.ref,next.props);return true;});}
    finally{this.cleanupPictureResizeDrag();this.renderPictureObjectSelection();}
  };
}
