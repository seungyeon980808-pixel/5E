// 11-13 밤: 「1106시험지 태스트」(설치판에서 읽기만 해 온 문항·양식, 밖에 둔 파일 E1106_JSON)를 5E_hwp로 보내
// 한글 엔진이 그린 쪽을 SVG로 남긴다 — 「여유가 있는데 밀림」 재현용(파일이 없으면 건너뜀).
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const SRC=process.env.E1106_JSON,OUT=process.env.E1106_OUT;
test('1106 exam send repro',{skip:!SRC||!fs.existsSync(SRC),timeout:900000},async t=>{
  const d=JSON.parse(fs.readFileSync(SRC,'utf8'));fs.mkdirSync(OUT,{recursive:true});
  await h.withServer(async origin=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
    const open=async()=>{await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);await page.locator('.app-switch-image [data-app-switch="exam"]').evaluate(b=>b.click());
      const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();await sheet.waitForSelector('.side [data-pool="drafting"]');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');return sheet;};
    let sheet=await open();
    await sheet.setInputFiles('#excel-file',{name:'t.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:d.format,questions:d.questions,documents:[],exams:[d.exam]}))});
    await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');await sheet.waitForTimeout(2500);
    await sheet.evaluate(async d=>{const names=(await indexedDB.databases()).map(x=>x.name),name=names.find(n=>/5e-exampool-structure$/.test(n));
      const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
      const forms=d.forms.map(f=>({...f,bytes:Uint8Array.from(atob(f.bytes),c=>c.charCodeAt(0))}));
      await new Promise((res,rej)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(forms,'typesetForms');t.oncomplete=res;t.onerror=()=>rej(t.error);});db.close();},d);
    sheet=await open();
    await sheet.evaluate(()=>document.querySelector('[data-nav="exams"]').click());await sheet.waitForTimeout(500);
    await sheet.locator('#exams-view [data-nav="exam"]').first().click();
    await sheet.waitForSelector('#exam-sheet .pv-pg',{timeout:300000});
    await sheet.click('[data-exam-act="send"]');
    await page.waitForFunction(()=>document.querySelector('#exampool-sheet-workspace')?.hidden===true&&!document.querySelector('#rhwp-exam-workspace')?.hidden,null,{timeout:600000});
    await page.waitForTimeout(3000);
    const pages=await page.evaluate(()=>{const b=window.fiveEHwpPalette.native.bridge(),d=b.wasm.borrowDocumentHandle(),n=d.pageCount();return [...Array(n).keys()].map(i=>d.renderPageSvg(i));});
    pages.forEach((s,i)=>fs.writeFileSync(path.join(OUT,`hwp-p${i+1}.svg`),s));
    await page.screenshot({path:path.join(OUT,'hwp-view.png')});
    fs.writeFileSync(path.join(OUT,'info.json'),JSON.stringify({pages:pages.length,errors},null,1));
  });
});
