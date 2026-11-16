// 우리 조판(B4) 선지 ①~⑤ 위치를 문항마다 엔진에서 잰다. node choicecheck.cjs <json 폴더>  → id, 줄 수, ①기준 간격(px), 〈보기〉·선지 표 왼쪽
const R=require('path').resolve(__dirname,'../../..');const fs=require('fs'),path=require('path');
const pw=require(R+'/node_modules/playwright');const h=require(R+'/tests/helpers/rhwp-exam.cjs');
const dir=process.argv[2];const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
const qs=files.map((f,i)=>{const q=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')).question;delete q.kice;q.number=String(i+1);q.managementId=f.replace('.json','');return q;});
(async()=>{await h.withServer(async origin=>{const b=await pw.chromium.launch();const page=await (await b.newContext({viewport:{width:1600,height:1000}})).newPage();page.setDefaultTimeout(120000);
 await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
 await page.evaluate(()=>document.querySelector('[data-app-switch="exam"]').click());
 const sheet=await (await page.waitForSelector('#exampool-sheet-workspace iframe')).contentFrame();
 await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중');
 const FORMAT=await sheet.evaluate(async()=>(await import('/assets/exampool/sheet/model.js')).FORMAT);
 await sheet.setInputFiles('#excel-file',{name:'k.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:FORMAT,questions:qs,documents:[]}))});
 await sheet.waitForSelector('#import-dialog[open]');await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});await sheet.click('#apply-import');
 for(const q of qs){
  try{
  await sheet.waitForFunction(id=>[...document.querySelectorAll(`[data-open-card="${id}"],[data-cv-open="${id}"]`)].some(n=>n.getClientRects().length),q.id);
  await sheet.evaluate(id=>[...document.querySelectorAll(`[data-open-card="${id}"],[data-cv-open="${id}"]`)].find(n=>n.getClientRects().length).click(),q.id);
  await sheet.waitForFunction(n=>document.querySelector('#typeset-title')?.textContent.startsWith(n+'번')&&document.querySelector('#native-editor')?.dataset.ready==='true'&&document.querySelector('#preview-dialog')?.getAttribute('aria-busy')!=='true',q.number,{timeout:120000});
  await sheet.waitForTimeout(800);
  const r=await sheet.evaluate(()=>{const w=document.querySelector('#native-editor iframe').contentWindow.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle(),J=v=>typeof v==='string'?JSON.parse(v):v;
    const runs=[];for(let p=0;p<w.pageCount();p++)runs.push(...J(w.getPageTextLayout(p)).runs.map(r=>({...r,page:p})));
    const marks=runs.filter(r=>/^[①-⑤]/.test(r.text)&&r.cellPath?.length===1).map(r=>({c:r.text[0],x:Math.round(r.x),y:Math.round(r.y)}));
    const tables=J(w.getPageControlLayout(0)).controls.filter(c=>c.type==='table').map(c=>({x:Math.round(c.x),w:Math.round(c.w??c.width)}));
    return {marks:marks.slice(-5),tables};});
  console.log(JSON.stringify({id:q.managementId,...r}));
  }catch(e){console.log(JSON.stringify({id:q.managementId,error:e.message.slice(0,120)}));}
 }
 await b.close();});})();
