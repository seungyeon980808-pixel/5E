import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeMarkPolicy,buildMarkPolicyContract} from '../js/ai-mark-policy.js';
import {buildStructureAnalysisPrompt} from '../js/ai-structure-spec.js';
import {buildWhitePngPrompt} from '../js/ai-white-png.js';
import {buildImageReviewPrompt,createAiImageReviewController} from '../js/ai-image-review.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('policy defaults and malformed persisted selections are deterministic',()=>{
 assert.deepEqual(normalizeMarkPolicy(),{arrows:'structural',trendLines:'keep',leaders:'remove'});
 assert.deepEqual(normalizeMarkPolicy(null),normalizeMarkPolicy());
 assert.deepEqual(normalizeMarkPolicy({arrows:'invent',trendLines:'bad',leaders:undefined}),normalizeMarkPolicy());
});
test('all 12 combinations reach generation/revision/review with consistent selection',()=>{
 for(const arrows of ['structural','keep','remove'])for(const trendLines of ['keep','remove'])for(const leaders of ['keep','remove']){
 const policy={arrows,trendLines,leaders};const contract=buildMarkPolicyContract(policy);
 for(const revision of [false,true])assert.ok(buildWhitePngPrompt({revision,markPolicyContract:contract}).includes(contract));
 assert.ok(buildImageReviewPrompt({markPolicyContract:contract}).includes(contract));
 assert.deepEqual(policy,{arrows,trendLines,leaders});
 if(arrows==='keep'){assert.match(contract,/화살표: 모두 유지/);assert.doesNotMatch(buildWhitePngPrompt({markPolicyContract:contract}),/지시선\(leader lines\), 주석용 화살표를 그리지 않는다/);}
 if(arrows==='remove'){assert.match(contract,/화살표: 모두 제거/);assert.match(contract,/화살표 몸통까지 제거/);}
 assert.match(contract,/실제 물체의 윤곽·관·도선·막·층 경계/);assert.match(contract,/의도된 변화/);
 }
});
test('review controller preserves the selected contract on its independent turn',async()=>{
 const sent=[];const c=createAiImageReviewController({transport:{send:async p=>{sent.push(p);return{turnId:'r1',threadId:'t1'}}}});
 const contract=buildMarkPolicyContract({arrows:'remove',trendLines:'remove',leaders:'keep'});
 await c.start({candidate:{id:'x',name:'후보'},markPolicyContract:contract,modelAvailable:true,prepareCandidateAttachment:async()=>({name:'후보',data:'PNG'}),makeCorrectionPayload:async()=>({}),acceptCorrectionImage:async()=>({id:'y'})});
 assert.ok(sent[0].text.includes(contract));c.cancel();await tick();
});
test('actual panel snapshots policy, blocks changes while busy and separates output cache options',async()=>{
 const source=await readFile(new URL('../js/ai-panel.js',import.meta.url),'utf8');
 assert.match(source,/tab.markPolicy = readMarkPolicy\(\)/);assert.match(source,/restoreMarkPolicy\(tab.markPolicy\)/);
 assert.match(source,/markPolicy: normalizeMarkPolicy\(item\?\.markPolicy\)/);
 assert.match(source,/reviewEffortSelect, \.\.\.markControls/);
 assert.match(source,/markPolicyContract: buildMarkPolicyContract\(runInput.markPolicy\)/);
 assert.match(source,/markPolicy: isWhitePngWorkflow\(runInput\) \? normalizeMarkPolicy/);
 assert.match(source,/markPolicyContract: buildMarkPolicyContract\(job.markPolicy\)/);
});

test('all mark selections protect physical calibration ticks separately from text and leaders',()=>{
 for(const arrows of ['structural','keep','remove'])for(const trendLines of ['keep','remove'])for(const leaders of ['keep','remove']){
  const c=buildMarkPolicyContract({arrows,trendLines,leaders});
  assert.match(c,/보조선·지시선 제거는 기기 자체의 눈금선 삭제를 뜻하지 않는다/);
  assert.match(c,/명시적인 눈금 삭제 요청이 없으면/);
  assert.match(c,/annotation 분류도 이 보호를 뒤집지 않는다/);
 }
});
test('observer and reviewer distinguish real calibration marks from textual annotations',()=>{
 const a=buildStructureAnalysisPrompt({referenceNames:['unseen source']});
 assert.match(a,/계측 눈금선은.*structural로 관찰/);
 const r=buildImageReviewPrompt();
 assert.match(r,/실제 눈금이 남아 있음을 문자 잔존 실패로 오판하지 않는다/);
 assert.match(r,/빈 막대·빈 계기로 바뀌면/);
 assert.match(r,/개별 눈금 수를 발명하지 않는다/);
});
test('first generation and correction preserve ticks against a mistaken deletion suggestion',()=>{
 for(const revision of [false,true]){
  const p=buildWhitePngPrompt({revision});
  assert.match(p,/이전 검수의 삭제 제안이 원본의 실제 눈금 보존을 뒤집게 하지 않는다/);
  assert.match(p,/숫자·단위·문자는 제거하되 눈금선 자체/);
 }
});
