import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTestRgbaPng, decodeTestPng } from './helpers/scoped-edit-png-fixture.mjs';
import { createScopedEditSession, confirmScopedEditSession, prepareScopedEditProposal,
  acceptScopedEditProposal, discardScopedEditProposal, invalidateScopedEditSession } from '../js/ai-scoped-edit-session.js';
const rect = () => ({ x0: 1, y0: 0, x1: 2, y1: 1, coordinateSpace: 'selected-result-pixels' });
function fixture() {
  const pixels = Uint8Array.from([10,20,30,0, 40,50,60,100, 70,80,90,255]);
  const sourcePng = encodeTestRgbaPng({width:3,height:1,data:pixels});
  const candidatePng = encodeTestRgbaPng({width:3,height:1,data:new Uint8Array(12).fill(199)});
  const current = { taskId:'task-a',candidateId:'image-a',epoch:1,selectionRevision:1,sourcePng };
  return { pixels, sourcePng, candidatePng, current, getCurrent:()=>current,
    options:{...current,rectangles:[rect()]} };
}
test('session snapshots source and rectangles before asynchronous decode; public bounds are immutable', async()=>{
  const f=fixture(); const saved=f.sourcePng.slice();
  const creating=createScopedEditSession(f.options);
  f.options.rectangles[0].x0=0; f.sourcePng.fill(0);
  const session=await creating;
  assert.equal(session.rectangles[0].x0,1);assert.equal(session.allowedPixelCount,1);
  assert.throws(()=>{session.rectangles[0].x0=0},TypeError);
  f.current.sourcePng=saved;confirmScopedEditSession(session,f.getCurrent);
  const pending=await prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
  assert.equal(pending.changedPixelCount,1);
});
test('explicit confirmation and explicit acceptance are separate; output remains exact outside scope',async()=>{
  const f=fixture(),session=await createScopedEditSession(f.options);
  await assert.rejects(prepareScopedEditProposal(session,f.candidatePng,f.getCurrent),/Confirm/);
  confirmScopedEditSession(session,f.getCurrent);
  const pending=await prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
  pending.previewPng.fill(0); // A preview getter only exposes a fresh copy.
  const result=decodeTestPng(acceptScopedEditProposal(session,pending,f.getCurrent));
  assert.deepEqual([...result.data],[10,20,30,0,199,199,199,199,70,80,90,255]);
  assert.equal(pending.outsideUnchanged,true);
  assert.deepEqual(f.sourcePng,f.options.sourcePng);
  assert.throws(()=>acceptScopedEditProposal(session,pending,f.getCurrent),/No unconsumed/);
});
test('multiple disjoint rectangles are unioned without changing the transparent pixel between them',async()=>{
  const f=fixture();
  const rectangles=[
    {x0:0,y0:0,x1:1,y1:1,coordinateSpace:'selected-result-pixels'},
    {x0:2,y0:0,x1:3,y1:1,coordinateSpace:'selected-result-pixels'},
  ];
  const session=await createScopedEditSession({...f.options,rectangles});
  assert.equal(session.allowedPixelCount,2);
  confirmScopedEditSession(session,f.getCurrent);
  const pending=await prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
  const result=decodeTestPng(acceptScopedEditProposal(session,pending,f.getCurrent));
  assert.deepEqual([...result.data],[199,199,199,199,40,50,60,100,199,199,199,199]);
});
test('candidate bytes are snapshotted while live selection and source mutations fail closed during processing',async()=>{
  {
    const f=fixture(),session=await createScopedEditSession(f.options);confirmScopedEditSession(session,f.getCurrent);
    const preparing=prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
    f.candidatePng.fill(0);
    const pending=await preparing, result=decodeTestPng(pending.previewPng);
    assert.deepEqual([...result.data],[10,20,30,0,199,199,199,199,70,80,90,255]);
  }
  for(const mutate of [
    f=>{f.current.selectionRevision+=1;},
    f=>{f.current.candidateId='other-image';},
    f=>{f.current.sourcePng[0]^=1;},
  ]) {
    const f=fixture(),session=await createScopedEditSession(f.options);confirmScopedEditSession(session,f.getCurrent);
    const preparing=prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
    mutate(f);
    await assert.rejects(preparing,/Stale scoped edit/);
  }
});
test('changed task, epoch, version and selection revision all reject stale proposals',async()=>{
  for(const [key,value] of [['taskId','other'],['epoch',2],['candidateId','other'],['selectionRevision',2]]) {
    const f=fixture(),session=await createScopedEditSession(f.options);
    confirmScopedEditSession(session,f.getCurrent);f.current[key]=value;
    await assert.rejects(prepareScopedEditProposal(session,f.candidatePng,f.getCurrent),/Stale/);
  }
});
test('source byte mutation and source mutation at acceptance are rejected',async()=>{
  const f=fixture(),session=await createScopedEditSession(f.options);confirmScopedEditSession(session,f.getCurrent);
  const pending=await prepareScopedEditProposal(session,f.candidatePng,f.getCurrent);
  f.current.sourcePng=f.sourcePng.slice();f.current.sourcePng[0]^=1;
  assert.throws(()=>acceptScopedEditProposal(session,pending,f.getCurrent),/source bytes/);
});
test('context switching during asynchronous PNG processing fails after completion',async()=>{
  const f=fixture(),session=await createScopedEditSession(f.options);confirmScopedEditSession(session,f.getCurrent);
  let calls=0;
  await assert.rejects(prepareScopedEditProposal(session,f.candidatePng,()=>++calls===1?f.current:{...f.current,taskId:'switched'}),/Stale/);
});
test('empty, point, reference-coordinate and fractional rectangles are not inferred or expanded',async()=>{
  const f=fixture();
  for(const rectangles of [[],[{type:'point',x:50,y:50}],[{...rect(),coordinateSpace:'reference-pixels'}],[{...rect(),x0:0.5}],[{...rect(),x1:4}]]) {
    await assert.rejects(createScopedEditSession({...f.options,rectangles}));
  }
});
test('wrong candidate dimensions and shared source buffers fail closed',async()=>{
  const f=fixture(),session=await createScopedEditSession(f.options);confirmScopedEditSession(session,f.getCurrent);
  const wrong=encodeTestRgbaPng({width:1,height:1,data:new Uint8Array(4)});
  await assert.rejects(prepareScopedEditProposal(session,wrong,f.getCurrent));
  const shared=new Uint8Array(new SharedArrayBuffer(f.sourcePng.length));shared.set(f.sourcePng);
  await assert.rejects(createScopedEditSession({...f.options,sourcePng:shared}),/non-shared/);
});
test('discarded, cross-session and invalidated proposals cannot be applied',async()=>{
  const f=fixture(),a=await createScopedEditSession(f.options),b=await createScopedEditSession(f.options);
  confirmScopedEditSession(a,f.getCurrent);confirmScopedEditSession(b,f.getCurrent);
  const p=await prepareScopedEditProposal(a,f.candidatePng,f.getCurrent);
  assert.throws(()=>acceptScopedEditProposal(b,p,f.getCurrent),/No unconsumed/);
  discardScopedEditProposal(a,p);assert.throws(()=>acceptScopedEditProposal(a,p,f.getCurrent),/No unconsumed/);
  const q=await prepareScopedEditProposal(b,f.candidatePng,f.getCurrent);
  invalidateScopedEditSession(b);assert.throws(()=>acceptScopedEditProposal(b,q,f.getCurrent),/invalid/);
});
