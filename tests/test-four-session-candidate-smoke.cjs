const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,choose,finish,verifiedPlan,snapshot,emit}=require('./fixtures/ai-image-label-workflow.cjs');
const output=process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/candidate-first-20261010/smoke');

// Subscribe to the actual bridge or workbench mutation, never a timed retry.
async function phase(page,next) {
  return page.evaluate(next=>new Promise((resolve,reject)=>{
    const panel=document.querySelector('#ai-image-panel');
    const timer=setTimeout(()=>{cleanup();reject(new Error('Candidate phase did not finish'));},30000);
    const observer=new MutationObserver(check);
    function cleanup(){clearTimeout(timer);observer.disconnect();window.removeEventListener('qa:bridge-send',check);}
    function check(){
      if(window.__task2.sends.length>next){cleanup();resolve('request');}
      else if(panel.dataset.aiBusy==='false'){cleanup();resolve('done');}
    }
    window.addEventListener('qa:bridge-send',check);
    observer.observe(panel,{attributes:true,attributeFilter:['data-ai-busy']});
    check();
  }),next);
}

test('one root runs automatic labels, native graph editing and the pinned RHWP document editor',{timeout:150000},async t=>{
  fs.mkdirSync(output,{recursive:true});
  process.env.TASK2_ENGINE ||= 'chromium';
  const {page,errors}=await fixture(t,1,output);
  await choose(page,'general','restore-editable');
  await page.locator('[data-ai-setting-key="verification"] [data-ai-setting-value="full"]').click();
  await page.locator('#ai-image-panel [data-ai-input]').fill('원본 구조를 유지하고 라벨을 복원해 주세요');
  // 이미지 작업의 실행 버튼은 아래 '변환하기' 하나다(2026-10-16, 83201a54). 그래프 작업만 준비 칸 버튼을 쓴다.
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
  await finish(page,{sourcePlan:verifiedPlan});
  const labeled=(await snapshot(page)).flatMap(tab=>tab.generated).at(-1);
  assert.equal(labeled.labelPlan.labels.length,1);
  assert.equal(labeled.data,await page.evaluate(()=>__task2.modified));
  assert.equal(await page.evaluate(()=>__task2.sends.filter(s=>s.payload.purpose==='image').length),1);
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.locator('#ai-image-panel').waitFor({state:'hidden'});
  const nativeLabels=await page.evaluate(()=>{
    const objects=__candidateQA.state.get().objects;
    return {image:objects.find(o=>o.type==='image'),labels:objects.filter(o=>o.aiAutoLabel),selectedIds:__candidateQA.state.get().selectedIds};
  });
  assert.equal(nativeLabels.labels.length,1);
  // The accepted output contract selects one movable image/label bundle.
  // A locked bitmap would prevent the complete bundle from moving together.
  assert.equal(nativeLabels.image.imageSelectionLocked,false);
  assert.ok(nativeLabels.image.groupId);
  assert.equal(nativeLabels.labels[0].groupId,nativeLabels.image.groupId);
  assert.equal(nativeLabels.labels[0].aiCandidateId,nativeLabels.image.aiCandidateId);
  assert.deepEqual(nativeLabels.selectedIds,[nativeLabels.image.id,...nativeLabels.labels.map(label=>label.id)]);
  assert.equal(nativeLabels.image.src,labeled.data,'the bundle retains the exact generated bitmap');
  await page.screenshot({path:path.join(output,'native-labels.png')});

  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
  // Modes keep separate tasks. Supply the synthetic source through the actual
  // graph-mode file input instead of borrowing the previous image task.
  const graphSource=await page.evaluate(()=>__task2.original);
  await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({
    name:'synthetic-graph.png',mimeType:'image/png',buffer:Buffer.from(graphSource.split(',')[1],'base64'),
  });
  await page.locator('#ai-image-panel [data-ai-input]').fill('축과 곡선을 편집 가능한 그래프로 복원해 주세요');
  let next=await page.evaluate(()=>__task2.sends.length);
  await page.locator('#ai-image-panel [data-ai-send]').click();
  for(let step=0;step<8;step++){
    if(await phase(page,next)==='done')break;
    const request=await page.evaluate(index=>__task2.sends[index].payload,next);
    assert.equal(request.purpose,'scene');
    const match=request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/);
    assert.ok(match,'graph request carries the actual source binding');
    const source=JSON.parse(match[1]);
    const plan={schema:'5e.graph-reconstruction/v1',source:{...source,plotBox:{x:40,y:20,w:source.width-80,h:source.height-60}},
      axes:{x:{scale:'linear',title:'시간',unit:'',min:0,max:4,step:1},y:{scale:'linear',title:'속도',unit:'',min:0,max:4,step:1}},
      series:[{id:'s1',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',points:[{x:0,y:0},{x:1,y:2},{x:4,y:3}],breaks:[],endpoints:[]}],
      annotations:[],review:[]};
    await emit(page,next++,'assistant',JSON.stringify(plan));
  }
  let graphs=(await snapshot(page)).flatMap(tab=>tab.generated).filter(item=>item.graphResult);
  assert.equal(graphs.length,1,'graph reconstruction creates a native candidate');
  await page.locator('#ai-image-panel [data-ai-graph-edit]').click();
  await page.locator('#gm-labelx').fill('편집한 시간');
  await page.locator('#gm-labelx').dispatchEvent('input');
  await page.evaluate(()=>{
    window.__graphEditFinished=new Promise((resolve,reject)=>{
      const status=document.querySelector('#ai-image-panel [data-ai-status]');
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error(status.textContent));},30000);
      const observer=new MutationObserver(()=>{
        if(status.textContent.includes('편집을 적용')){
          clearTimeout(timer);observer.disconnect();resolve();
        }
      });
      observer.observe(status,{childList:true,subtree:true,characterData:true});
    });
  });
  await page.locator('#gm-confirm').click();
  await page.evaluate(()=>window.__graphEditFinished);
  graphs=(await snapshot(page)).flatMap(tab=>tab.generated).filter(item=>item.graphResult);
  assert.equal(graphs.length,2,'editing appends an independent revision');
  assert.equal(graphs[1].graphEdit.parentCandidateId,graphs[0].id);
  assert.equal(graphs[0].graphResult.objects.find(o=>o.type==='coordplane').labelX,'시간');
  assert.equal(graphs[1].graphResult.objects.find(o=>o.type==='coordplane').labelX,'편집한 시간');
  await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
  await page.locator('#ai-image-panel').waitFor({state:'hidden'});
  const types=await page.evaluate(()=>__candidateQA.state.get().objects.map(o=>o.type));
  assert.ok(types.includes('image')&&types.includes('labeler')&&types.includes('coordplane')&&types.includes('funcgraph'));
  await page.screenshot({path:path.join(output,'labels-and-native-graph.png')});

  await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();
  await page.locator('#rhwp-exam-workspace[aria-busy="false"]').waitFor({timeout:60000});
  const native=await page.evaluate(()=>{
    const deps=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;
    const input=deps.getInputHandler(),before=input.history.undoStack.length;
    input.executeOperation({kind:'snapshot',operationType:'candidate-first-smoke',operation:()=>{
      deps.wasm.insertText(0,0,0,'통합 후보 문서 편집');
      return {sectionIndex:0,paragraphIndex:0,charOffset:11};
    }});
    deps.eventBus.emit('document-changed');
    return {before,after:input.history.undoStack.length,pages:deps.wasm.pageCount,generation:deps.wasm.documentGeneration};
  });
  assert.equal(native.after,native.before+1);
  assert.ok(native.pages>0);
  await page.screenshot({path:path.join(output,'rhwp-document-edit.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'connected-features.json'),JSON.stringify({
    origin:new URL(page.url()).origin,transport:'controlled fixture; no paid calls',
    labelPipeline:true,nativeLabels:nativeLabels.labels.length,graphCandidates:graphs.length,
    graphParentPreserved:true,nativeTypes:types,rhwp:native,errors
  },null,2));
});
