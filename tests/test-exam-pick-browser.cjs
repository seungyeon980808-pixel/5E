// 시험지 만들기 ② 문항 고르기(10-24 시안 exam-flow-1024-v4): 내 문항 담기·빼기 · 담은 문항 칸 목표 막대 · 분류·태그 창(태그·난이도 저장) · 태그 거르기 · 여러 개 고르기 「모두 담기」 · 문항 전체 카드.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
function question(number){const q=structuredClone(examples.questions[1]);q.id=crypto.randomUUID();q.number=String(number);q.managementId=`고르기-${number}`;
  const ids=new Map(q.blocks.map(b=>[b.id,crypto.randomUUID()]));for(const b of q.blocks){b.id=ids.get(b.id);if(b.parent)b.parent=ids.get(b.parent);if(b.kind==='figure')b.figure=null;}return q;}
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: questions are picked into an exam with tags`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await (await browser.newContext({viewport:{width:1600,height:1000}})).newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=[question(1),question(2),question(3)];
  await sheet.setInputFiles('#excel-file',{name:'pick.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) .ef-s1');
  await sheet.click('[data-ef-step="2"]');await sheet.click('[data-ep-kind="mine"]');
  const card=n=>sheet.locator(`.ep-card[data-ep-key="q:${qs[n].id}"]`);
  await card(0).waitFor();
  // 문항 전체 카드: 미리보기가 잘리지 않고 문항 높이만큼(고정 높이 아님).
  await sheet.waitForFunction(id=>document.querySelector(`.ep-card[data-ep-key="q:${id}"] .ep-doc`)?.textContent.trim().length>0,qs[0].id);
  const th=await card(0).locator('.ep-th').evaluate(n=>({h:n.getBoundingClientRect().height,doc:n.querySelector('.ep-doc').getBoundingClientRect().height}));
  assert.ok(th.h>=th.doc-1&&th.h>80,`the whole question shows: ${JSON.stringify(th)}`);
  // 담기 두 개 → 담은 문항 칸 · 목표 막대(기본 틀 선택형 20).
  for(const n of [0,1]){await card(n).hover();await card(n).locator('[data-ep-take]').click();await sheet.waitForFunction(id=>document.querySelector(`.ep-card[data-ep-key="q:${id}"]`)?.classList.contains('in'),qs[n].id);}
  assert.equal(await sheet.locator('.ep-ci').count(),2);
  assert.match(await sheet.locator('.ep-meter').textContent(),/선택형2 \/ 20/);
  // 빼기 → 다시 하나.
  await sheet.locator('.ep-ci').nth(1).hover();await sheet.locator('.ep-ci [data-ep-out]').nth(1).click();await sheet.waitForFunction(()=>document.querySelectorAll('.ep-ci').length===1);
  // 분류·태그 창: 태그 둘(Enter · # 자동) + 난이도 → 문항 자료에 저장.
  await card(2).hover();await card(2).locator('[data-ep-tag]').click();await sheet.waitForSelector('.ep-pop');
  await sheet.fill('[data-ep-taginput]','실험');await sheet.press('[data-ep-taginput]','Enter');
  await sheet.fill('[data-ep-taginput]','#킬러');await sheet.press('[data-ep-taginput]','Enter');
  await sheet.click('.ep-pop [data-ep-lvset="상"]');
  await sheet.waitForFunction(()=>document.querySelectorAll('.ep-pop .ep-tagin .ep-tg').length===2);
  await sheet.click('[data-ep-popx]');
  assert.equal(await card(2).locator('.ep-tgs').textContent(),'난이도 상#실험#킬러');
  // 태그 거르기: #킬러 → 그 문항만.
  await sheet.click('[data-ep-tagf="#킬러"]');await sheet.waitForFunction(()=>document.querySelectorAll('.ep-card').length===1);
  assert.equal(await sheet.locator('.ep-card').getAttribute('data-ep-key'),'q:'+qs[2].id);
  await sheet.click('[data-ep-tagclear]');
  // 여러 개 고르기 → 모두 담기.
  await sheet.click('[data-ep-multi]');for(const n of [1,2])await card(n).locator('.ep-mt').click();
  assert.equal(await sheet.locator('.ep-bulk b').textContent(),'2개 골랐음');
  await sheet.click('[data-ep-bulktake]');await sheet.waitForFunction(()=>document.querySelectorAll('.ep-ci').length===3);
  // ③으로: 담은 순서대로 번호.
  await sheet.click('.ef-foot [data-ef-step="3"]');await sheet.waitForSelector('#examd-view .pv-orow');
  assert.equal(await sheet.locator('.pv-orow').count(),3);
  // 태그는 내용이 아니므로 저장해도 문항 상태가 바뀌지 않고, 자료 검사를 통과해 그대로 남는다.
  await sheet.click('[data-ef-step="2"]');await card(2).waitFor();
  assert.equal(await card(2).locator('.ep-tgs').textContent(),'난이도 상#실험#킬러');
  assert.deepEqual(errors,[]);
 });
});
