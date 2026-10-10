const test=require('node:test'),assert=require('node:assert/strict');
const api=import('../js/ai-label-verification.js');
test('joint selection reserves whole groups and never promotes missing source identity',async()=>{
 const {selectJointLabelProposal}=await api;
 const candidate=(id,x)=>({candidateId:id,glyphs:[{id,box:{x,y:.2,w:.1,h:.1}}]});
 const p={groups:[{id:'one',labelIds:['a'],candidates:[candidate('one',.2)]},{id:'two',labelIds:['b'],candidates:[candidate('overlap',.25),candidate('clear',.4)]},{id:'unknown',labelIds:['c'],candidates:[candidate('invented',.6)]}]};
 const plan={sourceAssociations:[{labelId:'a',status:'confirmed',objectId:'object'},{labelId:'b',status:'confirmed',objectId:'object'},{labelId:'c',status:'uncertain',reason:'unreadable'}]};
 const chosen=selectJointLabelProposal(plan,p);
 assert.equal(chosen.groups[1].candidates[0].candidateId,'clear');assert.equal(chosen.groups[2].candidates.length,0);assert.equal(p.groups[1].candidates.length,2);
});
test('different fallback composite cannot inherit a pass or the preview bindings',async()=>{
 const {retainFinalVerification}=await api;
 const report={verdict:'pass',checks:[],issues:[]},preview={composite:{attachment:{data:'reviewed-preview'}}};
 const composite={attachment:{data:'different-fallback'},bindings:{compositeSha256:'final'},report:{status:'mechanical-checks-clear',issues:[],measurements:[]}};
 const result=retainFinalVerification({report,preview,composite,placement:{status:'mapped'}});
 assert.equal(result.verdict,'uncertain');assert.equal(result.compositeBindings.compositeSha256,'final');assert.ok(result.issues.some(i=>i.code==='final-composite-changed-after-review'));assert.equal(report.verdict,'pass');
});
test('same rendered bytes still do not clear unconfirmed fallback or mechanical clipping',async()=>{
 const {retainFinalVerification}=await api;
 const preview={composite:{attachment:{data:'same'}}},composite={attachment:{data:'same'},bindings:{},report:{status:'needs-attention',issues:[{code:'clipped-final-glyph',id:'fallback'}]}};
 const result=retainFinalVerification({report:{verdict:'pass'},preview,composite,placement:{status:'needs-attention'}});
 assert.equal(result.verdict,'uncertain');assert.ok(result.issues.some(i=>i.code==='clipped-final-glyph'));
 const missing=retainFinalVerification({report:{verdict:'pass'},preview,composite:null,placement:{status:'needs-attention'}});assert.equal(missing.verdict,'uncertain');
});
