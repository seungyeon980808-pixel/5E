// 11-13 밤(시안 exam-fixes-1113 H): 시험지 쪽은 지면 그림이 바뀌지 않으면 다시 묶지 않는다.
// 시험지를 연 뒤 다른 화면에 갔다 돌아와도(같은 내용) 「다시 조판 중」이 뜨지 않고 쪽이 그대로 남아야 한다.
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
test('exam sheet is not re-laid out when nothing printed changed',{timeout:400000},async t=>{
  const {questionFromShape}=await import('../assets/exampool/sheet/templates.js');
  const qs=[];for(let i=0;i<4;i++){const q=questionFromShape({form:'single',struct:'two'},String(i+1));q.ask=`발문 ${i+1}: 다음 설명으로 옳은 것은?`;q.choices.forEach((c,k)=>c.text=`선지 ${k+1}`);qs.push(q);}
  await h.withServer(async origin=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
    await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
    await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b=>b.click());const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
    await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
    const exam={id:'exam-skip',title:'다시 묶기 시험',status:'drafting',items:qs.map(q=>q.id),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await sheet.setInputFiles('#excel-file',{name:'skip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'5e-question-sheet-v2',questions:qs,documents:[],exams:[exam]}))});
    await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
    await sheet.waitForTimeout(1200);await sheet.evaluate(()=>document.querySelector('[data-nav="exams"]').click());
    await sheet.locator(`#exams-view [data-nav="exam"]`).first().click();
    await sheet.waitForSelector('#exam-sheet .pv-pg',{timeout:180000});await sheet.waitForFunction(()=>!document.querySelector('#exam-sheet .pv-rechip'),null,{timeout:120000});
    const pages=await sheet.locator('#exam-sheet .pv-pg').count();
    // 다른 화면 → 다시 이 시험지
    await sheet.evaluate(()=>document.querySelector('#exam-sheet .pv-pg').setAttribute('data-mark','same'));// 다시 묶으면 쪽 그림을 새로 넣어 이 표시가 사라진다
    await sheet.evaluate(()=>document.querySelector('[data-nav="exams"]').click());await sheet.waitForTimeout(300);
    await sheet.evaluate(()=>{window.__chip=false;new MutationObserver(()=>{if(document.querySelector('#exam-sheet .pv-rechip'))window.__chip=true;}).observe(document.body,{subtree:true,childList:true});});
    await sheet.locator(`#exams-view [data-nav="exam"]`).first().click();await sheet.waitForSelector('#exam-sheet .pv-pg');await sheet.waitForTimeout(2500);
    assert.equal(await sheet.evaluate(()=>window.__chip),false,'no re-layout chip when nothing printed changed');
    assert.equal(await sheet.locator('#exam-sheet .pv-pg').count(),pages,'pages stay');
    assert.equal(await sheet.locator('#exam-sheet .pv-pg[data-mark="same"]').count(),1,'the same page pictures are kept (not laid out again)');
    assert.deepEqual(errors,[]);
  });
});
