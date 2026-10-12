const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('./fixtures/ai-image-label-workflow.cjs');
const root=path.resolve(__dirname,'..');
const evidence=process.env.EVIDENCE_DIR || path.join(root,'.omo/evidence/candidate-first-20261010/graph-owner');

for(const scenario of ['sharing-same-id','sharing-same-id-rejected','sharing-checkpoint-held','task-same-id','native-changed','transferred','background-owner','disposed']){
  test(`late graph rendering respects ${scenario}`,{timeout:60000},async t=>{
    const output=path.join(evidence,scenario);fs.mkdirSync(output,{recursive:true});
    process.env.TASK2_ENGINE='chromium';
    const {page,errors}=await fixture(t,1,output,{beforeNavigate:async page=>{
      const panel=fs.readFileSync(path.join(root,'js/ai-panel.js'),'utf8');
      const hook='return {\n    deleteTask,';
      const finish="setStatus('새 수정본의 편집 내용은 유지했습니다. 미리보기 갱신 실패: ' + error.message,'error');\n      });";
      assert.equal(panel.split(hook).length-1,1);assert.ok(panel.includes(finish));
      await page.route('**/js/ai-panel.js?*',route=>route.fulfill({contentType:'text/javascript',body:panel
        .replace(hook,'return window.__ownerController = {\n    deleteTask,')
        .replace('store: taskStore,',"store: {put:async value=>{if(window.__checkpointGate){const gate=window.__checkpointGate;window.__checkpointGate=null;gate.entered.resolve();await gate.release.promise;}return taskStore.put(value);}},")
        .replace(finish,finish.slice(0,-2)+").finally(()=>window.dispatchEvent(new Event('qa:graph-render-settled')));")}));
      const renderer=fs.readFileSync(path.join(root,'js/graph/workbench-result.js'),'utf8');
      const renderHook='export async function workbenchGraphDataUrl(result) {';
      assert.ok(renderer.includes(renderHook));
      await page.route('**/js/graph/workbench-result.js?*',route=>route.fulfill({contentType:'text/javascript',
        body:renderer.replace(renderHook,renderHook+"\n  if(window.__graphRenderGate){const gate=window.__graphRenderGate;gate.native=result;gate.entered.resolve();await gate.release.promise;}")}));
    }});
    await page.evaluate(async()=>{
      const {buildWorkbenchGraph}=await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration');
      const {graphSourceHash}=await import('/js/graph/reconstruction-workflow.js?v=1.7.0-four-session-integration');
      const document=await __ownerController.sharingSnapshot(),tab=document.tabs[0],reference=tab.attachments[0];
      const source={id:reference.id,hash:await graphSourceHash(reference.data),width:512,height:384};
      const plan={schema:'5e.graph-reconstruction/v1',source:{...source,plotBox:{x:40,y:20,w:432,h:324}},
        axes:{x:{scale:'linear',title:'시간',unit:'',min:0,max:4,step:1},y:{scale:'linear',title:'속도',unit:'',min:0,max:4,step:1}},
        series:[{id:'s1',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',points:[{x:0,y:0},{x:1,y:2},{x:4,y:3}],breaks:[],endpoints:[]}],annotations:[],review:[]};
      const graphResult=buildWorkbenchGraph(plan,source);
      graphResult.traceReference={data:reference.data,name:reference.name,width:512,height:384,plotBox:plan.source.plotBox};
      tab.conversionKind='graph';
      tab.generated=[{id:'parent',name:'Parent graph',kind:'generated',engine:'native-graph',data:reference.data,graphResult,comments:[],nextCommentNumber:1,reviewState:'needs-attention'}];
      tab.selectedCandidateId='parent';
      document.tabs.push({...structuredClone(tab),id:'background',title:'Other task',generated:[],selectedCandidateId:null});
      await __ownerController.importSharingSnapshot(document,null);
      window.__graphParent=structuredClone(tab.generated[0]);
      window.__graphOwner=tab.id;
      window.__readGraphSaved=()=>new Promise((resolve,reject)=>{
        const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,transaction=db.transaction('tasks','readonly'),get=transaction.objectStore('tasks').get('workspace');
          transaction.oncomplete=()=>{db.close();resolve(get.result);};
          transaction.onerror=()=>{db.close();reject(transaction.error);};
        };
      });
      window.__graphRenderGate={entered:Promise.withResolvers(),release:Promise.withResolvers()};
      window.__graphRenderSettled=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{window.removeEventListener('qa:graph-render-settled',done);reject(new Error('Graph render did not settle'));},15000);
        function done(){clearTimeout(timer);resolve();}
        window.addEventListener('qa:graph-render-settled',done,{once:true});
      });
    });
    await page.locator('[data-ai-graph-edit]').click();
    await page.locator('#gm-labelx').fill('수정한 시간');
    await page.locator('#gm-labelx').dispatchEvent('input');
    await page.locator('#gm-confirm').click();
    await page.evaluate(()=>__graphRenderGate.entered.promise);
    const before=await page.evaluate(async scenario=>{
      const controller=__ownerController;
      if(scenario.startsWith('sharing-')||scenario==='task-same-id'){
        const replacement=await controller.sharingSnapshot();
        const candidate=replacement.tabs.find(tab=>tab.id===__graphOwner).generated.at(-1);
        candidate.name='Replacement owner';
        candidate.graphResult.objects.find(object=>object.type==='coordplane').labelX='가져온 원본';
        if(scenario==='sharing-checkpoint-held'){
          const gate={entered:Promise.withResolvers(),release:Promise.withResolvers()};
          window.__checkpointGate=gate;
          const checkpoint=controller.checkpointForClose();
          await gate.entered.promise;
          const imported=controller.importSharingSnapshot(replacement,null);
          gate.release.resolve();
          await checkpoint;
          await imported;
        }
        else if(scenario.startsWith('sharing-'))await controller.importSharingSnapshot(replacement,null);
        else await controller.importTaskSnapshot(replacement,null);
      }
      if(scenario==='native-changed')__graphRenderGate.native.objects.find(object=>object.type==='coordplane').labelX='다시 변경한 축';
      if(scenario==='transferred'||scenario==='background-owner'){
        await controller.open({taskId:'background'});
        if(scenario==='transferred')await controller.removeTransferredTask(__graphOwner);
      }
      await controller.checkpointForClose();
      if(scenario==='disposed')controller.dispose();
      return {snapshot:await controller.sharingSnapshot(),saved:await __readGraphSaved(),status:document.querySelector('#ai-image-panel [data-ai-status]').textContent};
    },scenario);
    await page.evaluate(async scenario=>{
      if(scenario==='sharing-same-id-rejected')__graphRenderGate.release.reject(new Error('Controlled renderer failure'));
      else __graphRenderGate.release.resolve();
      await __graphRenderSettled;
    },scenario);
    const after=await page.evaluate(async()=>({
      snapshot:await __ownerController.sharingSnapshot(),
      saved:await __readGraphSaved(),
      status:document.querySelector('#ai-image-panel [data-ai-status]').textContent,
      hidden:document.querySelector('#ai-image-panel').hidden
    }));
    if(scenario==='background-owner'){
      assert.equal(after.snapshot.activeTaskTabId,'background');
      const owner=after.snapshot.tabs.find(tab=>tab.id!== 'background');
      const prior=before.snapshot.tabs.find(tab=>tab.id===owner.id);
      assert.deepEqual(owner.generated[0],prior.generated[0]);
      assert.notEqual(owner.generated[1].data,prior.generated[1].data);
      assert.equal(owner.generated[1].graphEdit.parentCandidateId,'parent');
      assert.equal(after.snapshot.tabs.find(tab=>tab.id==='background').selectedCandidateId,null);
      assert.equal(after.saved.tabs.find(tab=>tab.id===owner.id).generated[1].data,owner.generated[1].data);
    }else{
      assert.deepEqual(after.snapshot,before.snapshot,'stale renderer cannot change native data, selection or persisted snapshot');
      assert.deepEqual(after.saved,before.saved,'stale render and queued checkpoint cannot overwrite replacement IndexedDB data');
      assert.equal(after.status,before.status,'stale renderer cannot overwrite replacement status');
    }
    if(scenario==='disposed')assert.equal(after.hidden,true);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>__task2.sends.length),0);
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({scenario,before,after,errors},null,2));
  });
}
