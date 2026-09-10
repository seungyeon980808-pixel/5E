import test from 'node:test';
import assert from 'node:assert/strict';
import { initAiPanel, runScopedPanelEdit, scopedPngBytes, scopedPngData, scopedPixelRectangles, scopedImageCompletionStatus } from '../js/ai-panel.js';
import { parseAiEvent } from '../js/ai-events.js';
import { resolveGeneratedRaster } from '../js/ai-raster-output.js';
import { transparentizeGeneratedImage } from '../js/image-background.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';
import { encodeTestRgbaPng, decodeTestPng } from './helpers/scoped-edit-png-fixture.mjs';
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
test('scoped panel whitePng and alreadyEditable seams bypass whole-image post-processing and preserve protected RGBA',async()=>{
  const width=5,height=5;
  const sourcePixels=new Uint8Array(width*height*4);
  const candidatePixels=new Uint8Array(width*height*4);
  for(let pixel=0;pixel<width*height;pixel+=1){
    sourcePixels.set([255,255,255,255],pixel*4);
    candidatePixels.set([255,255,255,255],pixel*4);
  }
  const setPixel=(pixels,x,y,rgba)=>pixels.set(rgba,(y*width+x)*4);
  setPixel(sourcePixels,1,2,[10,80,150,255]);
  setPixel(sourcePixels,2,2,[40,40,40,255]);
  setPixel(sourcePixels,3,2,[77,88,99,0]);
  setPixel(candidatePixels,2,2,[17,91,203,211]);

  const sourcePng=encodeTestRgbaPng({width,height,data:sourcePixels});
  const candidatePng=encodeTestRgbaPng({width,height,data:candidatePixels});
  const sourceData=scopedPngData(sourcePng);
  const candidateData=scopedPngData(candidatePng);
  const expectedPixels=sourcePixels.slice();
  setPixel(expectedPixels,2,2,[17,91,203,211]);

  const workspace={key:'workspace',activeTaskTabId:'task-1',taskTabSerial:1,imageSerial:1,tabs:[{
    id:'task-1',title:'task',workState:'idle',attachments:[],conversationMessages:[],uiMessages:[],
    input:'change selected pixel',conversationId:null,mode:'diagram',qualityMode:'simple',outputEngine:'raster',generationMode:'single',
    selectedCandidateId:'generated-1',generated:[{
      id:'generated-1',name:'source',data:sourceData,kind:'generated',postprocessOk:true,
      reviewState:'scoped-applied',reviewReport:{verdict:'',checks:[],issues:[]},generationMode:'single',nextCommentNumber:2,
      comments:[{number:1,type:'area',imageId:'generated-1',x:40,y:40,w:20,h:20,text:'change selected pixel'}]
    }]
  }]};
  let whitePngTransformCalls=0;
  assert.equal(await resolveGeneratedRaster(candidateData,{whitePng:true,transform:()=>{whitePngTransformCalls+=1;return 'changed';}}),candidateData);
  assert.equal(whitePngTransformCalls,0);

  const browser=installAiPanelBrowserFixture({workspace});
  const stateValue={objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try{
    // Prove the browser fixture is sensitive to both legacy operations: the
    // protected white background is removed and the colored stroke quantized.
    const legacyData=await transparentizeGeneratedImage(scopedPngData(encodeTestRgbaPng({width,height,data:expectedPixels})));
    const legacyPixels=decodeTestPng(scopedPngBytes(legacyData)).data;
    assert.notDeepEqual(legacyPixels.slice(0,4),expectedPixels.slice(0,4));
    assert.notDeepEqual(legacyPixels.slice((2*width+1)*4,(2*width+2)*4),expectedPixels.slice((2*width+1)*4,(2*width+2)*4));
    assert.equal(browser.document.rasterDrawCount,1);
    browser.document.rasterDrawCount=0;

    manager=initAiPanel({get:()=>stateValue});
    await manager.open();
    const candidateSelect=browser.panel.querySelector('[data-ai-candidate-select]');
    candidateSelect.value='generated-1';

    const boundsDialogReady=browser.document.waitForAdded(node=>node.localName==='dialog');
    browser.panel.querySelector('[data-ai-scoped-edit-selected]').click();
    const boundsDialog=await boundsDialogReady;
    const sendReady=browser.desktop.waitForSend();
    boundsDialog.querySelector('.ai-confirm-accept').click();
    const request=await sendReady;
    assert.equal(request.payload.purpose,'image');
    assert.equal(request.payload.ephemeralRender,true);
    assert.equal(request.payload.attachments[0].data,sourceData);

    const reviewDialogReady=browser.document.waitForAdded(node=>node.localName==='dialog');
    browser.desktop.emit({method:'item/completed',params:{turnId:request.turnId,item:{type:'imageGeneration',imageDataUrl:candidateData}}});
    browser.desktop.emit({method:'turn/completed',params:{turn:{id:request.turnId,status:'completed',error:null}}});
    const reviewDialog=await reviewDialogReady;

    assert.equal(browser.panel.dataset.aiBusy,'true');
    const resultCardReady=browser.document.waitForAdded(node=>node.matches('.ai-generated-card')&&node.dataset.aiCandidateId!=='generated-1');
    const settled=browser.document.waitForState(()=>browser.panel.dataset.aiBusy==='false');
    reviewDialog.querySelector('.ai-confirm-accept').click();
    const resultCard=await resultCardReady;
    await settled;

    const result=decodeTestPng(scopedPngBytes(resultCard.querySelector('img').src));
    assert.deepEqual(result.data,expectedPixels);
    assert.deepEqual(result.data.slice(0,4),sourcePixels.slice(0,4));
    assert.deepEqual(result.data.slice((2*width+1)*4,(2*width+2)*4),sourcePixels.slice((2*width+1)*4,(2*width+2)*4));
    assert.deepEqual(result.data.slice((2*width+3)*4,(2*width+4)*4),sourcePixels.slice((2*width+3)*4,(2*width+4)*4));
    assert.equal(browser.document.rasterDrawCount,0);
  }finally{
    manager?.close();
    browser.restore();
  }
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

test('candidate selection during scoped generation becomes current and blocks the stale result',async()=>{
  const f=fixture();
  const sourceData=scopedPngData(f.sourcePng);
  const item=(id,comments=[])=>({id,name:id,data:sourceData,kind:'generated',postprocessOk:true,
    reviewState:'scoped-applied',reviewReport:{verdict:'',checks:[],issues:[]},generationMode:'single',nextCommentNumber:2,comments});
  const comments=[{number:1,type:'area',imageId:'generated-1',x:25,y:0,w:25,h:100,text:'change selected pixel'}];
  const workspace={key:'workspace',activeTaskTabId:'task-1',taskTabSerial:1,imageSerial:2,tabs:[{
    id:'task-1',title:'task',workState:'idle',attachments:[],conversationMessages:[],uiMessages:[],input:'change selected pixel',
    conversationId:null,mode:'diagram',qualityMode:'simple',outputEngine:'raster',generationMode:'single',selectedCandidateId:'generated-1',
    generated:[item('generated-1',comments),item('generated-2')]
  }]};
  const browser=installAiPanelBrowserFixture({workspace});
  const stateValue={objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try{
    manager=initAiPanel({get:()=>stateValue});
    await manager.open();
    const candidateSelect=browser.panel.querySelector('[data-ai-candidate-select]');
    candidateSelect.value='generated-1';
    const boundsDialogReady=browser.document.waitForAdded(node=>node.localName==='dialog');
    browser.panel.querySelector('[data-ai-scoped-edit-selected]').click();
    const boundsDialog=await boundsDialogReady;
    const sendReady=browser.desktop.waitForSend();
    boundsDialog.querySelector('.ai-confirm-accept').click();
    const request=await sendReady;

    const settled=browser.document.waitForState(()=>browser.panel.dataset.aiBusy==='false');
    candidateSelect.value='generated-2';
    browser.panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select',{detail:{candidateId:'generated-2'}}));
    await settled;
    assert.equal(browser.panel.dataset.aiSelectedCandidateId,'generated-2');
    assert.equal(candidateSelect.value,'generated-2');
    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length,2);

    browser.desktop.emit({method:'item/completed',params:{turnId:request.turnId,item:{type:'imageGeneration',imageDataUrl:scopedPngData(f.candidate)}}});
    browser.desktop.emit({method:'turn/completed',params:{turn:{id:request.turnId,status:'completed',error:null}}});
    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length,2);
  }finally{
    manager?.close();
    browser.restore();
  }
});
