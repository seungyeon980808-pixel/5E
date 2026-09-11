import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const file = process.env.FIVE_E_REVIEW_MODULE
  ? pathToFileURL(resolve(process.env.FIVE_E_REVIEW_MODULE))
  : new URL('../js/ai-image-review.js', import.meta.url);
// Preserve the module's filesystem base so its relative dependencies resolve.
const m = await import(file.href);
const template = () => JSON.parse(m.buildImageReviewPrompt({}).split('\n').find(line => line.startsWith('{"verdict"')));
const passing = () => ({verdict:'pass',checks:template().checks.map(c=>({...c,status:'pass',detail:'원본과 후보를 직접 대조한 근거'})),issues:[]});
const flush = async () => { await new Promise(resolve=>setImmediate(resolve)); await new Promise(resolve=>setImmediate(resolve)); };

test('review cannot pass without observation evidence', () => {
  const report=passing(); report.checks[0].detail='';
  const result=m.parseImageReviewReport(JSON.stringify(report));
  assert.ok(!result.ok || result.report.verdict!=='pass');
});
test('review cannot pass when any additional style check fails', () => {
  const report=passing(); report.checks.push({id:'surface-texture',label:'질감',status:'fail',detail:'후보에 원본보다 과도한 해칭이 있음'});
  const result=m.parseImageReviewReport(JSON.stringify(report));
  assert.ok(!result.ok || result.report.verdict!=='pass');
});
test('duplicate gate ids cannot overwrite a failed structural check', () => {
  const report=passing();report.checks.unshift({...report.checks[0],status:'fail',detail:'원본 객체가 누락됨'});
  const result=m.parseImageReviewReport(JSON.stringify(report));
  assert.ok(!result.ok || result.report.verdict!=='pass');
});
test('issue with unspecified severity cannot silently become a pass', () => {
  const report=passing();report.issues.push({message:'원본의 액체가 다른 용기로 이동함'});
  const result=m.parseImageReviewReport(JSON.stringify(report));
  assert.ok(!result.ok || result.report.verdict!=='pass');
});
function fixture() {
  const calls=[],states=[];
  const controller=m.createAiImageReviewController({transport:{send:async payload=>{calls.push(payload);return{turnId:'t'+calls.length,renderThreadId:'r'+calls.length}}},onState:d=>states.push(d)});
  const options={candidate:{id:'candidate-1'},request:'과학 구조를 보존',modelAvailable:true,originalAttachments:[{data:'source'}],referenceNames:['source'],prepareCandidateAttachment:async()=>({data:'candidate'}),makeCorrectionPayload:async()=>({purpose:'image'}),acceptCorrectionImage:async()=>({id:'candidate-2'})};
  return{controller,calls,states,options};
}
test('unexpected image generation during review cannot count as successful review', async () => {
  const f=fixture();await f.controller.start(f.options);
  f.controller.handleEvent({kind:'image',turnId:'t1',src:'data:image/png;base64,unexpected'});
  f.controller.handleEvent({kind:'assistant',turnId:'t1',text:JSON.stringify(passing())});
  f.controller.handleEvent({kind:'done',turnId:'t1',status:'completed'});await flush();
  assert.notEqual(f.states.at(-1).state,'passed');
});
test('duplicate completion cannot schedule duplicate correction or finish prematurely', async () => {
  const f=fixture();let release;f.options.makeCorrectionPayload=()=>new Promise(resolve=>{release=resolve});await f.controller.start(f.options);
  const report=passing();report.verdict='fail';report.checks[0].status='fail';report.issues=[{message:'물체 누락',severity:'major'}];
  f.controller.handleEvent({kind:'assistant',turnId:'t1',text:JSON.stringify(report)});
  f.controller.handleEvent({kind:'done',turnId:'t1',status:'completed'});
  f.controller.handleEvent({kind:'done',turnId:'t1',status:'completed'});
  release({purpose:'image'});await flush();
  assert.equal(f.calls.length,2);
  assert.equal(f.controller.getState().generationCount,2);
  assert.equal(f.controller.isActive(),true);
});
test('cancelled candidate preparation cannot send a stale review into a new run', async () => {
  const f=fixture();let release;
  const first=f.controller.start({...f.options,prepareCandidateAttachment:()=>new Promise(resolve=>{release=resolve})});
  f.controller.cancel();
  await f.controller.start({...f.options,candidate:{id:'new-candidate'}});
  release({data:'old-candidate'});await first;await flush();
  assert.equal(f.calls.length,1);
  assert.equal(f.controller.getState().candidateId,'new-candidate');
});

test('missing request-scope gate cannot pass preservation review',()=>{
  const report=passing();report.checks=report.checks.filter(c=>c.id!=='request-scope');
  assert.equal(m.parseImageReviewReport(JSON.stringify(report)).ok,false);
});
test('unrequested change fails even when the other structural gates pass',()=>{
  const report=passing();const gate=report.checks.find(c=>c.id==='request-scope');
  gate.status='fail';gate.detail='요청하지 않은 그릇의 윤곽이 수정 전 버전과 달라졌다.';
  const result=m.parseImageReviewReport(JSON.stringify(report));
  assert.ok(!result.ok||result.report.verdict!=='pass');
});
test('review differentiates intended change and the previous-version reference',()=>{
  const prompt=m.buildImageReviewPrompt({request:'그릇을 오른쪽으로 옮겨 주세요.',referenceNames:['원본','수정 전 선택 버전 · 초안']});
  assert.match(prompt,/의도한 개수·위치·연결 변경/);assert.match(prompt,/추가 물체나 패널이 아니라/);
});
