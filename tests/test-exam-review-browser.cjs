// 시험지 출제 점검·요약·이원목적분류표·나형·인쇄(10-22 시험지 편집 기능): 저장한 조판 두 문항으로 확인.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exampool-paper-mix');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
const PNG='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'fixtures/rights-clear-smoke.png')).toString('base64');
function question(number){
  const q=structuredClone(examples.questions[1]);q.id=crypto.randomUUID();q.number=String(number);
  const ids=new Map(q.blocks.map(b=>[b.id,crypto.randomUUID()]));for(const b of q.blocks){b.id=ids.get(b.id);if(b.parent)b.parent=ids.get(b.parent);if(b.kind==='figure'&&!b.figure)b.figure={name:'f.png',data:PNG};}
  return q;
}
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: exam summary, checks, blueprint, B form and print`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=[question(1),question(2)];
  await sheet.setInputFiles('#excel-file',{name:'form.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  const open=async q=>{await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].some(n=>n.getClientRects().length),q.id);
    await sheet.evaluate(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
    await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number);};
  const save=async()=>{for(let i=0;i<3;i++){await sheet.locator('#typeset-save:visible, #card-view [data-cv="hwp-save"]:visible').first().click();await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';});const s=await sheet.locator('#typeset-status').textContent();if(/조판 저장됨/.test(s))return;assert.notEqual(await sheet.locator('#typeset-status').getAttribute('data-error'),'true',s);await sheet.waitForTimeout(400);}throw Error('조판을 저장하지 못했습니다');};
  await open(qs[0]);await save();await open(qs[1]);await save();
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
  for(const q of qs){await sheet.selectOption('#exam-from-library',q.id);await sheet.waitForFunction(id=>![...document.querySelectorAll('#exam-from-library option')].some(o=>o.value===id),q.id);}
  // 시험지 한눈에: 정답 분포 5칸·출제 점검(배점 합계 100이 아님 등)
  assert.equal(await sheet.locator('.pv-answers span').count(),5);
  assert.ok((await sheet.locator('.pv-checks li').allTextContents()).some(t=>/배점 합계/.test(t)),'exam checks list shows the total');
  // 이원목적분류표·정답표 엑셀
  {const dl=page.waitForEvent('download');await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="blueprint"]');const d=await dl;assert.match(d.suggestedFilename(),/이원목적분류표·정답표\.xlsx$/);assert.ok(fs.statSync(await d.path()).size>1000);}
  // 나형: HWPX(번호 다시 매김)와 가·나형 정답 대응 엑셀
  {const files=[];const got=new Promise(res=>{page.on('download',d=>{files.push(d);if(files.length===2)res();});});
    await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="variant"]');await got;
    const names=files.map(f=>f.suggestedFilename());assert.ok(names.some(n=>/\(나형\)\.hwpx$/.test(n))&&names.some(n=>/가나형 정답 대응\.xlsx$/.test(n)),names.join(' '));
    const hwpx=files.find(f=>/hwpx$/.test(f.suggestedFilename()));const bytes=Array.from(fs.readFileSync(await hwpx.path()));
    const first=await sheet.evaluate(bytes=>{const D=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().constructor,d=new D(new Uint8Array(bytes));let t='';for(let p=0;p<d.getParagraphCount(0)&&!t;p++){const s=d.getTextRange(0,p,0,d.getParagraphLength(0,p));if(/^\s*\d+\./.test(s))t=s.slice(0,4);}d.free();return t;},bytes);
    assert.match(first,/^1\./,'the B form is renumbered from 1');}
  // 인쇄·PDF: 쪽마다 실제 용지 크기 인쇄 틀
  await sheet.evaluate(()=>{window.__printed=0;const orig=HTMLIFrameElement.prototype;window.__frames=()=>[...document.querySelectorAll('iframe[aria-hidden="true"]')].map(f=>f.contentDocument?.querySelectorAll('.p svg').length||0);});
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="print"]');
  await sheet.waitForFunction(()=>/인쇄 창을 열었습니다/.test(document.querySelector('#status').textContent),null,{timeout:90000});
  assert.ok((await sheet.evaluate(()=>window.__frames())).some(n=>n>=1),'print frame holds the engine pages');
  assert.deepEqual(errors,[]);
 });
});
