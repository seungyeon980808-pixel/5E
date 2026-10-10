const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
test('real bundled OCR feeds controller IDs; live PDF receipt survives snapshot and reloaded receipt uses OCR',{timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true});
 const evidence=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/luna-label-source-candidates-20261006/browser');fs.mkdirSync(evidence,{recursive:true});
 try{
  const page=await browser.newPage();await page.goto(process.env.RELEASE_URL||process.env.PREVIEW_URL,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
   const v='?v=1.7.0-four-session-integration';
   const {createSourceLabelController}=await import('/js/ai-source-label-plan.js'+v),{createPdfSourceTextCandidates,collectSourceLabelCandidates}=await import('/js/ai-source-label-candidates.js'+v),{snapshotImageItem}=await import('/js/ai-panel.js'+v);
   const canvas=document.createElement('canvas');canvas.width=500;canvas.height=350;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,500,350);ctx.fillStyle='#000';ctx.font='30px Arial';ctx.fillText('Sensor',40,55);ctx.strokeRect(250,200,100,100);const data=canvas.toDataURL('image/png');
   const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   let controller,receipt,payload;let sends=0;
   controller=createSourceLabelController({transport:{send:async p=>{
    sends++;payload=p;const candidate=receipt.candidateSets[0].candidates.find(c=>/Sensor/i.test(c.text));if(!candidate)throw Error('Real OCR did not locate fixture label');
    const wire={version:4,observationVersion:1,leaderObservationVersion:1,labels:[{id:'sensor',text:'Sensor',sourceRef:1,scope:'general',leaderPresence:'absent',mode:'text',contentMode:'plain',typography:{role:'name'},textCandidateIds:[candidate.id],targetBinding:{status:'confirmed',objectId:'object',reason:'Mock transport fixture; not AI quality evidence'}}],geometryLock:{version:1,objects:[{id:'object',sourceRef:1,description:'visible rectangle',bounds:{x:.5,y:.57,w:.2,h:.29},relations:[]}]},uncertainties:[],preservedMarks:[],removalRegions:[],protectedRegions:[],inkSearchRegions:[]};
    queueMicrotask(()=>{controller.handleEvent({kind:'assistant',threadId:'mock-source',text:JSON.stringify(wire)});controller.handleEvent({kind:'done',threadId:'mock-source',status:'completed'});});return {threadId:'mock-source'};
   }}});
   const plan=await controller.analyze({attachments:[{name:'fixture.png',data}],model:'gpt-6-luna',effort:'medium',models:[{model:'gpt-6-luna',supportedReasoningEfforts:['medium'],serviceTiers:[]}],onSourceCandidates:r=>receipt=r});
   const pageRecord={documentId:'fixture-pdf',pageNumber:1,words:[{text:'Sensor',rect:[.08,.08,.2,.08]}]},documentRecord={id:'fixture-pdf',pages:[pageRecord]};
   const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
   const pdf=await createPdfSourceTextCandidates({document:documentRecord,page:pageRecord,render:{bytes,width:500,height:350,source:{documentId:'fixture-pdf',pageNumber:1,rect:[0,0,1,1]}},data});
   const snap=snapshotImageItem({id:'fixture',data,sourceTextCandidates:pdf});
   const live=await collectSourceLabelCandidates({data,sourceSha256:sha,pdfTextCandidates:snap.sourceTextCandidates});
   const reloaded=await collectSourceLabelCandidates({data,sourceSha256:sha,pdfTextCandidates:structuredClone(snap.sourceTextCandidates)});
   return {nativeCalls:0,mockedTransportSends:sends,receipt,plan,payloadCandidateEnum:payload.outputSchema.$defs.textCandidateId.enum,livePDF:live,reloaded:snapshotImageItem({sourceTextCandidates:reloaded}),reloadedCollection:reloaded,snapshotIdentityRetained:snap.sourceTextCandidates===pdf};
  });
  fs.writeFileSync(path.join(evidence,'source-candidates-browser-result.json'),JSON.stringify(result,null,2));
  assert.equal(result.nativeCalls,0);assert.equal(result.mockedTransportSends,1);assert.ok(result.receipt.candidateSets[0].candidates.length>0);
  assert.equal(result.receipt.collections[0].width,500);assert.equal(result.receipt.collections[0].height,350);
  assert.ok(result.plan.sourceTextCandidateSelections[0].textCandidateIds.every(id=>result.payloadCandidateEnum.includes(id)));
  assert.equal(result.plan.labels[0].text,'Sensor');assert.equal(result.plan.removalReadiness.pixelReady,false);
  assert.equal(result.snapshotIdentityRetained,true);assert.ok(result.livePDF.candidates.every(c=>c.origin==='pdf-text'));assert.equal(result.livePDF.timings.recognitionMs,0);
  assert.ok(result.reloadedCollection.candidates.some(c=>c.origin==='ocr'));assert.ok(result.reloadedCollection.diagnostics.some(d=>/pdf/.test(d.code)));
 }finally{await browser.close();}
});
