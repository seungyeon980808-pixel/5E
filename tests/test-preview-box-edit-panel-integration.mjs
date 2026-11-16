import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScopedPanelEdit, scopedPngBytes, scopedPngData, scopedPixelRectangles, scopedImageCompletionStatus } from '../js/ai-panel.js';
import { parseAiEvent } from '../js/ai-events.js';
import { encodeTestRgbaPng, decodeTestPng } from './helpers/box-edit-png-fixture.mjs';
function fixture() {
  const pixels = Uint8Array.from([10,20,30,0,40,50,60,100,70,80,90,255,100,110,120,255]);
  const sourcePng = encodeTestRgbaPng({width:4,height:1,data:pixels});
  const candidate = encodeTestRgbaPng({width:4,height:1,data:new Uint8Array(16).fill(199)});
  const current = {taskId:'a',candidateId:'b',epoch:1,selectionRevision:0,sourcePng};
  const calls=[]; let accepted;
  const options = { getCurrent:()=>current,
    comments:[{type:'area',imageId:'b',x:25,y:0,w:25,h:100}],
    confirmBounds:async s=>{calls.push('confirm');assert.deepEqual(s.rectangles[0],{x0:1,y0:0,x1:2,y1:1,coordinateSpace:'selected-result-pixels'});return true;},
    generate:async()=>{calls.push('generate');return candidate;},
    review:async proposal=>{calls.push('review');assert.equal(accepted,undefined);assert.equal(proposal.outsideUnchanged,true);return true;},
    register:async(bytes,check)=>{assert.equal(check(),true);calls.push('register');accepted=bytes;}
  };
  return {current,sourcePng,candidate,pixels,calls,options,get accepted(){return accepted;}};
}
test('executed panel flow confirms, generates, reviews then registers only accepted exact composite',async()=>{
  const f=fixture();assert.equal(await runScopedPanelEdit(f.options),true);
  assert.deepEqual(f.calls,['confirm','generate','review','register']);
  const decoded=decodeTestPng(f.accepted);
  assert.deepEqual([...decoded.data],[10,20,30,0,199,199,199,199,70,80,90,255,100,110,120,255]);
  assert.deepEqual(decodeTestPng(f.sourcePng).data,f.pixels);
});
test('cancel before bounds never generates; cancel preview never registers',async()=>{
  for(const step of ['confirmBounds','review']) {
    const f=fixture();f.options[step]=async()=>false;
    assert.equal(await runScopedPanelEdit(f.options),false);assert.equal(f.accepted,undefined);
    assert.equal(f.calls.includes('register'),false);
    if(step==='confirmBounds')assert.equal(f.calls.includes('generate'),false);
  }
});
test('task, version, epoch, area revision or PNG changed during review blocks registration',async()=>{
  for(const key of ['taskId','candidateId','epoch','selectionRevision','sourcePng']) {
    const f=fixture();f.options.review=async()=>{f.current[key]=key==='sourcePng'?f.candidate:typeof f.current[key]==='number'?f.current[key]+1:'changed';return true;};
    await assert.rejects(runScopedPanelEdit(f.options),/Stale/);assert.equal(f.accepted,undefined);
  }
});
test('stale scope before confirmation never invokes generator',async()=>{
  const f=fixture();f.options.confirmBounds=async()=>{f.current.selectionRevision++;return true;};
  await assert.rejects(runScopedPanelEdit(f.options),/Stale/);assert.equal(f.calls.includes('generate'),false);
});
test('generator failure and unsupported dimensions fail closed without review or registration',async()=>{
  for(const wrong of [null,encodeTestRgbaPng({width:1,height:1,data:new Uint8Array(4)})]) {
    const f=fixture();f.options.generate=async()=>{if(!wrong)throw new Error('transport failed');return wrong;};
    await assert.rejects(runScopedPanelEdit(f.options));assert.equal(f.calls.includes('review'),false);assert.equal(f.accepted,undefined);
  }
});
test('only explicit selected-image areas work; inward rounding never expands',()=>{
  const c={type:'area',imageId:'b',x:10,y:10,w:40,h:40};
  assert.deepEqual(scopedPixelRectangles([c],13,13,'b')[0],{x0:2,y0:2,x1:6,y1:6,coordinateSpace:'selected-result-pixels'});
  for(const comments of [[],[{type:'point',x:1,y:1}], [{...c,imageId:'reference'}], [{...c,w:0.001}], [{...c,x:NaN}]])assert.throws(()=>scopedPixelRectangles(comments,13,13,'b'));
});
test('raw PNG conversion is byte-identical and rejects non-PNG data URLs',()=>{
  const f=fixture();assert.deepEqual(scopedPngBytes(scopedPngData(f.sourcePng)),f.sourcePng);
  assert.throws(()=>scopedPngBytes('data:image/jpeg;base64,AAAA'));
});

