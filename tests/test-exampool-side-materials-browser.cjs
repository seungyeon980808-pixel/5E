// 나란한 자료(그림 + 표): 옆 표가 더 높아도 그림은 자료 칸 안에서 가로·세로 모두 가운데에 놓인다(칸 아래로 붙지 않음).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/exampool-side-materials');fs.mkdirSync(out,{recursive:true});
const examples=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/exampool/sheet/examples.json'),'utf8'));
for(const [name,engine] of Object.entries({chromium,webkit})) test(`${name}: side-by-side figure is centered in its material cell`,async t=>{
 await h.withServer(async origin=>{
  const browser=await engine.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  await page.click('#exam-pool-open');const frame=await page.waitForSelector('#exampool-sheet-workspace iframe'),sheet=await frame.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
  // 예제 3번(그림 + 표 나란히)의 표를 8줄로 늘려 그림보다 높게 만든다.
  const q=structuredClone(examples.questions[2]),table=q.blocks.find(b=>b.kind==='table').table;
  while(table.rows<8){table.cells.push(table.cells[table.rows-1].map(c=>({...c})));table.rows++;}
  await sheet.setInputFiles('#excel-file',{name:'side.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:examples.format,questions:[q],documents:[]}))});
  await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
  await sheet.waitForSelector(`[data-open-card="${q.id}"]`);await sheet.evaluate(id=>document.querySelector(`[data-open-card="${id}"]`).click(),q.id);
  await sheet.waitForFunction(()=>document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true');
  const m=await sheet.evaluate(()=>{const doc=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle(),controls=[];
    for(let i=0;i<doc.pageCount();i++)controls.push(...JSON.parse(doc.getPageControlLayout(i)).controls);
    const img=controls.find(c=>c.type==='image'&&c.cellPath?.length===1),outer=controls.find(c=>c.type==='table'&&!c.cellPath?.length&&c.cells?.some(x=>x.x<=img.x&&x.x+x.w>=img.x+img.w&&x.y<=img.y&&x.y+x.h>=img.y+img.h));
    const cell=outer.cells.find(x=>x.x<=img.x&&x.x+x.w>=img.x+img.w&&x.y<=img.y&&x.y+x.h>=img.y+img.h);
    return {img:[img.x,img.y,img.w,img.h],cell:[cell.x,cell.y,cell.w,cell.h]};});
  const box=await sheet.locator('.cv-hwp-layer').boundingBox(),fr=await frame.boundingBox();
  await page.screenshot({path:path.join(out,name+'-side-materials.png'),clip:{x:fr.x+box.x,y:fr.y+box.y,width:box.width,height:box.height}});
  const [ix,iy,iw,ih]=m.img,[cx,cy,cw,ch]=m.cell;
  assert.ok(ch>ih+20,`neighbor table makes the cell taller than the picture (${ch} vs ${ih})`);
  assert.ok(Math.abs((iy+ih/2)-(cy+ch/2))<=3,`picture vertically centered: picture ${iy}+${ih}, cell ${cy}+${ch}`);
  assert.ok(Math.abs((ix+iw/2)-(cx+cw/2))<=3,`picture horizontally centered: picture ${ix}+${iw}, cell ${cx}+${cw}`);
  assert.deepEqual(errors,[]);
 });
});
