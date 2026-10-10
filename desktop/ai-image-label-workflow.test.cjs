const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../js/ai-image-label-workflow.js');
for(const imageKind of ['exam','general']) for(const labelResult of ['remove','restore-editable']) test(`explicit ${imageKind}/${labelResult} keeps independent choices`,async()=>{
 const {normalizeImageLabelWorkflow:n,buildImageLabelWorkflowContract:c}=await api;
 const p=n({imageKind,labelResult},{requireExplicit:true});
 assert.equal(p.imageKind,imageKind);assert.equal(p.labelResult,labelResult);assert.equal(p.auxiliaryMarks,imageKind==='exam'?'keep':'remove');assert.equal(p.scientificArrows,'keep');
 assert.match(c(p),/라벨 소속 제거를 뒤집지 않는다/);
 assert.match(c(p),imageKind==='exam'?/전체 이미지 생성·스타일 변환 금지/:/최초 스타일 변환 1회/);
});
test('missing, malformed and obsolete workflow cannot resume implicitly',async()=>{
 const {normalizeImageLabelWorkflow:n}=await api;
 for(const value of [undefined,{},[],{imageKind:'exam'},{imageKind:'other',labelResult:'remove'},{imageKind:'exam',labelResult:'remove',version:'old'},{imageKind:'exam',labelResult:'remove',scientificArrows:'guess'}]) assert.throws(()=>n(value,{requireExplicit:true}));
 assert.equal(n({}).explicit,false);
});
test('mark keep options cannot retain label leaders and endpoints',async()=>{
 const {buildMarkPolicyContract,normalizeMarkPolicy}=await import('../js/ai-mark-policy.js');
 const p=buildMarkPolicyContract({arrows:'keep',leaders:'keep'});
 assert.equal(normalizeMarkPolicy().arrows,'keep');assert.match(p,/라벨 소속 제거가 위 표시선 선택보다 우선/);assert.match(p,/빈 원의 테두리/);assert.doesNotMatch(p,/주석용 화살표 모두/);
});
test('normalization never upgrades an invalid legacy policy to an explicit selection',async()=>{
 const {normalizeImageLabelWorkflow:n}=await api;
 const legacy=n({imageKind:'exam',labelResult:'remove',version:'old'});
 assert.equal(legacy.explicit,false);assert.throws(()=>n(legacy,{requireExplicit:true}));
});
test('legacy verification is full while new drafts are an explicit choice',async()=>{
 const {normalizeImageLabelWorkflow:n,IMAGE_LABEL_WORKFLOW_VERSION:version}=await api;
 const legacy=n({version:'1.0.0',imageKind:'general',labelResult:'restore-editable'},{requireExplicit:true});
 assert.equal(legacy.verificationMode,'full');assert.equal(legacy.version,version);
 const draft=n({...legacy,verificationMode:'draft-first'},{requireExplicit:true});
 assert.equal(draft.verificationMode,'draft-first');assert.equal(draft.explicit,true);
 assert.throws(()=>n({...legacy,verificationMode:'unknown'},{requireExplicit:true}));
});
test('verification mode distinguishes approved cache descriptors',async()=>{
 const {buildExactOutputCacheDescriptor:c}=await import('../js/ai-remote-input-plan.js');
 const {normalizeImageLabelWorkflow:n}=await api;
 const input={mode:'image-label-workflow',model:'gpt-6.1-sol'};
 const full=c({...input,outputOptions:{workflow:n({imageKind:'general',labelResult:'restore-editable',verificationMode:'full'})}});
 const draft=c({...input,outputOptions:{workflow:n({imageKind:'general',labelResult:'restore-editable',verificationMode:'draft-first'})}});
 assert.notDeepEqual(full,draft);
});
