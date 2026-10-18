// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,snapshot,emit}=require('./helpers/label-source-browser.cjs');
const evidence=process.env.EVIDENCE_DIR||path.resolve(__dirname,'../.omo/evidence/box-edit-verification-browser');

async function capture(page,name) {
  await page.evaluate(async()=>{
    await Promise.all([...document.images].filter(image=>image.src).map(image=>image.decode()));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  const geometry=await page.locator('[data-ai-precision-settings] input, dialog[open], dialog[open] .ai-confirm-actions, dialog[open] button').evaluateAll(elements=>
    elements.map(element=>({tag:element.tagName,name:element.getAttribute('aria-label')||element.textContent,
      value:element.value,rect:element.getBoundingClientRect().toJSON(),scrollTop:element.scrollTop,scrollLeft:element.scrollLeft})));
  fs.writeFileSync(path.join(evidence,name+'-geometry.json'),JSON.stringify(geometry,null,2));
  await page.screenshot({path:path.join(evidence,name+'.png'),animations:'disabled'});
}
async function captureEnd(page,name,selector) {
  await page.locator(selector).evaluate(element=>{
    for(let e=element;e;e=e.parentElement)if(e.scrollHeight>e.clientHeight)e.scrollTop=e.scrollHeight;
  });
  await capture(page,name+'-end');
}
async function subscribe(page,name,state){
  await page.evaluate(({name,state})=>{
    window.__precisionSignals||={};
    window.__precisionSignals[name]=new Promise((resolve,reject)=>{
      let sawBusy=document.querySelector('#ai-image-panel')?.dataset.aiBusy==='true';
      const ready=()=>state==='send'?false:state==='dialog'
        ?!!document.querySelector('dialog[open] [data-ai-scoped-edit-comparison]')
        :sawBusy&&document.querySelector('#ai-image-panel')?.dataset.aiBusy==='false';
      const observer=new MutationObserver(check);
      const timer=setTimeout(()=>{cleanup();reject(new Error('Precision UI signal deadline'));},10000);
      function cleanup(){clearTimeout(timer);observer.disconnect();window.removeEventListener('qa:bridge-send',sent);}
      function check(){
        if(document.querySelector('#ai-image-panel')?.dataset.aiBusy==='true')sawBusy=true;
        if(ready()){cleanup();resolve();}
      }
      function sent(){if(state==='send'){cleanup();resolve();}}
      window.addEventListener('qa:bridge-send',sent);
      observer.observe(document.body,{subtree:true,childList:true,attributes:true});
      check();
    });
  },{name,state});
}
const arrived=(page,name)=>page.evaluate(name=>window.__precisionSignals[name],name);
async function mockMovedPng(page,index,dx){
  return page.evaluate(async({index,dx})=>{
    const {decodeScopedPng,encodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');
    const {scopedPngBytes,scopedPngData}=await import('/js/ai-panel.js?v=1.7.0-four-session-integration');
    const request=window.__task2.sends[index].payload;
    const image=await decodeScopedPng(scopedPngBytes(request.attachments[0].data));
    const spec=JSON.parse(request.text.split('<5e-verified-edit-spec>\n')[1].split('\n</5e-verified-edit-spec>')[0]);
    const source=spec.edits[0].required_edit.source_bounds_pixels;
    const data=new Uint8Array(image.data);
    for(let y=source.y0;y<source.y1;y++)for(let x=source.x0;x<source.x1;x++){
      data.set([255,255,255,255],(y*image.width+x)*4);
    }
    for(let y=source.y0;y<source.y1;y++)for(let x=source.x0;x<source.x1;x++){
      const p=(y*image.width+x)*4;
      data.set(image.data.subarray(p,p+4),(y*image.width+x+dx)*4);
    }
    return scopedPngData(await encodeScopedPng({...image,data},{metadata:image.metadata}));
  },{index,dx});
}


// 2026-10-12(4a523ad8)부터 박스 수정 방식은 접힌 '고급 · 실험' 칸 안에 있다. 고르기 전에 펼친다.
async function showScopedMode(page) {
  const advanced = page.locator('#ai-image-panel [data-ai-scoped-advanced]');
  await advanced.waitFor({ state: 'visible' });
  if (!await advanced.evaluate(node => node.open)) await advanced.locator('summary').click();
  await page.locator('[data-ai-scoped-prompt-mode]').waitFor({ state: 'visible' });
  // 박스별 수치 칸은 코멘트 표식에 올린 창의 접힌 '고급 · 수치 검증' 칸(data-ai-precision-settings) 안에 있다.
  // 코멘트 표시는 처음에 꺼져 있다(2026-10-16, 83201a54).
  if (await page.locator('#ai-image-panel').getAttribute('data-ai-comments-visible') !== 'true') await page.locator('#ai-image-panel [data-ai-comment-visibility]').click();
  const precision = page.locator('#ai-image-panel [data-ai-precision-settings]').first();
  if (!await precision.isVisible()) {
    const marker = page.locator('#ai-image-panel .is-ai-active-candidate button[data-ai-comment-marker]').first();
    if (!await marker.count()) return;
    // 선택된 표식은 계속 움직이는 효과가 있어 '멈춤' 확인 없이 올린다.
    await marker.hover({ force: true });
  }
  await precision.waitFor({ state: 'visible' });
  if (!await precision.evaluate(node => node.open)) await precision.locator('summary').first().click();
}
test('real product blocks a bad candidate, authorizes one original-based correction and persists both attempts',async context=>{
  fs.mkdirSync(evidence,{recursive:true});
  const mobile=process.env.UI_CAPTURE_WIDTH==='390';
  const {page}=await fixture(context,1,evidence,{selectedPartial:true,precisionMove:true,
    browserContextOptions:mobile?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{}});
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,process.env.UI_CAPTURE_THEME||'dark');
  if(!await page.locator('#ai-image-panel [data-ai-scoped-advanced]').isVisible()) {
    await page.locator('#ai-image-panel [data-panel-toggle="right"]').click();
  }
  await showScopedMode(page);
  await page.locator('[data-ai-scoped-prompt-mode]').selectOption('verified');
  assert.equal(await page.getByLabel('박스 1 가로 이동 px',{exact:true}).getAttribute('inputmode'),'text');
  await capture(page,'criteria');
  if(process.env.UI_CAPTURE_MATRIX==='1') {
    await captureEnd(page,'move','[data-ai-precision-settings]');
    for(const kind of ['circles','disconnect']) {
      await page.locator('[data-ai-precision-kind]').selectOption(kind);
      if(kind==='circles') {
        await page.getByLabel('박스 1 추가 개수',{exact:true}).fill('9');
        await page.getByLabel('박스 1 추가 개수',{exact:true}).press('Tab');
        assert.equal(await page.getByLabel('박스 1 추가 개수',{exact:true}).inputValue(),'1');
      }
      await capture(page,kind+'-criteria');
      await captureEnd(page,kind,'[data-ai-precision-settings]');
    }
    await page.locator('[data-ai-precision-kind]').selectOption('move');
    for(const [label,value] of [['가로 이동 px',20],['세로 이동 px',0],['왼쪽 px',312],['위쪽 px',128],['오른쪽 px',396],['아래쪽 px',190]]) {
      await page.getByLabel('박스 1 '+label,{exact:true}).fill(String(value));
      await page.getByLabel('박스 1 '+label,{exact:true}).press('Tab');
    }
  }
  await subscribe(page,'first-send','send');
  await page.locator('[data-ai-comments-apply]').click();await arrived(page,'first-send');
  assert.equal(await page.locator('[data-ai-precision-kind]').isDisabled(),true);
  assert.equal(await page.getByLabel('박스 1 가로 이동 px',{exact:true}).isDisabled(),true);
  const first=await page.evaluate(()=>window.__task2.sends[0].payload);
  assert.equal(first.attachments.length,1);assert.equal(first.model,'gpt-6.1-sol');
  const firstSpec=JSON.parse(first.text.split('<5e-verified-edit-spec>\n')[1].split('\n</5e-verified-edit-spec>')[0]);
  assert.equal(firstSpec.edits[0].required_edit.offset_pixels[0],20);
  await subscribe(page,'failed-dialog','dialog');
  await emit(page,0,'image',await mockMovedPng(page,0,34));await arrived(page,'failed-dialog');
  assert.equal(await page.getByRole('button',{name:'적용',exact:true}).count(),0);
  await page.getByRole('button',{name:'취소',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button',{name:'전체 맞춤',exact:true}).evaluate(element=>element===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByLabel('세 비교 화면 확대 비율',{exact:true}).evaluate(element=>element===document.activeElement),true);
  await capture(page,'blocked');
  if(process.env.UI_CAPTURE_MATRIX==='1'){
    await captureEnd(page,'blocked','dialog[open] [data-ai-scoped-edit-comparison]');
    assert.equal(await page.locator('dialog[open] .ai-confirm-actions button').evaluateAll(elements=>elements.every(element=>{
      const rect=element.getBoundingClientRect();
      return rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;
    })),true);
  }
  let tabs=await snapshot(page);
  assert.equal(tabs[0].generated.length,1);
  assert.equal(tabs[0].generated[0].scopedEditHistory[0].attempts[0].verification.status,'fail');
  await subscribe(page,'correction-send','send');
  await page.getByRole('button',{name:'오차로 한 번 교정',exact:true}).click();await arrived(page,'correction-send');
  const second=await page.evaluate(()=>window.__task2.sends[1].payload);
  assert.equal(second.attachments[0].data,first.attachments[0].data);
  const secondSpec=JSON.parse(second.text.split('<5e-verified-edit-spec>\n')[1].split('\n</5e-verified-edit-spec>')[0]);
  const feedback=JSON.parse(secondSpec.edits[0].original_user_instruction.split('\n').at(-1));
  assert.equal(feedback.measured.dx,34);assert.equal(feedback.expected.dx,20);
  await subscribe(page,'passed-dialog','dialog');
  await emit(page,1,'image',await mockMovedPng(page,1,20));await arrived(page,'passed-dialog');
  await capture(page,'passed-review');
  if(process.env.UI_CAPTURE_MATRIX==='1')await captureEnd(page,'passed-review','dialog[open] [data-ai-scoped-edit-comparison]');
  await subscribe(page,'applied','idle');
  await page.getByRole('button',{name:'적용',exact:true}).click();await arrived(page,'applied');
  tabs=await snapshot(page);
  assert.equal(tabs[0].generated.length,2);
  const source=tabs[0].generated[0],job=source.scopedEditHistory[0];
  assert.equal(source.data,await page.evaluate(()=>window.__task2.original));
  assert.equal(job.status,'applied');assert.equal(job.maximumAttempts,2);
  assert.deepEqual(job.attempts.map(a=>a.verification.status),['fail','pass']);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),2);
  const originalHash=job.sourceSha256;
  await page.reload({waitUntil:'domcontentloaded'});
  const welcome=page.locator('.tut-welcome-overlay .tut-banner-no');
  if(await welcome.isVisible())await welcome.click();
  await page.locator('#ai-image-install-open').click();
  const restored=await snapshot(page);
  assert.equal(restored[0].generated[0].scopedEditHistory[0].sourceSha256,originalHash);
  assert.deepEqual(restored[0].generated[0].scopedEditHistory[0].attempts.map(a=>a.verification.status),['fail','pass']);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Reload cannot retry or replay an approval');
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({
    paidAiCalls:0,evidenceType:'Synthetic transport with actual product UI, source checks, PNG verification and persistence',
    requests:2,badCandidateApplyBlocked:true,cleanOriginalCorrection:true,
    actualCommentFeedback:{measuredDx:feedback.measured.dx,expectedDx:feedback.expected.dx},
    attempts:job.attempts.map(a=>({attempt:a.attempt,status:a.verification.status,inputSha256:a.request.inputSha256})),
    sourceSha256:originalHash,recoveryPreservesFailure:true,recoveryNativeRequests:0
  },null,2));
});

test('a second real PNG verification failure has no apply or third-request path',async context=>{
  const dir=path.join(evidence,'second-failure');fs.mkdirSync(dir,{recursive:true});
  const {page}=await fixture(context,1,dir,{selectedPartial:true,precisionMove:true});
  await showScopedMode(page);
  await page.locator('[data-ai-scoped-prompt-mode]').selectOption('verified');
  await subscribe(page,'send-one','send');
  await page.locator('[data-ai-comments-apply]').click();await arrived(page,'send-one');
  await subscribe(page,'failure-one','dialog');
  await emit(page,0,'image',await mockMovedPng(page,0,34));await arrived(page,'failure-one');
  await subscribe(page,'send-two','send');
  await page.getByRole('button',{name:'오차로 한 번 교정',exact:true}).click();await arrived(page,'send-two');
  await subscribe(page,'failure-two','dialog');
  await emit(page,1,'image',await mockMovedPng(page,1,35));await arrived(page,'failure-two');
  assert.equal(await page.getByRole('button',{name:'적용',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'오차로 한 번 교정',exact:true}).count(),0);
  await subscribe(page,'closed','idle');
  await page.getByRole('button',{name:'닫기',exact:true}).click();await arrived(page,'closed');
  const tabs=await snapshot(page),job=tabs[0].generated[0].scopedEditHistory[0];
  assert.equal(tabs[0].generated.length,1);
  assert.equal(job.status,'failed');
  assert.deepEqual(job.attempts.map(attempt=>attempt.verification.status),['fail','fail']);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),2);
});

