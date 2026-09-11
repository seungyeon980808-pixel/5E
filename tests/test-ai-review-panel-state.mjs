import { enforcePngAcceptance } from '../js/ai-png-inspection.js';
import { candidateReviewOnTerminal } from '../js/ai-panel.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../js/ai-panel.js',import.meta.url),'utf8');
const body=source.substring(source.indexOf('  const handleReviewLifecycle ='),source.indexOf('  imageReview = createAiImageReviewController'));
function setup(candidate) {
  const states=[],old={id:'old',reviewState:'correcting',reviewReport:{verdict:'fail',checks:[],issues:[{message:'old error'}]},reviewMeta:{generationCount:1,reviewCount:1}};
  const ctx={enforcePngAcceptance,generatedImages:[old,candidate],currentTurnDone:false,currentReviewCandidate:null,pendingCacheOutput:null,AI_IMAGE_REVIEW_MODEL:'gpt-5.6-sol',AI_IMAGE_REVIEW_EFFORT:'high',dispatchReviewEvent(detail,item){states.push(detail);if(item){item.reviewState=detail.state;item.reviewReport=detail.report}return detail},setTaskState(){},setGenerating(){},setStatus(){},addLog(){},stageCurrentOutput(output){ctx.pendingCacheOutput=output},commitCurrentOutput(){},setBusy(){},captureActiveTaskTab(){},loadAccountOverview(){}};
  return {ctx,states,old,handle:new Function('ctx',`with(ctx){${body};return handleReviewLifecycle;}`)(ctx)};
}
test('terminal review retires old correcting version without overwriting its failure',()=>{
  const candidate={id:'new',data:'PNG',pixelInspection:{opaque:true,strictlyAchromatic:true}};const f=setup(candidate);
  f.handle({state:'passed',candidateId:'new',report:{verdict:'pass',checks:[],issues:[]}},candidate);
  assert.equal(f.old.reviewState,'needs-attention');assert.equal(f.old.reviewReport.verdict,'fail');assert.equal(f.states.at(-1).state,'passed');assert.equal(f.ctx.pendingCacheOutput.reviewVerified,true);
});
test('transparent candidate cannot be cached as reviewed pass',()=>{
  const candidate={id:'new',data:'PNG',pixelInspection:{opaque:false}};const f=setup(candidate);
  f.handle({state:'passed',candidateId:'new',report:{verdict:'pass',checks:[],issues:[]}},candidate);
  assert.equal(f.states.at(-1).state,'needs-attention');assert.equal(f.ctx.pendingCacheOutput,null);
});
test('pixel inspection failure remains explicit despite visual review pass',()=>{
  const candidate={id:'new',data:'PNG',pixelInspectionError:'decode failed'};const f=setup(candidate);
  f.handle({state:'passed',candidateId:'new',report:{verdict:'pass',checks:[],issues:[]}},candidate);
  assert.equal(f.states.at(-1).state,'needs-attention');assert.equal(f.ctx.pendingCacheOutput,null);
});
test('chromatic PNG from actual trial cannot override file contract with visual pass',()=>{
 const candidate={id:'new',data:'PNG',pixelInspection:{opaque:true,strictlyAchromatic:false,chromaticPixels:270046}};const f=setup(candidate);
 f.handle({state:'passed',report:{verdict:'pass',checks:[{id:'presentation',status:'pass',detail:'looks white'}],issues:[]}},candidate);
 assert.equal(f.states.at(-1).state,'needs-attention');assert.equal(f.states.at(-1).report.verdict,'fail');assert.equal(f.states.at(-1).report.checks[0].status,'fail');assert.equal(f.ctx.pendingCacheOutput,null);
});
test('missing historical file metrics cannot restore a certified pass',()=>{
 const d={state:'passed',report:{verdict:'pass',checks:[],issues:[]}};
 assert.equal(enforcePngAcceptance(d,{pixelInspection:{opaque:true}}).state,'needs-attention');assert.equal(d.state,'passed');
});
test('actual cancellation retires only the current generating candidate and preserves its output',()=>{
 const report={verdict:'uncertain',checks:[],issues:[]};
 const current={id:'current',data:'PNG-BYTES',reviewState:'generating',reviewReport:report,reviewMeta:{generationCount:1,reviewCount:0,model:'model',effort:'high'}};
 assert.deepEqual(candidateReviewOnTerminal(current,'cancelled'),{...current.reviewMeta,state:'cancelled',candidateId:'current',report});
 assert.equal(current.data,'PNG-BYTES');assert.equal(current.reviewState,'generating');
 assert.equal(candidateReviewOnTerminal({...current,reviewState:'passed'},'cancelled'),null);
 assert.equal(candidateReviewOnTerminal(current,'failed'),null);
});
