const test=require('node:test');
const assert=require('node:assert/strict');
const review=import('../js/ai-image-review.js');
const core=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope'];
const label=['raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
const response=(changes={},issues=[])=>JSON.stringify({verdict:'pass',checks:[...core,...label].map(id=>({id,label:id,status:changes[id]||'pass',detail:'실제 첨부를 대조한 관찰'})),issues});

test('image failure remains blocked even when the independent label checks pass',async()=>{
 const {parseImageReviewReport:parse}=await review;
 const r=parse(response({connections:'fail'},[{checkId:'connections',message:'실제 관이 끊김',severity:'major'}]),{requireCompositeChecks:true});
 assert.equal(r.ok,true);assert.notEqual(r.report.verdict,'pass');assert.equal(r.report.labelReview.verdict,'pass');
 assert.equal(r.report.labelReview.editability,'not-verified');assert.equal(r.report.issues[0].checkId,'connections');
});
for(const id of ['raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography'])test(`${id} cannot be waived by standard styling`,async()=>{
 const {parseImageReviewReport:parse}=await review;
 const r=parse(response({[id]:'fail'},[{checkId:id,message:'필수 조건 미충족',severity:'major'}]),{requireCompositeChecks:true});
 assert.notEqual(r.report.verdict,'pass');assert.equal(r.report.labelReview.verdict,'fail');
});
test('unknown issue scope and missing overlay evidence cannot silently certify labels',async()=>{
 const {parseImageReviewReport:parse,summarizeLabelReview:summarize}=await review;
 assert.equal(parse(response({},[{message:'미분류 문제'}]),{requireCompositeChecks:true}).report.labelReview.verdict,'uncertain');
 assert.equal(summarize({checks:[],issues:[]}).verdict,'uncertain');
 assert.equal(parse(response({},[{checkId:'invented',message:'문제'}]),{requireCompositeChecks:true}).ok,false);
});
test('mechanical readability failures cannot be hidden by a visual pass',async()=>{
 const {parseImageReviewReport:parse,summarizeLabelReview:summarize}=await review;
 const r=parse(response(),{requireCompositeChecks:true}).report;
 assert.equal(summarize(r,[{code:'clipped-label',id:'l1'}]).verdict,'uncertain');
});
test('result normalization retains the label verdict through serialization and rejects unknown policy summaries',async()=>{
 const {parseImageReviewReport:parse}=await review;
 const {normalizeReviewDetail}=await import('../js/ai-workbench.js');
 const report=parse(response({connections:'fail'},[{checkId:'connections',message:'관 단절'}]),{requireCompositeChecks:true}).report;
 const restored=JSON.parse(JSON.stringify(normalizeReviewDetail({state:'needs-attention',report})));
 assert.equal(restored.report.labelReview.verdict,'pass');assert.notEqual(restored.report.verdict,'pass');
 assert.equal(restored.report.labelReview.editability,'not-verified');assert.equal(restored.report.issues[0].checkId,'connections');
 assert.equal(normalizeReviewDetail({report:{...report,labelReview:{policy:'old',verdict:'pass'}}}).report.labelReview,undefined);
});
