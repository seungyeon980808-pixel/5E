// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; current-contract adaptations retain behavior oracles.
const { installLabelSourcePage } = require('./helpers/label-source-browser.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture: sourceFixture, snapshot, sends, finish } = require('./helpers/label-source-browser.cjs');
const root = process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/codex-continuation-20261010/label-current-contracts/ai-settings-panel');
const panel = '#ai-image-panel';
const pair = (page,key) => page.locator(`${panel} [data-ai-setting-key="${key}"]`);
async function fixture(context,count,evidence,options={}) {
  const beforeNavigate=options.beforeNavigate;
  return sourceFixture(context,count,evidence,{...options,beforeNavigate:async page=>{
    const supplied=new URL(process.env.RELEASE_URL||process.env.EXAM_URL),navigate=page.goto.bind(page);
    // The shared fixture chooses the canonical entry path from its origin.
    // Preserve the parent's query in this owned adapter without changing it.
    page.goto=(url,...args)=>{
      const entry=new URL(url);
      assert.equal(entry.origin,supplied.origin,'settings entry stays on the granted origin');
      assert.equal(entry.pathname,process.env.APP_ENTRY||'/preview/','settings entry uses the canonical requested path');
      entry.search=supplied.search;
      return navigate(entry.href,...args);
    };
    if(beforeNavigate)await beforeNavigate(page);
  }});
}
async function assertAdvancedHidden(page) {
  assert.equal(await page.locator(`${panel} .ai-advanced-settings > summary`).count(),1);
  assert.equal(await page.locator(`${panel} .ai-advanced-settings > summary:visible`).count(),0,'obsolete advanced summary stays hidden');
  assert.equal(await page.locator(`${panel} :is([data-ai-model], [data-ai-effort], [data-ai-speed]):not([data-ai-connection-dialog] *):visible`).count(),0,'legacy model/effort/speed controls outside the connection dialog stay hidden');
}
async function refreshModelCatalog(page) {
  await assertAdvancedHidden(page);
  // Reopening the actual workbench refreshes its connected provider catalog.
  // The retired connection dialog is not a user entry point.
  await page.evaluate(async () => {
    const desktop = window.fiveEDesktop, original = desktop.models;
    let received;
    const refreshed = new Promise(resolve => { received = resolve; });
    desktop.models = async (...args) => { const result = await original(...args); received(); return result; };
    try { await window.__task2Manager.open(); await refreshed; }
    finally { desktop.models = original; }
  });
  assert.equal(await page.locator(`${panel} [data-ai-connection-dialog]`).isVisible(), false);
}
async function assertModelChoices(page) {
  const model=page.locator(`${panel} [data-ai-model]`),value=await model.inputValue();
  const catalog=await model.locator('option').evaluateAll(options=>options.map(option=>({value:option.value,disabled:option.disabled})));
  assert.equal(await pair(page,'model').getByRole('button').count(),2,'exactly the two user-facing model choices');
  for(const [name,id] of [['Sol 6.1','gpt-6.1-sol'],['Luna 6','gpt-6-luna']]) {
    const button=pair(page,'model').getByRole('button',{name,exact:true});
    const available=catalog.some(option=>option.value===id&&!option.disabled);
    assert.equal(await button.isVisible(),true,`${name} compact choice is visible`);
    assert.equal(await button.isEnabled(),available,`${name} availability follows its exact provider ID`);
    assert.equal(await button.getAttribute('aria-pressed'),String(available&&value===id),`${name} pressed state follows the hidden backing value`);
  }
}
async function fresh(page) {
  await page.evaluate(async () => {
    window.fiveEDesktop.models = async () => ({data:[
      {model:'gpt-6.1-sol',displayName:'Sol 6.1',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']},
      {model:'gpt-6-luna',displayName:'Luna 6',defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']}
    ]});
    await window.__task2Manager.attachReference({src:window.__task2.original,name:'새 이미지'});
  });
  await refreshModelCatalog(page);
  const connection = page.locator(panel);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-model]').value==='gpt-6.1-sol');
  assert.deepEqual(await connection.locator('[data-ai-model] option').evaluateAll(options=>options.map(option=>option.value)),['gpt-6.1-sol','gpt-6-luna'],'exact refreshed provider model IDs');
  assert.equal(await connection.locator('[data-ai-effort]').inputValue(),'medium');
  assert.equal(await connection.locator('[data-ai-speed]').inputValue(),'priority');
  await assertAdvancedHidden(page);
  await assertModelChoices(page);
}
async function active(page) { const rows=await snapshot(page);return rows.find(row=>row.attachments?.[0]?.name==='새 이미지'); }
function observeSettingsDiskWrites() {
  const listeners=new Set(),completed=[],failed=[];
  window.__settingsDiskWrites={listeners,completed,failed};
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args) {
    const transaction=original.apply(this,args);
    if(transaction.mode==='readwrite'&&Array.from(transaction.objectStoreNames).includes('tasks')) {
      const owner={database:this.name,stores:Array.from(transaction.objectStoreNames)};
      transaction.addEventListener('complete',()=>{completed.push(owner);for(const notify of listeners)notify();});
      for(const event of ['error','abort']) transaction.addEventListener(event,()=>{
        failed.push({...owner,event,error:transaction.error?.message||event});for(const notify of listeners)notify();
      });
    }
    return transaction;
  };
}
const persistedPolicyKeys=['model','effort','serviceTier','conversionKind','markPolicy','imageLabelWorkflow','preserveSourceLabels','preciseRestore','outputOptions','separationMode','singleBackgroundPolicy'];
const policies=row=>Object.fromEntries(persistedPolicyKeys.map(key=>[key,row[key]]));
async function waitForOwnerDisk(page,expected,evidence) {
  try {
    const receipt=await page.evaluate(({expected,keys})=>new Promise((resolve,reject)=>{
      const scope=/^(.+):task-\d+$/.exec(expected.id)?.[1]||'';
      const panelId=scope?`ai-image-panel-${scope}`:'ai-image-panel';
      const panel=document.getElementById(panelId);
      const selected=panel?.querySelector('.ai-task-tab.is-on');
      const databaseName=`5e.preview:5e-ai-image-tasks${scope?`-${scope}`:''}`;
      const signals=window.__settingsDiskWrites;
      const project=row=>Object.fromEntries(keys.map(key=>[key,row?.[key]]));
      const expectedPolicies=project(expected);
      let database,running=false,dirty=false,settled=false,lastDisk=null;
      const timeout=setTimeout(()=>finish(new Error('Exact owner IndexedDB policies did not commit before the deadline')),10000);
      function finish(error,value) {
        if(settled)return;settled=true;clearTimeout(timeout);signals.listeners.delete(check);database?.close();
        window.__settingsDiskWaitReceipt={databaseName,scope,taskId:expected.id,expectedPolicies,lastDisk,completed:signals.completed.filter(row=>row.database===databaseName),failed:signals.failed.filter(row=>row.database===databaseName),error:error?.message||null};
        if(error)reject(error);else resolve({...window.__settingsDiskWaitReceipt,task:value});
      }
      async function check() {
        if(settled||!database)return;
        if(running){dirty=true;return;}running=true;
        try {
          do {
            dirty=false;
            lastDisk=await new Promise((resolveRead,rejectRead)=>{
              const transaction=database.transaction('tasks','readonly'),request=transaction.objectStore('tasks').get('workspace');
              let value;request.addEventListener('success',()=>{value=request.result;});
              request.addEventListener('error',()=>rejectRead(request.error));
              transaction.addEventListener('complete',()=>resolveRead(value));
              transaction.addEventListener('error',()=>rejectRead(transaction.error));
              transaction.addEventListener('abort',()=>rejectRead(transaction.error||new Error('Owner disk read aborted')));
            });
            const task=lastDisk?.tabs?.find(row=>row.id===expected.id);
            if(lastDisk?.activeTaskTabId===expected.id&&JSON.stringify(project(task))===JSON.stringify(expectedPolicies)
              &&signals.completed.some(row=>row.database===databaseName)) {finish(null,task);return;}
          } while(dirty&&!settled);
        } catch(error){finish(error);}finally{running=false;}
      }
      if(!panel||panel.hidden||selected?.dataset.tabId!==expected.id||selected.dataset.aiWorkspaceLink!==(scope||'legacy')){finish(new Error('Persistence probe owner differs from the visible active task and workspace scope'));return;}
      // Observe transaction completion before opening/reading; never flush the
      // controller or replace its 350 ms debounce with a test-side write.
      signals.listeners.add(check);
      const request=indexedDB.open(databaseName);
      request.addEventListener('upgradeneeded',()=>{request.transaction.abort();finish(new Error('Owner database must already exist'));});
      request.addEventListener('error',()=>finish(request.error||new Error('Owner database open failed')));
      request.addEventListener('blocked',()=>finish(new Error('Owner database open blocked')));
      request.addEventListener('success',()=>{database=request.result;if(settled){database.close();return;}void check();});
    }),{expected,keys:persistedPolicyKeys});
    assert.deepEqual(policies(receipt.task),policies(expected),'actual committed owner policies equal every current model/mark/background field');
    fs.writeFileSync(path.join(evidence,'disk-before-reload.json'),JSON.stringify({expected,receipt},null,2));
    return receipt;
  } catch(error) {
    fs.writeFileSync(path.join(evidence,'disk-completion-failure.json'),JSON.stringify({expected,receipt:await page.evaluate(()=>window.__settingsDiskWaitReceipt||null),error:error.stack},null,2));
    throw error;
  }
}
function dir(id){const d=path.join(root,id);fs.mkdirSync(d,{recursive:true});return d;}
test('binary AI controls: fresh defaults, equal buttons, actual persisted policies and help lifecycle', {timeout:90000},async t => {
  const evidence=dir('defaults');const {page,errors}=await fixture(t,1,evidence,{beforeNavigate:page=>page.addInitScript(observeSettingsDiskWrites)});await fresh(page);
  assert.equal(await page.locator(`${panel} [data-ai-effort]:visible, ${panel} [data-ai-speed]:visible`).count(),0);
  assert.equal(await page.locator(`${panel} [data-ai-speed]`).inputValue(),'priority');
  assert.equal(await page.locator(`${panel} [data-ai-fixed-speed], ${panel} [data-ai-help-title="속도"]`).count(),0,'fixed speed has no redundant visible UI');
  const expected={model:'Sol 6.1',labels:'끄기',background:'끄기',objects:'끄기',arrows:'끄기',guides:'끄기'};
  assert.equal(await page.locator(`${panel} [data-ai-label-verification]`).inputValue(),'draft-first');
  assert.equal(await pair(page,'verification').getByRole('button',{name:'초안 먼저',exact:true}).isDisabled(),true);
  for(const [key,name] of Object.entries(expected)) {
    assert.equal(await pair(page,key).getByRole('button').count(),2);
    assert.equal(await pair(page,key).getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');
  }
  const sizes=await page.locator(`${panel} .ai-setting-pair`).evaluateAll(groups => groups.filter(g=>g.getBoundingClientRect().height>0).flatMap(g=>[...g.querySelectorAll('button')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,x:g.getBoundingClientRect().left}))));
  assert.equal(new Set(sizes.map(s=>s.h)).size,1);assert.equal(new Set(sizes.map(s=>s.w)).size,1);assert.equal(new Set(sizes.map(s=>s.x)).size,1);
  assert.equal(await page.locator(`${panel} [data-ai-compact-settings] select:visible`).count(),0);
  await page.getByRole('button',{name:'보조선 제거 도움말',exact:true}).click();
  assert.equal(await page.locator('.ai-setting-help-pop').isVisible(),true);assert.match(await page.locator('.ai-setting-help-pop').innerText(),/실제 관·도선·윤곽선/);
  await page.screenshot({path:path.join(evidence,'help.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.ai-setting-help-pop').count(),0);assert.equal(await page.locator(panel).isVisible(),true);
  await pair(page,'labels').getByRole('button',{name:'켜기',exact:true}).click();
  await pair(page,'arrows').getByRole('button',{name:'켜기',exact:true}).click();
  await pair(page,'guides').getByRole('button',{name:'끄기',exact:true}).click();
  await pair(page,'model').getByRole('button',{name:'Luna 6',exact:true}).click();
  assert.equal(await page.locator(`${panel} [data-ai-model]`).inputValue(),'gpt-6-luna');await assertModelChoices(page);
  const row=await active(page);assert.equal(row.imageLabelWorkflow.labelResult,'restore-editable');assert.equal(row.imageLabelWorkflow.scientificArrows,'remove');assert.equal(row.imageLabelWorkflow.auxiliaryMarks,'keep');assert.equal(row.model,'gpt-6-luna');
  await pair(page,'background').getByRole('button',{name:'켜기',exact:true}).click();
  await pair(page,'objects').getByRole('button',{name:'켜기',exact:true}).click();
  assert.equal((await active(page)).separationMode,'auto');assert.equal(await pair(page,'background').getByRole('button',{name:'켜기',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await pair(page,'background').getByRole('button',{name:'끄기',exact:true}).isDisabled(),true);
  await pair(page,'objects').getByRole('button',{name:'끄기',exact:true}).click();assert.equal(await pair(page,'background').getByRole('button',{name:'끄기',exact:true}).isEnabled(),true);
  assert.equal((await active(page)).serviceTier,'priority');
  const persisted=await active(page);
  const disk=await waitForOwnerDisk(page,persisted,evidence);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#ai-image-install-open').click();
  assert.equal(await page.locator(`${panel} [data-ai-speed]`).inputValue(),'priority');
  const reopened=await active(page);assert.deepEqual(reopened.imageLabelWorkflow,persisted.imageLabelWorkflow);assert.deepEqual(reopened.outputOptions,persisted.outputOptions);assert.equal(reopened.model,persisted.model);assert.equal(reopened.separationMode,persisted.separationMode);assert.equal(reopened.serviceTier,persisted.serviceTier);await assertAdvancedHidden(page);
  assert.deepEqual(policies(reopened),policies(disk.task),'all committed owner policies survive reopening');
  assert.equal((await sends(page)).length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,row,persisted,disk,reopened,sizes,errors},null,2));
});
test('actual modern controller: policy payloads and exact RAW review/export/native insertion', {timeout:90000},async t => {
  const evidence=dir('request-and-background');const {page,errors}=await fixture(t,1,evidence);await fresh(page);
  await pair(page,'arrows').getByRole('button',{name:'켜기',exact:true}).click();
  await pair(page,'guides').getByRole('button',{name:'끄기',exact:true}).click();
  await pair(page,'background').getByRole('button',{name:'켜기',exact:true}).click();
  assert.equal((await active(page)).outputOptions.backgroundPolicy,'connected','live pre-generation background control reaches the actual task');
  await page.locator(`${panel} [data-ai-comments-apply]`).click();
  await page.waitForFunction(()=>window.__task2.sends.length>0);
  assert.equal(await pair(page,'labels').getByRole('button',{name:'켜기',exact:true}).isDisabled(),true);
  await finish(page);
  const row=await active(page),c=row.generated.at(-1),requests=await sends(page);
  assert.ok(c);assert.equal(c.imageLabelWorkflow.labelResult,'remove');assert.equal(c.imageLabelWorkflow.scientificArrows,'remove');assert.equal(c.imageLabelWorkflow.auxiliaryMarks,'keep');
  assert.equal(requests.filter(r=>r.purpose==='image').length,1);assert.match(requests.find(r=>r.purpose==='image').text,/scientificArrows|科学|과학적/);
  const payloads=await page.evaluate(()=>window.__task2.sends.map(send=>send.payload));
  assert.equal(payloads.find(payload=>payload.purpose==='image').model,'gpt-6.1-sol');
  assert.ok(payloads.every(payload=>payload.effort==='medium'&&payload.serviceTier==='priority'),'hidden fixed controls reach every request');
  const beforeCalls=requests.length;
  assert.equal(await page.locator(panel).getAttribute('data-ai-box-edit'),'true');
  assert.equal(await page.locator(`${panel} [data-ai-compact-settings]`).isVisible(),false,'selected RAW review hides conversion policy controls');
  assert.equal(await pair(page,'background').getByRole('button',{name:'켜기',exact:true,includeHidden:true}).isVisible(),false);
  assert.equal(await page.locator(`${panel} [data-ai-background-policy]`).inputValue(),'connected','hidden policy remains the selected pre-generation value');
  await page.waitForFunction(raw=>{const image=document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage img');return image?.complete&&image.naturalWidth&&image.src===raw;},c.data);
  const reviewRaw=await page.locator(`${panel} .ai-generated-card .ai-preview-stage img`).getAttribute('src');
  assert.equal(reviewRaw,c.data,'review preview remains the exact verified RAW bytes');
  // Transport-only filesystem boundary: click the current PNG save UI,
  // let its real RAW guard export the captured bound candidate unchanged.
  const downloadReady=page.waitForEvent('download');
  await page.locator(`${panel} [data-ai-save-selected]`).click();
  const download=await downloadReady;
  assert.match(download.suggestedFilename(), /\.png$/);
  const exported={extension:'.png', dataUrl:'data:image/png;base64,'+fs.readFileSync(await download.path()).toString('base64')};
  assert.equal(exported.extension,'.png');assert.equal(exported.dataUrl,c.data,'Modern export preserves the exact bound RAW bytes');
  const pixels=await page.evaluate(async src=>{
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Actual exported PNG did not decode'));img.src=src;});
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return{width:canvas.width,height:canvas.height,outside:[...ctx.getImageData(0,0,1,1).data],inside:[...ctx.getImageData(250,150,1,1).data]};
  },exported.dataUrl);
  const rawProof=await page.evaluate(async({raw,exported,id,taskId})=>{
    const {imageLabelDigest}=await import('/js/ai-image-label-run.js?v=1.7.0-four-session-integration');
    const {requiresRawImageOutput,isHistoricalPngLocalResult}=await import('/js/ai-output-processing.js?v=1.7.0-four-session-integration');
    const owner=(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).find(tab=>tab.id===taskId&&tab.generated.some(item=>item.id===id));
    const candidate=owner?.generated.find(item=>item.id===id);
    if(!candidate)throw new Error('Actual durable modern candidate is required');
    const fullPixels=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;return{width:canvas.width,height:canvas.height,rgbaSha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(v=>v.toString(16).padStart(2,'0')).join('')};};
    return{taskId:owner.id,id:candidate.id,selectedId:document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId,requiresRaw:requiresRawImageOutput(candidate),historical:isHistoricalPngLocalResult(candidate),rawDigest:await imageLabelDigest(raw),exportDigest:await imageLabelDigest(exported),storedDigest:candidate.candidateSha256,rawPixels:await fullPixels(raw),exportPixels:await fullPixels(exported),sourceFrame:candidate.sourceFrame,candidateFrame:candidate.candidateFrame,reviewState:candidate.reviewState};
  },{raw:c.data,exported:exported.dataUrl,id:c.id,taskId:row.id});
  assert.equal(rawProof.taskId,row.id);assert.equal(rawProof.id,c.id);assert.equal(rawProof.selectedId,c.id);
  assert.equal(rawProof.requiresRaw,true);assert.equal(rawProof.historical,false);
  assert.equal(rawProof.rawDigest,rawProof.storedDigest);assert.equal(rawProof.exportDigest,rawProof.storedDigest);
  assert.deepEqual(rawProof.exportPixels,rawProof.rawPixels,'Every decoded RAW channel is preserved by modern export');
  assert.equal(rawProof.sourceFrame.width,512);assert.equal(rawProof.sourceFrame.height,384);
  assert.equal(rawProof.candidateFrame.width,rawProof.rawPixels.width);assert.equal(rawProof.candidateFrame.height,rawProof.rawPixels.height);
  assert.equal(rawProof.reviewState,'passed');assert.equal((await sends(page)).length,beforeCalls);
  assert.deepEqual((await active(page)).generated.find(item=>item.id===c.id),c,'export must not mutate any RAW candidate field or verification binding');
  assert.equal(await page.locator(`${panel} .ai-generated-card .ai-preview-stage img`).getAttribute('src'),reviewRaw);
  fs.writeFileSync(path.join(evidence,'raw-export.png'),Buffer.from(exported.dataUrl.split(',')[1],'base64'));
  await page.screenshot({path:path.join(evidence,'raw-review-export.png')});
  await page.locator(`${panel} [data-ai-insert-selected]`).click();await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  const inserted=await page.evaluate(async candidateId=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().objects.filter(object=>object.aiCandidateId===candidateId);},c.id);
  const images=inserted.filter(object=>object.type==='image');assert.equal(images.length,1);assert.equal(images[0].src,c.data,'native insertion preserves selected RAW bytes');assert.equal(images[0].aiTaskId,row.id);
  assert.equal((await sends(page)).length,beforeCalls,'export and native insertion add no provider calls');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,c,requests,payloads,reviewRaw,exported,pixels,rawProof,inserted,errors},null,2));
});

