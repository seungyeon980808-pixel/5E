// 문항이 많이 쌓여도(150개, 그림 포함) 문항 카드 입력이 버벅이지 않는다: 키 입력 → 화면 반영 p95 100ms 이하, 글자 유실 없음.
// 예전에는 한 글자마다 전체 문항 검사 두 번(그림 data URL 정규식)·전체 데이터 복사·완성 문항 직렬화를 해서 p50 170ms였다.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const {timingCheck}=require('./helpers/performance-reference.cjs');
const png='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../assets/exam-library/images/b1_2007_11_05.png')).toString('base64');
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(s.length*p))]);};
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: card typing stays responsive with 150 questions`,async t=>{
 const {questionFromShape}=await import('../assets/exampool/sheet/templates.js');
 const questions=[];for(let i=0;i<150;i++){const q=questionFromShape({form:['combo','single','pair','talk','essay'][i%5],struct:['two','big','small','experiment'][i%4]},String(i+1));
  q.ask='발문 '+i;if(i%3===0)q.workflow='complete';q.blocks.filter(b=>b.kind==='figure').forEach(b=>b.figure={name:'f.png',data:png,width:600,height:300});questions.push(q);}
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('#exam-pool-open');const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  await sheet.setInputFiles('#excel-file',{name:'many.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'5e-question-sheet-v2',questions,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.check('input[name="import-mode"][value="update"]');await sheet.click('#apply-import');// 같은 ID로 들여온다
  const target=questions[3];// 완성 문항 하나를 고른다(고치면 검토 중으로 돌아가는 계산도 함께 지난다)
  await sheet.locator('[data-open-card]').first().click();await sheet.waitForSelector('#card-view:not([hidden]) #cv-ask');
  await sheet.evaluate(id=>document.querySelector(`#card-view .cv-qtab[data-cv-open="${id}"]`).click(),target.id);await sheet.waitForFunction(v=>document.querySelector('#cv-ask')?.value===v,target.ask);await sheet.waitForFunction(()=>document.querySelector('#native-editor')?.dataset.ready==='true',null,{timeout:90000});await sheet.waitForTimeout(1000);
  await sheet.evaluate(()=>{window.__lat=[];document.addEventListener('beforeinput',e=>{const t0=e.timeStamp;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__lat.push(performance.now()-t0)));},true);});
  const typed=' 이어서 입력하는 문장입니다 가나다라마바사';
  await sheet.click('#cv-ask');await page.keyboard.press('End');await page.keyboard.type(typed,{delay:30});await sheet.waitForTimeout(1500);
  assert.equal(await sheet.locator('#cv-ask').inputValue(),target.ask+typed,'every typed character lands in the card');
  assert.equal(await sheet.evaluate(()=>document.querySelector('#card-view [data-cvstage][aria-pressed="true"]')?.dataset.cvstage),'review','editing a complete question demotes it');
  const lat=await sheet.evaluate(()=>window.__lat);assert.ok(lat.length>=typed.length,'every keystroke was measured');
  timingCheck(pct(lat,.95)<=100,`${name}: card typing p95 ${pct(lat,.95)}ms (p50 ${pct(lat,.5)}ms) with 150 questions`);
  console.log(`${name}: card typing with 150 questions p50 ${pct(lat,.5)}ms p95 ${pct(lat,.95)}ms max ${pct(lat,1)}ms`);
  // 카드 화면에서 전체 다시 그리기(단계 단추)를 해도 숨은 엑셀식 시트(150문항 줄)는 다시 그리지 않는다 — 시트를 열 때 그린다.
  await sheet.evaluate(()=>{window.__rowsWrites=0;const rows=document.querySelector('#rows'),d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(rows,'innerHTML',{set(v){window.__rowsWrites++;d.set.call(this,v);},get(){return d.get.call(this);}});});
  const stageMs=[];for(const k of ['draft','review','complete','review']){stageMs.push(await sheet.evaluate(k=>new Promise(r=>{const t0=performance.now();document.querySelector(`#card-view [data-cvstage="${k}"]`).click();requestAnimationFrame(()=>requestAnimationFrame(()=>r(performance.now()-t0)));}),k));}
  assert.equal(await sheet.evaluate(()=>window.__rowsWrites),0,'full card renders leave the hidden sheet rows alone');
  timingCheck(pct(stageMs,1)<=100,`${name}: stage button full render ${pct(stageMs,1)}ms with 150 questions`);
  console.log(`${name}: stage button full render max ${pct(stageMs,1)}ms`);
  assert.deepEqual(errors,[]);
 });
});
