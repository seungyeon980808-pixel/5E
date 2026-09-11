import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { decodeScopedPng, encodeScopedPng, applyScopedPngEdit } from '../js/ai-scoped-edit-png.js';
import { decodeTestPng, encodeTestRgbaPng, insertTestPngChunkAfterIhdr } from './helpers/scoped-edit-png-fixture.mjs';

const U01 = '/Users/parkseungyeon/.aside/u/0/sessions/2026-09-07_bTSr3fYASfFkTKSA/artifacts/5e-drive-textbook-unit-audit/results/U01-3.png';
const image = () => ({width:3,height:2,data:Uint8Array.from([9,8,7,0, 1,2,3,127, 4,5,6,255, 10,11,12,64, 13,14,15,255, 16,17,18,1])});
const colorMeta = () => [{type:'gAMA',data:Uint8Array.of(0,0,177,0)}];
function mutate(source) { const copy=new Uint8Array(source); copy[copy.length-5]^=1; return copy; }
function candidate(source) { const out={width:source.width,height:source.height,data:source.data.slice()}; out.data.set([201,202,203,0],0);out.data.set([41,42,43,128],16);return out; }

test('adapter round trips RGBA byte-exactly through independent test-only decoder', async () => {
 const input=image(), png=await encodeScopedPng(input,{metadata:colorMeta()}), decoded=await decodeScopedPng(png);
 assert.deepEqual(decoded.data,input.data); assert.deepEqual(decoded.metadata,colorMeta());
 assert.deepEqual(decodeTestPng(png),input, 'independent test-only codec agrees');
});
test('adapter decodes all PNG filter modes from the independent test-only codec', async () => {
 for (let filter=0;filter<=4;filter+=1) assert.deepEqual((await decodeScopedPng(encodeTestRgbaPng(image(),filter))).data,image().data,`filter ${filter}`);
});
test('adapter rejects malformed color metadata on encode and decode', async () => {
 const plain=await encodeScopedPng(image());
 const malformed=[
  {type:'gAMA',data:Uint8Array.of(1)},
  {type:'gAMA',data:new Uint8Array(4)},
  {type:'cHRM',data:new Uint8Array(31)},
  {type:'sRGB',data:Uint8Array.of(4)},
  {type:'iCCP',data:Uint8Array.of(65,0,1,120)},
  {type:'iCCP',data:Uint8Array.of(65,0,0,1,2,3,4)},
 ];
 for(const item of malformed) {
  await assert.rejects(()=>encodeScopedPng(image(),{metadata:[item]}),/malformed/);
  await assert.rejects(()=>decodeScopedPng(insertTestPngChunkAfterIhdr(plain,item.type,item.data)),/malformed/);
 }
});
test('encoder snapshots validated metadata before asynchronous compression', async () => {
 const metadata=colorMeta(), expected=colorMeta();
 const encoding=encodeScopedPng(image(),{metadata});
 metadata[0].data.fill(0);
 metadata.push({type:'evil',data:Uint8Array.of(1)});
 const decoded=await decodeScopedPng(await encoding);
 assert.deepEqual(decoded.metadata,expected);
});
test('adapter applies only selected pixels, preserves hidden RGB and rejects mismatches', async () => {
 const original=image(), mask=Uint8Array.of(1,0,0,0,1,0), orig=await encodeScopedPng(original,{metadata:colorMeta()}), cand=await encodeScopedPng(candidate(original),{metadata:colorMeta()});
 const result=await applyScopedPngEdit(orig,cand,mask), decoded=await decodeScopedPng(result.png);
 assert.equal(result.outsideUnchanged,true);assert.equal(result.changedPixelCount,2);assert.deepEqual(result.changedBounds,{x0:0,y0:0,x1:2,y1:2});
 assert.deepEqual([...decoded.data.subarray(4,16)],[...original.data.subarray(4,16)]); assert.deepEqual([...decoded.data.subarray(0,4)],[201,202,203,0]);
 const wrongProfile=await encodeScopedPng(candidate(original)); await assert.rejects(()=>applyScopedPngEdit(orig,wrongProfile,mask),/color-profile metadata/);
 const wrongGamma=await encodeScopedPng(candidate(original),{metadata:[{type:'gAMA',data:Uint8Array.of(0,0,177,1)}]});
 await assert.rejects(()=>applyScopedPngEdit(orig,wrongGamma,mask),/color-profile metadata/);
 const wrongSize=await encodeScopedPng({width:1,height:1,data:Uint8Array.of(1,2,3,4)},{metadata:colorMeta()}); await assert.rejects(()=>applyScopedPngEdit(orig,wrongSize,mask),/dimensions must match/);
});
test('adapter snapshots candidate bytes and mask before asynchronous decoding', async () => {
 const original=image(), expectedCandidate=candidate(original);
 const orig=await encodeScopedPng(original), cand=await encodeScopedPng(expectedCandidate), mask=Uint8Array.of(1,0,0,0,0,0);
 const applying=applyScopedPngEdit(orig,cand,mask);
 cand.fill(0); mask.fill(0);
 const result=await applying, decoded=await decodeScopedPng(result.png);
 assert.deepEqual([...decoded.data.subarray(0,4)],[...expectedCandidate.data.subarray(0,4)]);
});
test('adapter fails closed on malformed PNG features and leaves source bytes unchanged', async () => {
 const png=await encodeScopedPng(image(),{metadata:colorMeta()}), saved=png.slice(); await assert.rejects(()=>decodeScopedPng(mutate(png)),/CRC mismatch/); assert.deepEqual(png,saved);
 const trns=png.slice(); trns[12]=116;trns[13]=82;trns[14]=78;trns[15]=83; await assert.rejects(()=>decodeScopedPng(trns),/CRC mismatch/);
});
test('adapter rejects non-PNG input and valid chunks outside its supported PNG subset', async () => {
 const png=await encodeScopedPng(image());
 const jpeg=new Uint8Array(45);jpeg.set([0xff,0xd8,0xff]);
 const unsupported=[
  ['JPEG',jpeg],
  ['palette',insertTestPngChunkAfterIhdr(png,'PLTE',Uint8Array.of(0,0,0))],
  ['tRNS transparency',insertTestPngChunkAfterIhdr(png,'tRNS',Uint8Array.of(0,0,0,0,0,0))],
 ];
 for(const [label,input] of unsupported) {
  await assert.rejects(()=>decodeScopedPng(input),/Unsupported or invalid PNG/,label);
 }
});
test('actual U01-3 decodes, applies a mask, removes caBX provenance, and preserves source/outside RGBA', async (t) => {
 let bytes; try { bytes=await fs.readFile(U01); } catch { t.skip('approved U01-3 fixture is unavailable in this worktree environment'); return; }
 const sourceBefore=bytes.slice(), original=await decodeScopedPng(bytes), independent=decodeTestPng(bytes); assert.deepEqual(original.data,independent.data); assert.deepEqual(original.removedMetadata,['caBX']);
 const proposed={width:original.width,height:original.height,data:original.data.slice()}; proposed.data.set([201,202,203,0],0); proposed.data.set([41,42,43,128],proposed.data.length-4);
 const candidatePng=await encodeScopedPng(proposed,{metadata:original.metadata}); const mask=new Uint8Array(original.width*original.height); mask[0]=1; mask[mask.length-1]=1;
 const result=await applyScopedPngEdit(bytes,candidatePng,mask), output=await decodeScopedPng(result.png); assert.deepEqual(bytes,sourceBefore,'original file bytes were not modified'); assert.equal(result.outsideUnchanged,true); assert.deepEqual(result.removedMetadata,['caBX']); assert.match(result.metadataDisposition,/caBX-removed/); assert.equal(Buffer.from(result.png).includes(Buffer.from('caBX')),false,'invalidated C2PA manifest was not copied');
 for(let pixel=0;pixel<mask.length;pixel+=1) if(!mask[pixel]) assert.deepEqual([...output.data.subarray(pixel*4,pixel*4+4)],[...original.data.subarray(pixel*4,pixel*4+4)],`outside pixel ${pixel}`);
});