test('historical PNG controller: background export pixels and complete original preservation', {timeout:90000},async t => {
  const evidence=dir('historical-background-export');
  // This pre-existing fixture seeds an ordinary historical PNG before product
  // boot. No modern result is reclassified, stripped, or converted at runtime.
  const {page,errors}=await fixture(t,1,evidence,{selectedPartial:true});
  const row=(await snapshot(page)).find(row=>row.id==='task-0'),c=row.generated[0];
  assert.equal(c.id,'selected-0');assert.equal(c.kind,'generated');assert.equal(c.data,await page.evaluate(()=>window.__task2.original));
  const provenance=await page.evaluate(async id=>{
    const {isHistoricalPngLocalResult,requiresRawImageOutput}=await import('/js/ai-output-processing.js?v=1.7.0-four-session-integration');
    const candidate=(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).flatMap(t=>t.generated).find(item=>item.id===id);
    return{historical:isHistoricalPngLocalResult(candidate),requiresRaw:requiresRawImageOutput(candidate),workflow:candidate.imageLabelWorkflow||null};
  },c.id);
  assert.equal(provenance.historical,true);assert.equal(provenance.requiresRaw,false);assert.equal(provenance.workflow,null);
  const connected=page.locator(`${panel} [data-ai-legacy-result-settings] [data-ai-setting-key="background"] [data-ai-setting-value="connected"]:visible`);
  assert.equal(await connected.count(),1);assert.equal(await connected.isEnabled(),true);await connected.click();
  await page.waitForFunction(raw=>{const image=document.querySelector('#ai-image-panel .ai-generated-card .ai-preview-stage img');return image?.complete&&image.naturalWidth&&image.src!==raw;},c.data);
  assert.equal((await snapshot(page)).find(task=>task.id===row.id)?.outputOptions.backgroundPolicy,'connected');
  const reviewRaw=await page.locator(`${panel} .ai-generated-card .ai-preview-stage img`).getAttribute('src');
  const beforeCalls=(await sends(page)).length;assert.equal(beforeCalls,0);
  const downloadReady=page.waitForEvent('download');
  await page.locator(`${panel} [data-ai-save-selected]`).click();
  const download=await downloadReady;
  assert.match(download.suggestedFilename(), /\.png$/);
  const exported={extension:'.png', dataUrl:'data:image/png;base64,'+fs.readFileSync(await download.path()).toString('base64')};
  assert.equal(exported.extension,'.png');assert.notEqual(exported.dataUrl,c.data,'background export is a separate processed variant');
  const pixels=await page.evaluate(async src=>{
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Actual exported PNG did not decode'));img.src=src;});
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return{width:canvas.width,height:canvas.height,outside:[...ctx.getImageData(0,0,1,1).data],inside:[...ctx.getImageData(250,150,1,1).data]};
  },exported.dataUrl);
  assert.equal(pixels.outside[3],0);assert.equal(pixels.inside[3],255);assert.equal((await sends(page)).length,beforeCalls);
  assert.deepEqual((await snapshot(page)).find(task=>task.id===row.id).generated.find(item=>item.id===c.id),c,'export must not mutate any RAW candidate field or verification binding');
  assert.equal(await page.locator(`${panel} .ai-generated-card .ai-preview-stage img`).getAttribute('src'),reviewRaw);
  fs.writeFileSync(path.join(evidence,'processed-export.png'),Buffer.from(exported.dataUrl.split(',')[1],'base64'));
  await page.screenshot({path:path.join(evidence,'processed.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,provenance,seed:'seedWorkspaces(selectedPartial:true) before product boot',c,exported,pixels,reviewRaw,providerCalls:beforeCalls,errors},null,2));
});

test('label restoration button uses Sol image generation and Luna joint verification, then inserts editable native labels', {timeout:90000},async t => {
  const evidence=dir('editable-labels');const {page,errors}=await fixture(t,1,evidence);await fresh(page);
  await pair(page,'labels').getByRole('button',{name:'켜기',exact:true}).click();
  await pair(page,'verification').getByRole('button',{name:'자동 검수',exact:true}).click();
  await page.locator(`${panel} [data-ai-comments-apply]`).click();await finish(page);
  const row=await active(page),c=row.generated.at(-1);
  assert.ok(c);assert.equal(c.imageLabelWorkflow.labelResult,'restore-editable');assert.equal(c.reviewState,'passed');assert.equal(c.labelPlan.labels[0].text,'전자');
  const models=await page.evaluate(()=>window.__task2.sends.map(s=>({purpose:s.payload.purpose,model:s.payload.model,effort:s.payload.effort,serviceTier:s.payload.serviceTier})));
  assert.ok(models.every(m=>m.serviceTier==='priority'));
  assert.equal(models.filter(m=>m.purpose==='image').length,1);assert.equal(models.find(m=>m.purpose==='image').model,'gpt-6.1-sol');assert.equal(models.filter(m=>m.purpose!=='image').length,2);assert.ok(models.filter(m=>m.purpose!=='image').every(m=>m.model==='gpt-6-luna'&&m.effort==='medium'));
  await page.locator(`${panel} [data-ai-insert-selected]`).click();await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  const labels=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().objects.filter(o=>o.aiAutoLabel).map(o=>({type:o.type,text:o.text,leaderRoutes:o.leaderRoutes}));});
  assert.equal(labels.length,1);assert.equal(labels[0].text,'전자');assert.ok(labels[0].leaderRoutes?.length);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,models,labels,errors},null,2));
});

