// 나란한 자료: 옆 칸(표·글)이 더 높아도 그림은 자료 칸 안에서 가로·세로 모두 가운데에 놓인다(칸 위·아래로 붙지 않음).
// 두 갈래 — 그림+표 2×N 자료 표, 상자 안 가로 줄(그림+표, 캡션은 그림과 같은 칸).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exampool-side-materials');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
const uid=()=>require('node:crypto').randomUUID();
// 예제 3번(그림 + 표 나란히)의 표를 8줄로 늘려 그림보다 높게 만든다.
function variant(kind,number){
  const q=structuredClone(examples.questions[2]);q.id=uid();q.number=String(number);
  const ids=new Map(q.blocks.map(b=>[b.id,uid()]));for(const b of q.blocks){b.id=ids.get(b.id);if(b.parent)b.parent=ids.get(b.parent);}
  const group=q.blocks.find(b=>b.kind==='group'),table=q.blocks.find(b=>b.kind==='table');
  while(table.table.rows<8){table.table.cells.push(table.table.cells[table.table.rows-1].map(c=>({...c})));table.table.rows++;}
  if(kind==='boxed')group.boxed=true;
  return q;
}
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: side-by-side figure is centered in its material cell`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('#exam-pool-open');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  const kinds=['materials','boxed'],qs=kinds.map((k,i)=>variant(k,i+1));
  await sheet.setInputFiles('#excel-file',{name:'side.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:qs,documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  for(const [i,q] of qs.entries()){
    await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].some(n=>n.getClientRects().length),q.id);
    await sheet.evaluate(id=>[...document.querySelectorAll(`[data-cv-open="${id}"],[data-open-card="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
    await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number);
    const m=await sheet.evaluate(()=>{const doc=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle(),controls=[];
      for(let i=0;i<doc.pageCount();i++)controls.push(...JSON.parse(doc.getPageControlLayout(i)).controls);
      const img=controls.find(c=>c.type==='image'&&c.cellPath?.length),inside=c=>c.x<=img.x+.5&&c.x+c.w>=img.x+img.w-.5&&c.y<=img.y+.5&&c.y+c.h>=img.y+img.h-.5;
      const cell=controls.filter(c=>c.type==='table').flatMap(t=>t.cells||[]).filter(inside).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
      // 같은 칸의 캡션 글((가) 등)까지 묶어 그 묶음의 가운데를 잰다.
      let [x0,y0,x1,y1]=[img.x,img.y,img.x+img.w,img.y+img.h];const runs=[];for(let i=0;i<doc.pageCount();i++)runs.push(...JSON.parse(doc.getPageTextLayout(i)).runs);
      for(const r of runs)if(r.text.trim()&&r.x>=cell.x-.5&&r.x+r.w<=cell.x+cell.w+.5&&r.y>=cell.y-.5&&r.y+r.h<=cell.y+cell.h+.5){x0=Math.min(x0,r.x);y0=Math.min(y0,r.y);x1=Math.max(x1,r.x+r.w);y1=Math.max(y1,r.y+r.h);}
      return {img:[x0,y0,x1-x0,y1-y0],cell:[cell.x,cell.y,cell.w,cell.h]};});
    // 표 아래 주석은 칸 폭에 맞춰 여러 줄로 나뉘고(한 줄에 눌리지 않음), 배치 검사(조판 저장 조건)를 통과한다.
    const note=await sheet.evaluate(async()=>{const doc=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle();
      const {nativeLayoutIssues}=await import('/assets/exampool/sheet/native-layout-check.js?v=1014-compact-panel');const runs=[];for(let i=0;i<doc.pageCount();i++)runs.push(...JSON.parse(doc.getPageTextLayout(i)).runs);
      const key=r=>JSON.stringify([r.paraIdx,(r.cellPath||[]).map(c=>[c.controlIndex,c.cellIndex,c.cellParaIndex])]),first=runs.find(r=>/실제 값/.test(r.text)),own=runs.filter(r=>key(r)===key(first));
      const lines=new Set(own.map(r=>Math.round(r.y))).size,squeezed=own.some(r=>[...r.text].some((ch,k,a)=>/[가-힣]/.test(ch)&&/[가-힣]/.test(a[k+1]||'')&&r.charX&&r.charX[k+1]-r.charX[k]<r.fontSize*.8));
      return {lines,squeezed,issues:nativeLayoutIssues(doc).map(i=>i.reason+' '+i.text)};});
    assert.ok(note.lines>=2&&!note.squeezed,`${kinds[i]}: the table note wraps instead of being squeezed (${JSON.stringify(note)})`);
    assert.deepEqual(note.issues,[],`${kinds[i]}: no native layout issue blocks saving`);
    const box=await sheet.locator('.cv-hwp-layer').boundingBox(),fr=await frame.boundingBox();
    await page.screenshot({path:path.join(out,`${name}-${kinds[i]}.png`),clip:{x:fr.x+box.x,y:fr.y+box.y,width:box.width,height:box.height}});
    const [ix,iy,iw,ih]=m.img,[cx,cy,cw,ch]=m.cell,label=`${kinds[i]}: picture ${ix}+${iw},${iy}+${ih} cell ${cx}+${cw},${cy}+${ch}`;
    assert.ok(ch>ih+20,`${label} — the neighbor makes the cell taller than the picture`);
    assert.ok(Math.abs((iy+ih/2)-(cy+ch/2))<=3,`${label} — vertically centered`);
    assert.ok(Math.abs((ix+iw/2)-(cx+cw/2))<=3,`${label} — horizontally centered`);
  }
  assert.deepEqual(errors,[]);
 });
});
