import test from 'node:test';
import assert from 'node:assert/strict';
import {pictureResize,installPictureResize} from '../js/rhwp-exam-picture-resize.js';

const dirs=['nw','n','ne','w','e','sw','s','se'];
const near=(a,b,t=.01)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const props={width:22500,height:13500,horzOffset:450,vertOffset:900,treatAsChar:false};
const state={bbox:{x:20,y:30,w:300,h:180},rotationAngle:0};

test('all eight native handles enlarge the whole image, keeping the opposite edge and aspect',()=>{
  for(const dir of dirs)for(const rotationAngle of [0,30,90,270]){
    const sx=dir.includes('e')?1:dir.includes('w')?-1:0,sy=dir.includes('s')?1:dir.includes('n')?-1:0;
    const a=rotationAngle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    const next=pictureResize({...state,dir,rotationAngle},props,sx*12*c-sy*12*s,sx*12*s+sy*12*c);
    assert.ok(next.props.width>props.width && next.props.height>props.height);
    near(next.props.width/next.props.height,props.width/props.height,.0002);
    const anchor=b=>({x:b.x+b.w/2-sx*b.w*c/2+sy*b.h*s/2,y:b.y+b.h/2-sx*b.w*s/2-sy*b.h*c/2});
    const before=anchor(state.bbox),after=anchor({x:next.box.x,y:next.box.y,w:next.box.width,h:next.box.height});
    near(after.x,before.x);near(after.y,before.y);
  }
});

test('crossing the opposite handle shrinks without flipping or stretching',()=>{
  const next=pictureResize({...state,dir:'e'},props,-900,0);
  assert.ok(next.props.width>=283 && next.props.height>=283);
  near(next.props.width/next.props.height,props.width/props.height,.004);
  assert.ok(next.box.width>0 && next.box.height>0);
  const inline=pictureResize({...state,dir:'se'},{...props,treatAsChar:true},15,9);
  assert.deepEqual(Object.keys(inline.props),['width','height'],'paragraph alignment owns inline anchors');
});

test('floating alignment compensates native frame size and does not drift the fixed edge',()=>{
  for(const horzAlign of ['Left','Center','Right'])for(const vertAlign of ['Top','Center','Bottom']){
    const before={...props,horzAlign,vertAlign},next=pictureResize({...state,dir:'e'},before,30,0).props;
    const ax=horzAlign==='Center'?.5:horzAlign==='Right'?1:0,ay=vertAlign==='Center'?.5:vertAlign==='Bottom'?1:0;
    const signX=horzAlign==='Right'?-1:1,signY=vertAlign==='Bottom'?-1:1;
    near(signX*next.horzOffset-ax*next.width,signX*before.horzOffset-ax*before.width);
    near(signY*next.vertOffset-ay*next.height+next.height/2,signY*before.vertOffset-ay*before.height+before.height/2);
  }
});

test('native adapter previews without document writes and commits one transaction at release',()=>{
  const writes=[],previews=[],transactions=[];
  const input={pictureResizeState:{...state,dir:'e',ref:{type:'image'},startClientX:100,startClientY:100},viewportManager:{getZoom:()=>2},pictureObjectRenderer:{renderDragPreview:v=>previews.push(v)},updatePictureResizeDrag(){throw Error('native stretch called');},finishPictureResizeDrag(){throw Error('native stretch called');},cleanupPictureResizeDrag(){this.pictureResizeState=null;},renderPictureObjectSelection(){}};
  const bridge={properties:()=>props,setProperties:(ref,p)=>writes.push(p),transaction:(name,fn)=>{transactions.push(name);assert.equal(fn(),true);}};
  installPictureResize(input,bridge);installPictureResize(input,bridge);
  input.updatePictureResizeDrag({clientX:160,clientY:100});assert.equal(writes.length,0);assert.equal(previews.length,1);
  input.finishPictureResizeDrag({clientX:160,clientY:100});assert.deepEqual(transactions,['resize-picture']);assert.equal(writes.length,1);assert.equal(writes[0].width,24750);assert.equal(writes[0].height,14850);assert.equal(input.pictureResizeState,null);
});
