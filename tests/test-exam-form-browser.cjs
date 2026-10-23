// 학교 양식 위에 시험지 묶기(10-22 S1·S3): 양식 등록 → 시험지 양식 고르기 → HWPX에 학교 제목 표·용지는 그대로, 예시 문항은 비우고 우리 문항이 들어간다.
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
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: an exam is assembled on a registered school form`,async t=>{
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
  const save=async()=>{for(let i=0;i<3;i++){await sheet.evaluate(()=>(document.querySelector('#card-view:not([hidden]) [data-cv="hwp-save"]')||document.querySelector('#typeset-save')).click()) /* 10-23 A2: 조판은 자동 저장 — 단추는 숨겼지만 같은 저장 명령을 부른다 */;await sheet.waitForFunction(()=>{const n=document.querySelector('#typeset-status');return /조판 저장됨|다시 누르세요/.test(n.textContent)||n.dataset.error==='true';});const s=await sheet.locator('#typeset-status').textContent();if(/조판 저장됨/.test(s))return;assert.notEqual(await sheet.locator('#typeset-status').getAttribute('data-error'),'true',s);await sheet.waitForTimeout(400);}throw Error('조판을 저장하지 못했습니다');};
  await open(qs[0]);await save();await open(qs[1]);await save();
  if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
  await sheet.click('.side [data-nav="new-exam"]');await sheet.waitForSelector('#examd-view:not([hidden]) #exam-from-library');
  for(const q of qs){await sheet.selectOption('#exam-from-library',q.id);await sheet.waitForFunction(id=>![...document.querySelectorAll('#exam-from-library option')].some(o=>o.value===id),q.id);}
  // 시험지 화면의 「학교 양식 등록…」에서 등록하면 문항 기준은 그대로, 이 시험지 양식으로 바로 고른다.
  await sheet.selectOption('#exam-form','__new');
  // 학교 양식: 같은 엔진으로 만든 B4 2단 시험지(제목 표 + 예시 문항 둘)를 등록한다.
  const form=await sheet.evaluate(()=>{
    const D=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().constructor,HU=7200/25.4,d=D.createEmpty();
    d.createBlankDocument();const pg=JSON.parse(d.getPageDef(0));Object.assign(pg,{width:Math.round(257*HU),height:Math.round(364*HU),marginLeft:Math.round(15*HU),marginRight:Math.round(15*HU),marginTop:Math.round(15*HU),marginBottom:Math.round(15*HU)});d.setPageDef(0,JSON.stringify(pg));
    const para=t=>`<p style="margin:0 0 6px;text-align:justify"><span style="font-family:함초롬바탕;font-size:10pt">${t}</span></p>`;
    d.pasteHtml(0,0,0,'<div><table style="border-collapse:collapse;width:600px"><tr><td style="border:0.4pt solid #000;width:600px"><p><span style="font-size:14pt">미래과학고등학교 2026학년도 2학기 중간고사 과학</span></p></td></tr></table>'+para('1. 예시 문항입니다. 지울 자리.')+para('2. 둘째 예시 문항입니다.')+'</div>');
    const out=Array.from(d.exportHwpx());d.free();return out;});
  await sheet.setInputFiles('#school-file-input',{name:'미래과학고 중간고사.hwpx',mimeType:'application/octet-stream',buffer:Buffer.from(form)});
  await sheet.waitForSelector('#school-dialog[open]');
  assert.match(await sheet.locator('#school-structure').textContent(),/머리 표 1개/);
  assert.equal(await sheet.locator('#school-keep-form').isChecked(),true);
  assert.equal(await sheet.locator('#school-save').textContent(),'양식으로 등록하고 이 시험지에 쓰기');
  await sheet.click('#school-save');await sheet.waitForFunction(()=>!document.querySelector('#school-dialog').open&&/이 시험지에 썼습니다/.test(document.querySelector('#status').textContent));
  assert.equal(await sheet.evaluate(()=>document.querySelector('#exam-form').selectedOptions[0].textContent),'미래과학고 중간고사','the exam now uses the new form');
  const download=page.waitForEvent('download',{timeout:90000});
  await sheet.click('[data-exam-more]');await sheet.click('.pv-more [data-exam-act="download"]');
  const file=await (await download).path();const bytes=Array.from(fs.readFileSync(file));
  const check=await sheet.evaluate(bytes=>{const D=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle().constructor,d=new D(new Uint8Array(bytes));
    const text=[...Array(d.getParagraphCount(0)).keys()].map(p=>d.getTextRange(0,p,0,d.getParagraphLength(0,p))).join('\n');const nested=JSON.stringify(JSON.parse(d.getPageControlLayout(0)).controls.length);
    const page=JSON.parse(d.getPageDef(0));const all=d.getTextFileText?d.getTextFileText():text;d.free();return {all:String(all),width:page.width,nested};},bytes);
  assert.match(check.all,/미래과학고등학교 2026학년도 2학기 중간고사 과학/,'the school title table stays');
  assert.doesNotMatch(check.all,/예시 문항입니다|둘째 예시 문항/,'the sample questions are cleared');
  assert.match(check.all,new RegExp(qs[0].ask.slice(0,8).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'our questions are inserted');
  assert.ok(Math.abs(check.width-Math.round(257*7200/25.4))<5,'the school paper (B4) stays');
  assert.deepEqual(errors,[]);
 });
});
