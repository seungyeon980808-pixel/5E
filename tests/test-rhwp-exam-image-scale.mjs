import test from 'node:test';
import assert from 'node:assert/strict';
import {RhwpExamBridge} from '../js/rhwp-exam-bridge.js';

function fixture(region={originalSizeHu:[45001,30002],crop:{left:1800,top:600,right:42000,bottom:27000}}) {
  const ref={sec:0,ppi:2,ci:3,type:'image',cellPath:[{controlIndex:0,cellIndex:1,cellParaIndex:0}]};
  const writes=[],bridge=Object.create(RhwpExamBridge.prototype);
  bridge.deps={wasm:{pageCount:8,getPageControlLayout:page=>({controls:page===7?[{type:'image',secIdx:0,paraIdx:2,controlIdx:3,cellPath:ref.cellPath}]:[]}),
    getCellPicturePropertiesByPath:()=>({originalWidth:18000,originalHeight:12000,cropRight:0}),
    assignPictureImage:(...args)=>{writes.push(args);return JSON.stringify({ok:true});},setCellPicturePropertiesByPath:(...args)=>writes.push(args)}};
  bridge.picturePaint=()=>region;
  return{bridge,ref,writes};
}
test('native source coordinates govern crop mapping on an unrendered nested-cell page',()=>{
  const{bridge,ref}=fixture(),bounds={x:-50,y:-30,w:100,h:60};
  assert.deepEqual(bridge.pictureSourceRegion(ref),{w:45001,h:30002,l:1800,t:600,r:42000,b:27000,nativeSize:true});
  assert.deepEqual(bridge.cropBounds(ref,bounds),{x:-50+100*1800/45001,y:-30+60*600/30002,w:100*40200/45001,h:60*26400/30002});
});
test('replacement uses complete native source extent, including rounding, independently of raster size',()=>{
  const{bridge,ref,writes}=fixture();
  bridge.writeFigure(ref,{bytes:new Uint8Array([1,2]),pixelWidth:300,pixelHeight:200},'revision');
  assert.equal(writes[0][5],601);assert.equal(writes[0][6],401);
  assert.equal(writes[0][2],JSON.stringify(ref.cellPath));
  assert.deepEqual(writes[1].at(-1),{description:'5e-exam:revision'});
});
test('invalid source geometry or unavailable paint fails before changing document bytes',()=>{
  for(const region of [null,{originalSizeHu:[0,300]},{originalSizeHu:[Infinity,300]},{originalSizeHu:[300,300],crop:{left:300,top:0,right:300,bottom:300}},{originalSizeHu:[300,300],crop:{left:NaN,top:0,right:300,bottom:300}}]) {
    const{bridge,ref,writes}=fixture(region);
    assert.throws(()=>bridge.writeFigure(ref,{bytes:new Uint8Array([1]),pixelWidth:1,pixelHeight:1},'revision'),/원본 좌표/);
    assert.deepEqual(writes,[]);
  }
});
test('absent crop means full source and out-of-range crop endpoints are clamped',()=>{
  let f=fixture({originalSizeHu:[100,200]});assert.deepEqual(f.bridge.pictureSourceRegion(f.ref),{w:100,h:200,l:0,t:0,r:100,b:200,nativeSize:true});
  f=fixture({originalSizeHu:[100,200],crop:{left:-20,top:-20,right:500,bottom:500}});assert.deepEqual(f.bridge.pictureSourceRegion(f.ref),{w:100,h:200,l:0,t:0,r:100,b:200,nativeSize:true});
});

test('HWPX without explicit original size uses full crop endpoints and actual new raster resolution',()=>{
  const{bridge,ref,writes}=fixture({crop:{left:0,top:0,right:29625,bottom:21150}});
  assert.equal(bridge.pictureSourceRegion(ref).nativeSize,false);
  const bounds={x:-10,y:-20,w:30,h:40};assert.deepEqual(bridge.cropBounds(ref,bounds),bounds);
  bridge.writeFigure(ref,{bytes:new Uint8Array([1]),pixelWidth:1200,pixelHeight:800},'revision');
  assert.equal(writes[0][5],1200);assert.equal(writes[0][6],800);
});
test('implicit source extent matches Studio inference for cropped foreign rasters on each axis',()=>{
  for(const [crop,size,expected] of [
    [{left:750,top:1500,right:3000,bottom:4500},{width:60,height:80},{w:4500,h:6000}],
    [{left:0,top:1500,right:3000,bottom:4500},{width:60,height:80},{w:3000,h:4000}],
    [{left:750,top:0,right:3000,bottom:4500},{width:60,height:80},{w:3375,h:4500}]
  ]) {
    const{bridge,ref}=fixture({crop}),region=bridge.pictureSourceRegion(ref,size);
    assert.equal(region.w,expected.w);assert.equal(region.h,expected.h);assert.equal(region.nativeSize,false);
  }
});

test('cropped implicit PNG coordinates remain available without a visible DOM page',()=>{
  const{bridge,ref}=fixture({crop:{left:750,top:1500,right:3000,bottom:4500}});
  const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([73,72,68,82],12);
  const view=new DataView(bytes.buffer);view.setUint32(16,60);view.setUint32(20,80);
  bridge.wasm.getControlImageData=()=>bytes;
  assert.deepEqual(bridge.pictureSourceRegion(ref),{w:4500,h:6000,l:750,t:1500,r:3000,b:4500,nativeSize:false});
});
test('undecodable implicit cropped sources fail without touching image bytes',()=>{
  const{bridge,ref,writes}=fixture({crop:{left:750,top:1500,right:3000,bottom:4500}});
  bridge.wasm.getControlImageData=()=>new Uint8Array([1,2]);
  assert.throws(()=>bridge.writeFigure(ref,{bytes:new Uint8Array([1]),pixelWidth:1,pixelHeight:1},'revision'),/원본 해상도/);
  assert.deepEqual(writes,[]);
});

test('all-zero crop sentinel from an imported file means the complete image',()=>{
  const bounds={x:-5,y:-10,w:20,h:30};
  for(const originalSizeHu of [undefined,[45000,30000]]) {
    const{bridge,ref}=fixture({originalSizeHu,crop:{left:0,top:0,right:0,bottom:0}});
    assert.deepEqual(bridge.cropBounds(ref,bounds),bounds);
  }
});
