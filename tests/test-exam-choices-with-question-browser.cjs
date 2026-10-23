// 10-23 지적 2: 시험지 쪽 배치에서 선지가 문항과 떨어져 다음 단·쪽으로 가거나 문항 상자가 겹치던 문제.
// 9문항 이상 시험지(예제 3문항 × 4, 5번은 B4로 조판)를 시험지 화면에 그린 실제 쪽에서 본다:
// 문항마다 상자가 하나(단·쪽에 걸치지 않음) · 같은 쪽 상자끼리 겹치지 않음 · 단 높이를 넘는 문항 없음 · 단 폭이 다른 문항은 다시 조판해 알림.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exam-choices-with-question');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
// 그림 없는 그림 칸·빈 지문은 빼고(조판을 막는 빈 칸), 예제를 네 번 돌려 12문항. 5번은 B4로 조판한 문항.
function questions(){
  const base=examples.questions.map(q0=>{const q=structuredClone(q0),drop=new Set(q.blocks.filter(b=>b.kind==='figure'&&!b.figure||b.kind==='text'&&!String(b.text||'').trim()).map(b=>b.id));q.blocks=q.blocks.filter(b=>!drop.has(b.id)&&!drop.has(b.parent));return q;});
  const qs=[];
  for(let k=0;k<4;k++)for(const q0 of base){const q=structuredClone(q0);q.id=crypto.randomUUID();const ids=new Map(q.blocks.map(b=>[b.id,crypto.randomUUID()]));for(const b of q.blocks){b.id=ids.get(b.id);if(b.parent)b.parent=ids.get(b.parent);}
    q.number=String(qs.length+1);if(qs.length===4)q.paper='B4';qs.push(q);}
  return qs;
}
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: choices stay with their question on the exam pages`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const qs=questions(),exam={id:'exam-split',title:'배치 시험',status:'drafting',items:qs.map(q=>q.id),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await sheet.setInputFiles('#excel-file',{name:'split.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[],exams:[exam]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  await sheet.waitForTimeout(1200);await sheet.evaluate(()=>document.querySelector('[data-nav="exams"]').click());
  await sheet.locator('#exams-view button:has-text("열기")').first().click();
  await sheet.waitForSelector('#exam-sheet .pv-pg',{timeout:180000});
  await sheet.waitForFunction(()=>document.querySelectorAll('#exam-sheet .pv-pg').length>=3&&!/어림/.test(document.querySelector('#exam-layout-checks')?.textContent||''),null,{timeout:120000});
  const view=await sheet.evaluate(()=>({checks:document.querySelector('#exam-layout-checks').textContent,pages:[...document.querySelectorAll('#exam-sheet .pv-pg')].map(p=>[...p.querySelectorAll('.pv-pg-q')].map(b=>{const r=b.getBoundingClientRect();return {id:b.dataset.examPick,x:r.x,y:r.y,r:r.right,b:r.bottom};}))}));
  fs.writeFileSync(path.join(out,`${name}-pages.json`),JSON.stringify(view,null,1));
  await page.screenshot({path:path.join(out,`${name}-exam.png`)});
  const all=view.pages.flat(),per=new Map();for(const b of all)per.set(b.id,(per.get(b.id)||0)+1);
  assert.equal(per.size,qs.length,`${name}: every question is on the pages`);
  for(const [id,n] of per)assert.equal(n,1,`${name}: question ${qs.findIndex(q=>q.id===id)+1} sits in one column (its choices did not move to the next column or page)`);
  for(const boxes of view.pages)for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],overlap=Math.min(a.r,b.r)-Math.max(a.x,b.x)>2&&Math.min(a.b,b.b)-Math.max(a.y,b.y)>2;
    assert.equal(overlap,false,`${name}: boxes of questions ${qs.findIndex(q=>q.id===a.id)+1} and ${qs.findIndex(q=>q.id===b.id)+1} do not overlap`);}
  assert.doesNotMatch(view.checks,/단 높이를 넘는/,`${name}: no question is taller than a column`);
  assert.match(view.checks,/단 폭이 다른 용지로 조판한 문항: 5번/,`${name}: the B4 question is re-typeset for the A4 column and reported`);
  assert.deepEqual(errors,[],`${name}: no page errors`);
  console.log(`${name}: choices stay with their question`);
 });
});
