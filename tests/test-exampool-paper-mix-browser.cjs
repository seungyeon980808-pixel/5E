// 용지가 섞인 시험지(B4로 조판한 문항 + A4 문항): 시험지 HWPX를 만들면 B4 문항 표가 A4 단 밖으로 나가므로 만들지 않고 알린다.
// 쪽 전체에도 같은 경고. 용지를 하나로 맞추면 다시 만들 수 있다.
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
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: an exam mixing B4 and A4 typesets is not assembled`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=[question(1),question(2)];
  await sheet.setInputFiles('#excel-file',{name:'mix.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  const open=async q=>{await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].some(n=>n.getClientRects().length),q.id);
    await sheet.evaluate(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
    await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number);};
  const save=async()=>{for(let i=0;i<3;i++){await sheet.locator('#typeset-save:visible, #card-view [data-cv="hwp-save"]:visible').first().click();await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';});const s=await sheet.locator('#typeset-status').textContent();if(/조판 저장됨/.test(s))return;assert.notEqual(await sheet.locator('#typeset-status').getAttribute('data-error'),'true',s);await sheet.waitForTimeout(400);}throw Error('조판을 저장하지 못했습니다');};
  await open(qs[0]);await save();
  await open(qs[1]);await sheet.click('#typeset-detail');await sheet.selectOption('#paper-size','B4');
  await sheet.waitForFunction(()=>/기준 단 폭 변경됨/.test(document.querySelector('#typeset-status').textContent));
  await sheet.click('#typeset-detail');await save();
  // 두 문항을 시험지에 넣고 HWPX를 받으려 한다.
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
  for(const q of qs){await sheet.selectOption('#exam-from-library',q.id);await sheet.waitForFunction(id=>![...document.querySelectorAll('#exam-from-library option')].some(o=>o.value===id),q.id);}
  let downloaded=false;page.on('download',()=>{downloaded=true;});
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="download"]');
  await sheet.waitForFunction(()=>document.querySelector('#status').dataset.error==='true');
  assert.match(await sheet.locator('#status').textContent(),/용지가 섞여 있습니다\(A4 1번 \/ B4 2번\)/);
  await sheet.waitForTimeout(500);assert.equal(downloaded,false,'no broken exam HWPX is downloaded');
  // 쪽 전체에도 경고
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="cards"]');await sheet.click('[data-cvview="page"]');await sheet.waitForSelector('#cv-page [data-native-page] svg');
  assert.match(await sheet.locator('#cv-page .pg-warn').textContent(),/용지가 섞여 있습니다/);
  const pg=await sheet.locator('#cv-page').boundingBox(),fr=await frame.boundingBox();
  await page.screenshot({path:path.join(out,name+'-page-view-mixed.png'),clip:{x:fr.x+pg.x,y:fr.y+pg.y,width:pg.width,height:pg.height}});
  assert.deepEqual(errors,[]);
 });
});
