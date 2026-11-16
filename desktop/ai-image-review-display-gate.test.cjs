const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../js/ai-image-review.js');
const style=import('../js/ai-image-style-contract.js');
const CORE=[['object-counts','객체·부품 수'],['inside-outside','안/밖 및 포함 관계'],['liquid-occupancy','액체 점유와 경계'],['connections','연결·접촉·분기'],['composition-state','방향·상대 배치·패널 상태'],['black-fill-meaning','검은 채움의 의미 구분'],['presentation','문자·질감·배경 표현'],['request-scope','요청 반영·요청 외 보존']];
async function report(overrides={},extra=[],issues=[]){
 const {REQUIRED_STYLE_CHECKS}=await style;
 const checks=[...CORE,...REQUIRED_STYLE_CHECKS,['raster-label-removal','원본 글자·기호 잔존'],...extra].map(([id,label])=>({id,label,status:overrides[id]||'pass',detail:'관찰 근거'}));
 return {verdict:Object.values(overrides).includes('fail')?'fail':'pass',checks,issues};
}
const general={imageKind:'general',labelResult:'remove'};
test('layout and scope disagreements are advisory: shown as passed, never cached',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 const r=g(await report({'composition-state':'fail','request-scope':'fail'},[],[{checkId:'composition-state',message:'비율이 다르다',severity:'major'}]),{workflow:general});
 assert.equal(r.accepted,true);assert.equal(r.state,'passed');assert.equal(r.strictAccepted,false);
 assert.deepEqual(r.report.advisory.map(a=>a.checkId),['composition-state','request-scope']);
});
test('uncertain checks and minor notes do not block the notice',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 const r=g(await report({presentation:'uncertain'},[],[{message:'작은 차이',severity:'minor',checkId:'presentation'}]),{workflow:general});
 assert.equal(r.accepted,true);assert.equal(r.strictAccepted,false);
});
test('core scientific structure failures with a major or critical issue still block',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 for(const id of ['object-counts','inside-outside','liquid-occupancy','connections','raster-label-removal']) for(const severity of ['major','critical']){
  const r=g(await report({[id]:'fail'},[],[{checkId:id,message:'부품이 빠졌다',severity}]),{workflow:general});assert.equal(r.accepted,false,id);assert.equal(r.state,'needs-attention');assert.deepEqual(r.report.advisory,[]);
 }
});
test('a core failure without a serious issue (cannot confirm) is advisory',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 for(const issues of [[],[{checkId:'connections',message:'같은 형태로 확인할 수 없다',severity:'minor'}],[{checkId:'connections',message:'같은 형태로 확인할 수 없다'}]]){
  const r=g(await report({connections:'fail'},[],issues),{workflow:general});assert.equal(r.accepted,true);assert.equal(r.strictAccepted,false);
  assert.ok(r.report.advisory.some(a=>a.checkId==='connections'));
 }
});
test('pipeline-recorded major problems and malformed reports still block',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 assert.equal(g(await report({},[],[{message:'연결 대상 대응을 확인해야 합니다.',severity:'major'}]),{workflow:general}).accepted,false);
 assert.equal(g({verdict:'pass',checks:[],issues:[]},{workflow:general}).accepted,false);
});
test('restored editable label checks keep blocking',async()=>{
 const {enforceImageLabelAcceptance:g,LABEL_REVIEW_CHECKS:L,LABEL_COMPOSITE_REVIEW_CHECKS:C}=await api;
 const wf={imageKind:'general',labelResult:'restore-editable'};
 assert.equal(g(await report({},[...L.slice(1),...C]),{workflow:wf}).accepted,true);
 assert.equal(g(await report({'leader-relations':'fail'},[...L.slice(1),...C],[{checkId:'leader-relations',message:'지시선 대상이 다르다',severity:'major'}]),{workflow:wf}).accepted,false);
});
test('a fully passing report is accepted on both gates',async()=>{
 const {enforceImageLabelAcceptance:g}=await api;
 const r=g(await report(),{workflow:general});assert.equal(r.accepted,true);assert.equal(r.strictAccepted,true);assert.deepEqual(r.report.advisory,[]);
});