test('task rail selects every workspace idempotently and confirms full deletion without AI calls', {timeout:90000},async t => {
  const evidence=dir('task-rail');const {page,errors}=await fixture(t,3,evidence);
  await page.evaluate(async()=>window.__task2Manager.openIndependentReferences({references:[{dataUrl:window.__task2.original,name:'별도 작업대 원본'}],startGeneration:false}));
  assert.equal(await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.length),2);
  const before=await snapshot(page),ids=before.map(row=>row.id),active=await page.locator(`${panel} .ai-task-tab.is-on`).getAttribute('data-tab-id');
  const selectAll=page.getByRole('button',{name:'전체 선택',exact:true});
  await selectAll.click();assert.equal(await page.locator(`${panel} [data-ai-selection-count]`).innerText(),'4개 선택');
  assert.equal(await page.locator(`${panel} [data-ai-batch-selected=true]`).count(),4);assert.equal(await selectAll.getAttribute('aria-pressed'),'true');
  await selectAll.click();assert.equal(await page.locator(`${panel} [data-ai-selection-count]`).innerText(),'4개 선택');assert.equal(await page.locator(`${panel} .ai-task-tab.is-on`).getAttribute('data-tab-id'),active);
  await page.screenshot({path:path.join(evidence,'selected-all.png')});
  const clear=page.getByRole('button',{name:'선택 삭제',exact:true});await clear.click();
  const confirm=page.getByRole('dialog',{name:'선택 작업 삭제',exact:true});assert.match(await confirm.innerText(),/4개 작업/);
  await confirm.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual((await snapshot(page)).map(row=>row.id),ids);
  await clear.click();await confirm.getByRole('button',{name:'4개 삭제',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel .ai-task-tab[data-tab-id="task-0"]'));
  const after=await snapshot(page);assert.ok(after.every(row=>!ids.includes(row.id)));assert.equal((await sends(page)).length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,beforeIds:ids,afterIds:after.map(row=>row.id),errors},null,2));
});

