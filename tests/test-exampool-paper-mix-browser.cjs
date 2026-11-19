// 용지가 섞인 시험지(B4로 조판한 문항 + A4 문항), 10-28 결정: 막지 않고 수능 형태(B4 2단)로 만든다.
// A4로 조판한 문항만 시험지 단 폭으로 다시 조판하고(저장한 조판은 그대로), 쪽 전체에도 「용지가 섞여 있습니다」 경고가 없다.
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
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: an exam mixing B4 and A4 typesets is assembled on the KICE B4 two-column page`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b=>b.click());const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=[question(1),question(2)];
  await sheet.setInputFiles('#excel-file',{name:'mix.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  const open=async q=>{await sheet.evaluate(()=>{if(document.querySelector('.shell-body.nav-off'))document.querySelector('#toggle-nav')?.click();});await sheet.evaluate(()=>document.querySelector('.side [data-pool="drafting"]')?.click()); /* 11-15: 카드는 「작업 중」 문항 목록에서 연다 — 열린 카드 위 번호 탭은 없어짐 */ await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].some(n=>n.getClientRects().length),q.id);
    await sheet.evaluate(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
    await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number);};
  const save=async()=>{for(let i=0;i<3;i++){await sheet.evaluate(()=>(document.querySelector('#card-view:not([hidden]) [data-cv="hwp-save"]')||document.querySelector('#typeset-save')).click()) /* 10-23 A2: 조판은 자동 저장 — 단추는 숨겼지만 같은 저장 명령을 부른다 */;await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';});const s=await sheet.locator('#typeset-status').textContent();if(/조판 저장됨/.test(s))return;assert.notEqual(await sheet.locator('#typeset-status').getAttribute('data-error'),'true',s);await sheet.waitForTimeout(400);}throw Error('조판을 저장하지 못했습니다');};
  const T0=Date.now(),lap=k=>console.log(`${name}: ${k} +${Date.now()-T0}ms`); // 진단: 단계별 시간
  await open(qs[0]);lap('open1');await save();lap('save1');
  await open(qs[1]);/* 10-23 B: 상세 조판(용지 고르기)은 「⚙ 조판 설정」 ⋯ 메뉴 「한글 도구 전체 열기」 */const detail=async()=>{await sheet.click('#typeset-settings');await sheet.waitForSelector('.tsx-pop [data-menu]');await sheet.click('.tsx-pop [data-menu]');await sheet.click('.tsx-pop [data-act="detail"]');};lap('open2');await detail();await sheet.selectOption('#paper-size','B4');
  await sheet.waitForFunction(()=>/기준 단 폭 변경됨/.test(document.querySelector('#typeset-status').textContent));
  lap('paper-changed');await detail();await save();lap('save2');
  // 두 문항을 시험지에 넣고 HWPX를 받으려 한다.
  if(await sheet.locator('.shell-body.nav-off').count()||await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');/* 새 시험지는 ① 틀 · 속성에서 열림 → ② 「담기」(10-24) */await h.pickIntoExam(sheet,qs.map(q=>q.id));
  lap('exam-picked');const tDl=Date.now();
  const [download]=await Promise.all([page.waitForEvent('download'),(async()=>{await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="download"]');})()]);
  console.log(`${name}: mixed B4/A4 exam HWPX ready after ${Date.now()-tDl}ms`); // 진단: 이 대기가 60초 기본 제한에 가깝다
  const file=path.join(out,name+'-mixed.hwpx');await download.saveAs(file);
  assert.notEqual(await sheet.locator('#status').getAttribute('data-error'),'true',await sheet.locator('#status').textContent());
  // 시험지 쪽은 B4(257×364mm = 72850×103180 HWPUNIT 근처) — 줄여 뽑는 A4는 인쇄 때만.
  const section=require('node:child_process').execFileSync('unzip',['-p',file,'Contents/section0.xml']).toString();
  const pagePr=section.match(/<hp:pagePr\b[^>]*>/)?.[0]||'';const w=Number(pagePr.match(/\bwidth="(\d+)"/)?.[1]),hgt=Number(pagePr.match(/\bheight="(\d+)"/)?.[1]);
  assert.ok(Math.abs(w-72850)<300&&Math.abs(hgt-103180)<300,`B4 exam page: ${pagePr}`);
  // 쪽 전체: 수능 형태 B4 2단, 섞임 경고 없음
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="cards"]');await sheet.click('[data-cvview="page"]');await sheet.waitForSelector('#cv-page [data-native-page] svg');
  assert.match(await sheet.locator('#cv-page .pg-head').textContent(),/B4 2단/);
  assert.doesNotMatch(await sheet.locator('#cv-page').textContent(),/용지가 섞여 있습니다/);
  const pg=await sheet.locator('#cv-page').boundingBox(),fr=await frame.boundingBox();
  await page.screenshot({path:path.join(out,name+'-page-view-mixed.png'),clip:{x:fr.x+pg.x,y:fr.y+pg.y,width:pg.width,height:pg.height}});
  // 10-22: 시험지 전체에서 다른 문항을 한 번 누르면 고르기만(옅은 테), 두 번 누르면 그 문항 카드로 돌아온다.
  // 11-12: 번호 탭 줄은 없어졌다 — 지금 문항은 카드 머리 「N번 문항」, 시험지 쪽은 카드를 닫고 보이는 전체 보기.
  const currentNo=await sheet.locator('#card-view .qno').first().textContent().catch(()=>null);
  const other=sheet.locator('#cv-page .pg-q-hit').first();await other.waitFor();const otherId=await other.getAttribute('data-cvpg-q');
  assert.ok(otherId,'hit boxes exist');
  await other.click();assert.equal(await sheet.locator('#cv-page .pg-q-hit.is-picked').count(),1,'one click only picks');assert.equal(await sheet.locator('#cv-page').count(),1,'one click stays on the sheet');
  await other.dblclick();await sheet.waitForSelector('#card-view .cv-writer');
  assert.match(await sheet.locator('#card-view .cv-writer .qno').textContent(),new RegExp('^\\s*'+qs.find(q=>q.id===otherId).number+'번'),'double click opens that question card');
  assert.deepEqual(errors,[]);
 });
});
