// 변환된 기출 문항(JSON)을 5E_exam 시험지에 담고, 배치·점검 카드 보기의 한글 엔진 문항 그림을 문항마다 찍는다. node cardshots.cjs <문항 json 폴더> <출력 폴더>
const R=require('path').resolve(__dirname,'../../..');
const fs=require('fs'),path=require('path');const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const [src,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(src).filter(f=>/\.json$/.test(f)).sort();
const qs=files.map((f,i)=>{const q=JSON.parse(fs.readFileSync(path.join(src,f),'utf8')).question;delete q.kice;if(process.env.PAPER)q.paper=process.env.PAPER;q.number=String(i+1);q.managementId=f.replace('.json','');return q;});
(async()=>{await h.withServer(async origin=>{
 const b=await pw.webkit.launch();const page=await (await b.newContext({viewport:{width:1700,height:1100},deviceScaleFactor:2})).newPage();page.setDefaultTimeout(180000);
 page.on('pageerror',e=>console.log('ERR',e.message.slice(0,160)));const step=m=>console.log('step',m);
 await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
 await page.evaluate(()=>document.querySelector('[data-app-switch="exam"]').click());
 const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
 await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
 const FORMAT=await sheet.evaluate(async()=>(await import('/assets/exampool/sheet/model.js')).FORMAT);
 await sheet.setInputFiles('#excel-file',{name:'k.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:FORMAT,questions:qs,documents:[]}))});
 step('import');await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
 if(await sheet.locator('.side').isHidden())await sheet.click('#toggle-nav');
 step('imported '+await sheet.evaluate(()=>document.querySelector('#status').textContent));await sheet.click('.side [data-nav="new-exam"]');await h.pickIntoExam(sheet,qs.map(q=>q.id));
 step('picked');await sheet.click('[data-ex-lv="card"]');
 await sheet.waitForFunction(n=>{const d=[...document.querySelectorAll('.ex-cc .ep-doc')];return d.length===n&&d.every(x=>!x.classList.contains('is-loading'));},qs.length,{timeout:900000});
 for(const [i,q] of qs.entries()){const el=sheet.locator('.ex-cc .ep-doc').nth(i);await el.scrollIntoViewIfNeeded();await el.screenshot({path:path.join(out,q.managementId+'.png')});}
 console.log('done',qs.length);await b.close();});})();
