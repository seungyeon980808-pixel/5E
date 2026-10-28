// 문항 카드 「쪽 전체」는 미리보기 칸과 같은 한글 엔진 조판을 그린다(HTML 흉내가 아님).
// 같은 문항으로 두 화면의 줄 나눔(줄마다 글)이 같고, 〈보기〉 내어쓰기·선지 한 줄·빈 자료 자리·수식이 그대로인지 본다.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exampool-page-view');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
// 줄 = 같은 높이에 놓인 글자들을 왼쪽부터 이은 것(빈칸 무시). 위치 단위가 달라도 순서만 비교한다.
// 보이지 않는 글자(U+2060, 시험지 맨 위 빈 문단을 1pt로 줄이는 표시)만 든 줄은 줄로 세지 않는다(10-23 지적 2).
const linesOf=chars=>{const rows=[];for(const c of [...chars].sort((a,b)=>a.y-b.y||a.x-b.x)){const row=rows.find(r=>Math.abs(r.y-c.y)<1.5);if(row)row.c.push(c);else rows.push({y:c.y,c:[c]});}
  return rows.sort((a,b)=>a.y-b.y).map(r=>r.c.sort((a,b)=>a.x-b.x).map(c=>c.t).join('').replace(/[\s\u2060]+/g,'')).filter(Boolean);};
for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) test(`${name}: page view draws the native typeset, not an HTML approximation`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('.app-switch-image [data-app-switch="exam"]');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const q=structuredClone(examples.questions[0]);q.blocks[0].text+=' 물체의 속력은 $v$이다.';
  await sheet.setInputFiles('#excel-file',{name:'page-view.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:[q],documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  await sheet.waitForSelector(`[data-open-card="${q.id}"]`);
  await sheet.evaluate(id=>document.querySelector(`[data-open-card="${id}"]`).click(),q.id);
  await sheet.waitForFunction(()=>document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true');
  // 미리보기 칸(한글 창) 문서의 줄
  const preview=await sheet.evaluate(()=>{const doc=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle(),chars=[];
    for(let i=0;i<doc.pageCount();i++)for(const r of JSON.parse(doc.getPageTextLayout(i)).runs){const w=r.w/Math.max(1,[...r.text].length);[...r.text].forEach((t,k)=>chars.push({t,x:r.x+k*w,y:r.y+r.h}));}
    return chars;});
  const box=await sheet.locator('.cv-hwp-layer').boundingBox(),fr=await frame.boundingBox();
  await page.screenshot({path:path.join(out,name+'-preview.png'),clip:{x:fr.x+box.x,y:fr.y+box.y,width:box.width,height:box.height}});
  await sheet.click('[data-cvview="page"]');await sheet.waitForSelector('#cv-page [data-native-page] svg');
  const view=await sheet.evaluate(()=>{const n=document.querySelector('#cv-page'),svg=n.querySelector('[data-native-page] svg'),chars=[],mathText=[];
    for(const t of svg.querySelectorAll('text')){if(/Math/.test(t.getAttribute('font-family')||'')){mathText.push(t.textContent);continue;}const m=/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(t.getAttribute('transform')||'');const x=m?+m[1]:+t.getAttribute('x'),y=m?+m[2]:+t.getAttribute('y');chars.push({t:t.textContent,x,y});}
    return {chars,mathText,head:n.querySelector('.pg-head').textContent,caption:n.querySelector('figcaption').textContent,pages:n.querySelectorAll('[data-native-page]').length,
      now:!!n.querySelector('.pg-now'),html:!!n.querySelector('.pg-q,.pg-qi'),images:svg.querySelectorAll('image').length,raw:svg.textContent};});
  const pg=await sheet.locator('#cv-page').boundingBox();
  await page.screenshot({path:path.join(out,name+'-page-view.png'),clip:{x:fr.x+pg.x,y:fr.y+pg.y,width:pg.width,height:pg.height}});
  assert.equal(view.html,false,'no HTML approximation');assert.equal(view.pages,1);assert.equal(view.caption,'1 / 1');assert.ok(view.now,'current question marked');
  assert.match(view.head,/한글 조판 그대로\(B4 2단\)/); /* 10-28: 새 문항 기본은 수능 형태 B4 2단 */assert.doesNotMatch(view.head,/조판 저장 전/); // 10-23 A2: 조판은 자동 저장 — 「조판 저장 전」 표시는 없앰
  assert.doesNotMatch(view.raw,/\$v\$/,'equation is a native equation, not TeX text');assert.deepEqual(view.mathText,['v'],'equation drawn with the math font');
  assert.ok(view.images>=1,'empty figure keeps its placeholder picture');
  const a=linesOf(preview),b=linesOf(view.chars);
  assert.ok(a.length>=8,'preview has lines');assert.deepEqual(b,a,'same line breaks as the preview');
  assert.ok(a.some(l=>/①.*②.*③.*④.*⑤/.test(l)),'choices on one line');
  assert.deepEqual(errors,[]);
 });
});