test('real native first-image automatic interruption is a successful PNG terminal, not user cancellation',()=>{
  const start=parseAiEvent({method:'5e/image-finalization',params:{turnId:'t',state:'interrupting'}});
  assert.equal(scopedImageCompletionStatus(start,{hasImage:true,autoFinalizationSeen:false,userCancelled:false}),'wait');
  const done=parseAiEvent({method:'turn/completed',params:{turn:{id:'t',status:'interrupted',error:null}}});
  assert.equal(scopedImageCompletionStatus(done,{hasImage:true,autoFinalizationSeen:true,userCancelled:false}),'complete');
  for(const extra of [{hasImage:false},{autoFinalizationSeen:false},{userCancelled:true}])assert.equal(scopedImageCompletionStatus(done,{hasImage:true,autoFinalizationSeen:true,userCancelled:false,...extra}),'reject');
});
test('confirmed/recovered completion does not require a nonexistent status field and never accepts cancellation',()=>{
  for(const state of ['confirmed','recovered']){
    const event=parseAiEvent({method:'5e/image-finalization',params:{turnId:'t',state}});
    assert.equal(event.status,null);
    assert.equal(scopedImageCompletionStatus(event,{hasImage:true,autoFinalizationSeen:true,userCancelled:false}),'complete');
    assert.equal(scopedImageCompletionStatus(event,{hasImage:true,autoFinalizationSeen:true,userCancelled:true}),'reject');
  }
  assert.equal(scopedImageCompletionStatus({kind:'done',status:'completed',error:'failure'},{hasImage:true,userCancelled:false}),'reject');
});

const precisionReport = status => ({version:1,status,outsideRgbaChanged:0,checks:[
  {box:0,kind:'move',status,metrics:{dx:182,dy:0},reasons:[],
    feedback:status==='fail'?'Measured dx=182px; expected dx=150px. Keep the same source and scope.':''}
]});
test('machine failure is preserved and cannot reach human apply or registration',async()=>{
  const f=fixture(),records=[];
  f.options.verify=async()=>precisionReport('fail');
  f.options.onAttempt=async value=>records.push(value);
  await assert.rejects(runScopedPanelEdit(f.options),error=>error.code==='SCOPED_EDIT_PRECISION'&&error.verification.status==='fail');
  assert.equal(records.length,1);assert.deepEqual(records[0].raw,f.candidate);
  assert.equal(records[0].proposal.outsideUnchanged,true);
  assert.equal(f.calls.includes('review'),false);assert.equal(f.accepted,undefined);
});
test('one explicitly approved correction uses the original source and measured feedback',async()=>{
  const f=fixture(),attempts=[],records=[];let reviews=0;
  f.options.generate=async(session,attempt)=>{
    attempts.push(attempt);assert.deepEqual(f.current.sourcePng,f.sourcePng);return f.candidate;
  };
  f.options.verify=async(_proposal,{attempt})=>precisionReport(attempt===0?'fail':'pass');
  f.options.onAttempt=async value=>records.push(value);
  f.options.confirmCorrection=async report=>{assert.equal(report.status,'fail');return true;};
  f.options.review=async()=>{reviews++;return true;};
  assert.equal(await runScopedPanelEdit(f.options),true);
  assert.deepEqual(attempts.map(a=>a.attempt),[0,1]);
  assert.equal(attempts[0].feedback,'');assert.ok(attempts[1].feedback.includes('dx=182px'));
  assert.equal(records.length,2);assert.equal(reviews,1);assert.ok(f.accepted);
});
test('uncertain or malformed machine reports never authorize a correction or application',async()=>{
  for(const report of [precisionReport('uncertain'),{status:'pass'},null]){
    const f=fixture();let correction=0;
    f.options.verify=async()=>report;
    f.options.confirmCorrection=async()=>{correction++;return true;};
    await assert.rejects(runScopedPanelEdit(f.options));
    assert.equal(correction,0);assert.equal(f.calls.includes('review'),false);assert.equal(f.accepted,undefined);
  }
});
test('a second precision failure cannot create a third request',async()=>{
  const f=fixture();let generated=0,corrected=0;
  f.options.generate=async()=>{generated++;return f.candidate;};
  f.options.verify=async()=>precisionReport('fail');
  f.options.confirmCorrection=async()=>{corrected++;return true;};
  await assert.rejects(runScopedPanelEdit(f.options),error=>error.code==='SCOPED_EDIT_PRECISION');
  assert.equal(generated,2);assert.equal(corrected,1);assert.equal(f.accepted,undefined);
});
test('state changes during correction authorization prevent another native request',async()=>{
  const f=fixture();let generated=0;
  f.options.generate=async()=>{generated++;return f.candidate;};
  f.options.verify=async()=>precisionReport('fail');
  f.options.confirmCorrection=async()=>{f.current.selectionRevision++;return true;};
  await assert.rejects(runScopedPanelEdit(f.options),/Stale/);
  assert.equal(generated,1);assert.equal(f.accepted,undefined);
});