test('Sol 6.1 is disabled only when its exact provider ID is absent, with Luna still selectable', {timeout:90000},async t => {
  const evidence=dir('model-catalog');const {page,errors}=await fixture(t,1,evidence);await fresh(page);
  await page.evaluate(()=>{window.fiveEDesktop.models=async()=>({data:[{model:'gpt-6-sol',displayName:'Sol 6',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']},{model:'gpt-6-luna',displayName:'Luna 6',defaultReasoningEffort:'medium',supportedReasoningEfforts:['medium'],serviceTiers:['priority']}]});});
  await refreshModelCatalog(page);
  const sol=pair(page,'model').getByRole('button',{name:'Sol 6.1',exact:true}),luna=pair(page,'model').getByRole('button',{name:'Luna 6',exact:true});
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-model-choice=sol]').disabled);
  assert.equal(await sol.isEnabled(),false);assert.equal(await luna.isEnabled(),true);await assertAdvancedHidden(page);await assertModelChoices(page);await luna.click();assert.equal(await luna.getAttribute('aria-pressed'),'true');await assertModelChoices(page);
  assert.equal(await page.locator(`${panel} [data-ai-model]`).inputValue(),'gpt-6-luna');assert.equal((await sends(page)).length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({paidAiCalls:0,sol61Enabled:false,lunaEnabled:true,errors},null,2));
});
