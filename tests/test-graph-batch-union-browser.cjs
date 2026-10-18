const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,emit}=require('./fixtures/ai-image-label-workflow.cjs');
const root=path.resolve(__dirname,'..');
const output=process.env.EVIDENCE_DIR || path.join(root,'.omo/evidence/candidate-first-20261010/graph-batch');

test('graph batch captures the input reference and commits a native revision without label workflow settings',{timeout:60000},async t=>{
  fs.mkdirSync(output,{recursive:true});
  process.env.TASK2_ENGINE='chromium';
  const {page,errors}=await fixture(t,1,output,{beforeNavigate:async page=>{
    const source=fs.readFileSync(path.join(root,'js/ai-panel.js'),'utf8');
    const hook='return {\n    deleteTask,';
    assert.ok(source.includes(hook));
    await page.route('**/js/ai-panel.js?*',route=>route.fulfill({contentType:'text/javascript',
      body:source.replace(hook,'return window.__graphBatchController = {\n    deleteTask,')}));
  }});
  // 2026-10-12(b2f85a00)부터 그래프 단추는 빈 그래프 작업대를 따로 연다. 원본이 붙은 작업을 그래프 작업으로 바꿔 넣는다.
  const captured=await page.evaluate(async()=>{
    const controller=__graphBatchController;
    const document=await controller.sharingSnapshot();
    const tab=document.tabs.find(tab=>tab.id===document.activeTaskTabId);
    tab.conversionKind='graph';
    // A style reference can precede the actual source; capture must not use it.
    tab.attachments.unshift({...tab.attachments[0],id:'style-only',kind:'style',referenceRole:'style'});
    await controller.importSharingSnapshot(document,null);
    const entry=controller.captureBatchTask(controller.activeTask());
    window.__graphBatchEntry=entry;
    return {entry,issue:controller.preflightBatch(entry)};
  });
  assert.equal(captured.entry.snapshot.options.conversionKind,'graph');
  assert.equal(captured.entry.snapshot.operation,'generate');
  assert.notEqual(captured.entry.snapshot.revisionId,'style-only');
  assert.equal(captured.issue,null);
  await page.evaluate(()=>{
    window.__graphBatchSent=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{window.removeEventListener('qa:bridge-send',sent);reject(new Error('Graph batch did not send'));},10000);
      function sent(){clearTimeout(timer);resolve();}
      window.addEventListener('qa:bridge-send',sent,{once:true});
    });
    const entry=__graphBatchEntry;
    window.__graphBatchContext={owner:{scope:entry.scope,taskId:entry.taskId},snapshot:entry.snapshot,jobId:'graph-union',attempt:1,signal:new AbortController().signal};
    window.__graphBatchResult=__graphBatchController.runBatch(__graphBatchContext,async()=>{});
    window.__graphBatchResult.catch(()=>{});
  });
  await page.evaluate(()=>__graphBatchSent);
  const request=await page.evaluate(()=>__task2.sends[0].payload);
  assert.equal(request.purpose,'scene');
  const match=request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/);
  assert.ok(match);
  const source=JSON.parse(match[1]);
  const plan={schema:'5e.graph-reconstruction/v1',source:{...source,plotBox:{x:40,y:20,w:source.width-80,h:source.height-60}},
    axes:{x:{scale:'linear',title:'시간',unit:'',min:0,max:4,step:1},y:{scale:'linear',title:'속도',unit:'',min:0,max:4,step:1}},
    series:[{id:'s1',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',points:[{x:0,y:0},{x:1,y:2},{x:4,y:3}],breaks:[],endpoints:[]}],annotations:[],review:[]};
  await emit(page,0,'assistant',JSON.stringify(plan));
  const committed=await page.evaluate(async()=>{
    const result=await __graphBatchResult;
    const before=await __graphBatchController.sharingSnapshot();
    const receipt=await __graphBatchController.commitBatch(__graphBatchContext,result);
    const after=await __graphBatchController.sharingSnapshot();
    const tab=after.tabs.find(tab=>tab.id===after.activeTaskTabId);
    return {before:before.tabs.find(tab=>tab.id===before.activeTaskTabId).generated.length,receipt,tab};
  });
  assert.equal(committed.before,0,'execution prepares without an early candidate commit');
  assert.equal(committed.receipt.committed,true);
  assert.equal(committed.tab.generated.length,1);
  const item=committed.tab.generated[0];
  assert.equal(item.engine,'native-graph');
  assert.equal(item.workspaceBatch.jobId,'graph-union');
  assert.equal(item.reviewState,'needs-attention');
  assert.ok(item.graphResult.objects.some(object=>object.type==='funcgraph'));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'native-batch.png')});
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({captured,committed,errors},null,2));
});
