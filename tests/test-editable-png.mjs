import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {crc32} from 'node:zlib';
import {embedEditablePng,readEditablePng,currentPageSource} from '../js/editable-png.js?v=1.7.0-four-session-integration';
const png = new Uint8Array(await readFile(new URL('./fixtures/rights-clear-smoke.png',import.meta.url)));
const figure = {id:'diagram',name:'속력 그래프',version:1,source:{version:'0.17',activePageId:'a',pages:[{id:'a',objects:[{id:'line',type:'line',p1:{x:0,y:0},p2:{x:10,y:10}}]}]}};
test('ordinary PNG stays ordinary; editable PNG retains complete Unicode source',()=>{
  assert.equal(readEditablePng(png),null);
  const output=embedEditablePng(png,figure);
  assert.deepEqual(readEditablePng(output),figure);
  assert.deepEqual(output.subarray(0,png.length-12),png.subarray(0,png.length-12),'every existing image chunk stays byte identical');
});
test('revising the source replaces the previous chunk without duplicate or nested metadata',()=>{
  const next={...figure,version:2,name:'그림 2',source:structuredClone(figure.source),render:{bounds:{x:-10,y:-10,w:20,h:20},options:{includeReferenceImages:false,excludeAllImages:false}}};
  next.source.pages[0].objects[0].p2.y=20;
  const once=embedEditablePng(png,figure), twice=embedEditablePng(once,next);
  assert.deepEqual(readEditablePng(twice),next);
  assert.equal(twice.length,embedEditablePng(png,next).length);
});
test('corrupt metadata and invalid figure identity are rejected before returning source',()=>{
  const output=embedEditablePng(png,figure); output[output.length-20]^=1;
  assert.throws(()=>readEditablePng(output),/CRC/);
  assert.throws(()=>embedEditablePng(png,{...figure,id:'../../bad'}),/올바르지/);
  assert.throws(()=>embedEditablePng(png,{...figure,render:{bounds:{x:0,y:0,w:-1,h:5},options:{}}}),/영역 정보/);
  assert.throws(()=>readEditablePng(embedEditablePng(png,figure),()=>{throw new Error('invalid geometry')}),/invalid geometry/);
});
test('only the current page travels with the image and the caller source is preserved',()=>{
  const project=structuredClone(figure.source); project.pages.push({id:'b',objects:[]});
  const source=currentPageSource(project); source.pages[0].objects[0].p2.y=99;
  assert.equal(source.pages.length,1); assert.equal(project.pages.length,2); assert.equal(project.pages[0].objects[0].p2.y,10);
});

test('legal Latin-1 keywords in other PNG metadata remain intact',()=>{
  const data=new Uint8Array([0xe9,0,0,0,0,0,118,97,108,117,101]);
  const chunk=new Uint8Array(data.length+12), view=new DataView(chunk.buffer);
  view.setUint32(0,data.length); chunk.set(new TextEncoder().encode('iTXt'),4); chunk.set(data,8);
  view.setUint32(chunk.length-4,crc32(chunk.subarray(4,chunk.length-4)));
  const input=new Uint8Array(png.length+chunk.length);
  input.set(png.subarray(0,png.length-12)); input.set(chunk,png.length-12); input.set(png.subarray(png.length-12),png.length-12+chunk.length);
  assert.equal(readEditablePng(input),null);
  const output=embedEditablePng(input,figure); assert.deepEqual(readEditablePng(output),figure);
  assert.deepEqual(output.subarray(0,input.length-12),input.subarray(0,input.length-12));
});
