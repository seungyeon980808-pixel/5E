import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { approvedFirstRun, APPROVED_FIRST_PROMPT, prepareApprovedFirstAttachment } from '../js/ai-approved-first-png.js';
import { candidateUsesAutomaticSeparation } from '../js/ai-panel.js';
const models = [{ model:'gpt-5.6-sol', supportedReasoningEfforts:['medium','high'] }];
const source = { attachments:[{referenceRole:'INPUT_SOURCE'}], model:'different', effort:'low', serviceTier:'standard' };
test('approved first conversion pins actual transport settings and rejects unavailable model or effort',()=>{
  const result = approvedFirstRun(source,models);
  assert.deepEqual([result.model,result.effort,result.serviceTier,result.approvedFirstPng],['gpt-5.6-sol','medium','priority',true]);
  assert.equal(source.model,'different');
  for(const available of [[],[{...models[0],model:'other'}],[{...models[0],supportedReasoningEfforts:['high']}]]) assert.throws(()=>approvedFirstRun(source,available));
});
test('first conversion accepts exactly one source and rejects STYLE attachments',()=>{
  for(const attachments of [[],[{referenceRole:'STYLE_REFERENCE'}]]) assert.throws(()=>approvedFirstRun({...source,attachments},models));
  assert.equal(approvedFirstRun({...source,attachments:[{},{}]},models).approvedFirstPng,true);
  assert.equal(approvedFirstRun({...source,attachments:[{}, {referenceRole:'STYLE_REFERENCE'}]},models).approvedFirstPng,true);
});
test('approved protocol artifact remains byte-identical to the user-approved request',()=>{
  assert.equal(createHash('sha256').update(APPROVED_FIRST_PROMPT).digest('hex'),'8d6180f311791d497469d93cbc0eff98919b0d376d84a958f2b391c475e14067');
});
test('input preparation failure stops before AI instead of silently using a fallback',async()=>{
  await assert.rejects(prepareApprovedFirstAttachment({data:'broken'}));
});

test('first PNG display decode cannot register a stale or cancelled candidate',async()=>{
  const fs=await import('node:fs/promises');
  const vm=await import('node:vm');
  const code=await fs.readFile(new URL('../js/ai-panel.js',import.meta.url),'utf8');
  const start=code.indexOf('  const addPreview = async');
  const end=code.indexOf('  const addScenePreview',start);
  for(const stale of [true,false]) {
    let ready,notifyReady,current=true,cards=0;
    const decoding=new Promise(resolve=>{notifyReady=resolve;});
    const ctx={performance,currentRunInput:{approvedFirstPng:true},generatedImages:[],imageSerial:0,
      currentTurnPerformance:{},selectedCandidateId:null,latestGeneratedSrc:null,
      candidateUsesAutomaticSeparation,startAutomaticSeparation(){},
      isWhitePngWorkflow:()=>true,emptyReviewReport:()=>({}),normalizeMarkPolicy:()=>({}),
      inspectPngDataUrl:async()=>({}),panel:{dataset:{}},syncWhitePngUi(){},
      previews:{querySelector:()=>null,prepend(){cards++;}},makeImageCard:()=>({}),
      Image:class {decode(){return new Promise(resolve=>{ready=resolve;notifyReady();});}},
      imgReady:async image=>image.decode()};
    const addPreview=vm.runInNewContext(code.slice(start,end)+'\naddPreview;',ctx);
    const pending=addPreview('data:image/png;base64,fixture',{alreadyEditable:true,isCurrent:()=>current});
    await decoding;
    assert.equal(ctx.generatedImages.length,0);assert.equal(cards,0);
    if(stale)current=false;
    ready();const result=await pending;
    assert.equal(ctx.generatedImages.length,stale?0:1);assert.equal(cards,stale?0:1);
    if(stale)assert.equal(result,false);
  }
});
