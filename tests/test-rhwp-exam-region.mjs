import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeRegion,sourceDelta,regionGeometry,validatePictureLayout,validRegion,DEFAULT_PICTURE_LAYOUT} from '../js/rhwp-exam-region.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);
test('eight crop handles retain the opposite source edge and never change source geometry',()=>{
 const before={x:-50,y:-30,w:100,h:60},copy=structuredClone(before);
 for(const dir of ['nw','n','ne','w','e','sw','s','se']){
  const next=resizeRegion(before,dir,{x:5,y:3});assert.deepEqual(before,copy);
  if(dir.includes('w'))near(next.x+next.w,before.x+before.w);else near(next.x,before.x);
  if(dir.includes('n'))near(next.y+next.h,before.y+before.h);else near(next.y,before.y);
  const p=regionGeometry(before,next,{width:18000,height:10800,treatAsChar:true});near(p.width/next.w,180);near(p.height/next.h,180);
 }
});
test('rotated and mirrored gestures keep a fixed source point at the same document position',()=>{
 const before={x:-50,y:-30,w:100,h:60},next={x:-55,y:-33,w:110,h:66};
 for(const rotationAngle of [0,30,90,270])for(const horzFlip of [false,true])for(const vertFlip of [false,true]){
  const p={sourceFrame:true,width:18000,height:10800,horzOffset:500,vertOffset:900,rotationAngle,horzFlip,vertFlip,treatAsChar:false},after={...p,...regionGeometry(before,next,p)};
  const project=(bounds,props)=>{const x=(0-bounds.x-bounds.w/2)*180*(horzFlip?-1:1),y=(0-bounds.y-bounds.h/2)*180*(vertFlip?-1:1),a=rotationAngle*Math.PI/180;return{x:props.horzOffset+props.width/2+x*Math.cos(a)-y*Math.sin(a),y:props.vertOffset+props.height/2+x*Math.sin(a)+y*Math.cos(a)};};
  const a=project(before,p),b=project(next,after);assert.ok(Math.abs(a.x-b.x)<=.6);assert.ok(Math.abs(a.y-b.y)<=.6);
  const d=sourceDelta(36,0,{w:360,h:216,rotation:rotationAngle,flipH:horzFlip,flipV:vertFlip},before);near(Math.hypot(d.x,d.y),10);
 }
});
test('unbounded or invalid crop and layout data cannot be persisted',()=>{
 for(const b of [{x:0,y:0,w:0,h:10},{x:NaN,y:0,w:10,h:10},{x:0,y:0,w:1e6,h:1e6}])assert.throws(()=>validRegion(b));
 for(const change of [{textWrap:'unknown'},{top:-1},{bottom:NaN},{alignment:'Justify'}])assert.throws(()=>validatePictureLayout({...DEFAULT_PICTURE_LAYOUT,...change}));
 for(const textWrap of ['Square','TopAndBottom','Tight','BehindText','InFrontOfText'])assert.equal(validatePictureLayout({...DEFAULT_PICTURE_LAYOUT,textWrap}).textWrap,textWrap);
});

test('floating paragraph alignment compensates the native anchor when the frame grows',()=>{
 const a={x:-50,y:-30,w:100,h:60},b={...a,w:110,h:70};
 for(const horzAlign of ['Left','Center','Right'])for(const vertAlign of ['Top','Center','Bottom']){
  const p={width:18000,height:10800,treatAsChar:false,horzOffset:500,vertOffset:900,horzAlign,vertAlign},next=regionGeometry(a,b,p);
  const fx=horzAlign==='Center'?.5:horzAlign==='Right'?1:0,fy=vertAlign==='Center'?.5:vertAlign==='Bottom'?1:0;
  near(next.horzOffset-fx*next.width,p.horzOffset-fx*p.width);near(next.vertOffset-fy*next.height,p.vertOffset-fy*p.height);
 }
});

test('quarter-turn native dimensions grow the source axes rather than the swapped document axes',()=>{
 const a={x:0,y:0,w:100,h:60},b={...a,w:110};
 const p=regionGeometry(a,b,{width:10800,height:18000,rotationAngle:90,treatAsChar:true});
 assert.deepEqual(p,{width:10800,height:19800});
});
