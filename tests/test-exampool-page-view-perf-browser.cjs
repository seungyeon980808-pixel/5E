// 문항 많은 시험지에서 쪽 전체(한글 엔진 그림)·시험지 HWPX를 만드는 동안 화면이 통째로 멈추지 않는다.
// 문항·쪽 하나마다 잠깐 쉬므로 가장 긴 프레임이 짧다(고치기 전: 8문항 쪽 전체 143ms, 12문항 253ms·HWPX 160ms 한 번에 멈춤).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const {timingCheck}=require('./helpers/performance-reference.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exampool-page-view-perf');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
const PNG='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'fixtures/rights-clear-smoke.png')).toString('base64');
const N=8;
function question(number){
  const q=structuredClone(examples.questions[1]);q.id=crypto.randomUUID();q.number=String(number);
  const ids=new Map(q.blocks.map(b=>[b.id,crypto.randomUUID()]));for(const b of q.blocks){b.id=ids.get(b.id);if(b.parent)b.parent=ids.get(b.parent);if(b.kind==='figure'&&!b.figure)b.figure={name:'f.png',data:PNG};}
  return q;
}
// 문항 창에서 rAF 간격을 재기 시작/끝.
const watch=frame=>frame.evaluate(()=>{window.__gap=0;window.__watch=true;let last=performance.now();const tick=()=>{const n=performance.now();window.__gap=Math.max(window.__gap,n-last);last=n;if(window.__watch)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
const stop=frame=>frame.evaluate(()=>{window.__watch=false;return Math.round(window.__gap);});
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: a ${N}-question exam renders its page view and HWPX without long freezes`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=Array.from({length:N},(_,i)=>question(i+1));
  await sheet.setInputFiles('#excel-file',{name:'perf.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  const ready=n=>sheet.waitForFunction(n=>(n==='*'||document.querySelector('#typeset-title')?.textContent.startsWith(n+'번'))&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',String(n));
  const open=async q=>{await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].some(n=>n.getClientRects().length),q.id);
    await sheet.evaluate(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);await ready(q.number);};
  for(const q of qs){await open(q);
    for(let i=0;i<3;i++){await sheet.evaluate(()=>(document.querySelector('#card-view:not([hidden]) [data-cv="hwp-save"]')||document.querySelector('#typeset-save')).click()) /* 10-23 A2: 조판은 자동 저장 — 단추는 숨겼지만 같은 저장 명령을 부른다 */;await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';});if(/조판 저장됨/.test(await sheet.locator('#typeset-status').textContent()))break;assert.notEqual(await sheet.locator('#typeset-status').getAttribute('data-error'),'true');}}
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.click('#examd-view [data-ef-step="3"]') /* 새 시험지는 ① 틀 · 속성에서 열림(10-24) */;await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
  for(const q of qs){await sheet.selectOption('#exam-from-library',q.id);await sheet.waitForFunction(id=>![...document.querySelectorAll('#exam-from-library option')].some(o=>o.value===id),q.id);}
  // 시험지 HWPX
  await watch(sheet);const downloading=page.waitForEvent('download');await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="download"]');await downloading;const hwpxGap=await stop(sheet);
  // 쪽 전체
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="cards"]');await sheet.waitForTimeout(300);await ready('*');await sheet.waitForTimeout(500);
  await watch(sheet);await sheet.click('[data-cvview="page"]');await sheet.waitForFunction(()=>document.querySelectorAll('#cv-page [data-native-page] svg').length>0);await sheet.waitForTimeout(100);const pageGap=await stop(sheet);
  const pages=await sheet.locator('#cv-page [data-native-page]').count();assert.ok(pages>=2,`the exam spans pages (${pages})`);
  await page.screenshot({path:path.join(out,name+'-page-view.png')});
  console.log(`${name}: 시험지 HWPX 가장 긴 프레임 ${hwpxGap}ms · 쪽 전체(${pages}쪽) ${pageGap}ms`);
  timingCheck(hwpxGap<100,`${name}: exam HWPX keeps frames short (${hwpxGap}ms)`);
  timingCheck(pageGap<100,`${name}: page view keeps frames short (${pageGap}ms)`);
  assert.deepEqual(errors,[]);
 });
});