test('source preflight rejects an impossible destination before sending, and correction cancellation keeps the original',async context=>{
  const dir=path.join(evidence,'preflight-cancel');fs.mkdirSync(dir,{recursive:true});
  const {page}=await fixture(context,1,dir,{selectedPartial:true,precisionMove:true});
  await showScopedMode(page);
  await page.locator('[data-ai-scoped-prompt-mode]').selectOption('verified');
  await page.getByLabel('박스 1 가로 이동 px',{exact:true}).fill('150');
  await page.getByLabel('박스 1 가로 이동 px',{exact:true}).press('Tab');
  await subscribe(page,'invalid-source','idle');
  await page.locator('[data-ai-comments-apply]').click();await arrived(page,'invalid-source');
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  let tabs=await snapshot(page);
  assert.equal(tabs[0].generated[0].scopedEditHistory[0].error.code,'SCOPED_EDIT_SOURCE_UNCERTAIN');
  await showScopedMode(page);
  await page.getByLabel('박스 1 가로 이동 px',{exact:true}).fill('20');
  await page.getByLabel('박스 1 가로 이동 px',{exact:true}).press('Tab');
  await subscribe(page,'allowed-send','send');
  await page.locator('[data-ai-comments-apply]').click();await arrived(page,'allowed-send');
  await subscribe(page,'cancel-dialog','dialog');
  await emit(page,0,'image',await mockMovedPng(page,0,34));await arrived(page,'cancel-dialog');
  await subscribe(page,'cancelled','idle');
  await page.getByRole('button',{name:'취소',exact:true}).click();await arrived(page,'cancelled');
  tabs=await snapshot(page);
  assert.equal(tabs[0].generated.length,1);
  assert.equal(tabs[0].generated[0].data,await page.evaluate(()=>window.__task2.original));
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),1);
});
