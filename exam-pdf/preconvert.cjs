// 기출 미리 변환(11-03 밤): 5E 「변형」과 같은 엔진(kice-engine convertKice)으로 기출 문항을 미리 바꿔 문항 하나당 JSON 하나로 남긴다.
// 「변형」은 이 파일이 있으면 받아서 바로 카드로 넣고(PDF 받기·변환 없음), 없으면 지금처럼 그 자리에서 바꾼다.
// PDF는 동기화된 드라이브 공유 폴더에서 바로 읽는다(브라우저 요청을 가로채 로컬 파일로 답함).
// 실행: node exam-pdf/preconvert.cjs [--source=''|hakpyeong] [--limit=N] [--pages=4]  → exam-pdf/q-<source>/<id>.json (+ 실패 목록 failed.json)
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {chromium}=require('playwright');
const h=require('../tests/helpers/rhwp-exam.cjs');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith(`--${k}=`));return a?a.slice(k.length+3):d;};
const VERIFY=Number(arg('verify',0)),SOURCE=arg('source',''),LIMIT=Number(arg('limit',0)),PAGES=Number(arg('pages',4)),ONLY=arg('only','');
const ROOT=process.env.EXAM_PDF_ROOT||path.join(os.homedir(),'Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916');
const OUT=path.join(__dirname,`q-${SOURCE||'kice'}`);fs.mkdirSync(OUT,{recursive:true});
const L=(...a)=>console.log(new Date().toTimeString().slice(0,8),...a);
const engineKey=require('./engine-key.cjs')();

h.withServer(async origin=>{
  const browser=await chromium.launch();
  try{
    const ctx=await browser.newContext();
    // PDF는 로컬 드라이브 폴더에서
    await ctx.route(/5e-exam-pdf\.5e-desktop\.workers\.dev\/v1\/|5e-google-drive-gateway/,async route=>{
      const u=new URL(route.request().url());let rel=decodeURIComponent(u.pathname);rel=rel.replace(/^\/v1\//,'').replace(/^.*\/public\//,'');
      const file=path.join(ROOT,rel);if(!fs.existsSync(file))return route.fulfill({status:404,body:'none'});
      return route.fulfill({status:200,headers:{'content-type':'application/pdf','access-control-allow-origin':'*'},body:fs.readFileSync(file)});});
    const page0=await ctx.newPage();await page0.goto(origin+'/assets/exampool/sheet/index.html');
    const items=await page0.evaluate(async source=>{const m=await import('/assets/exampool/sheet/past-data.js');const {items}=await m.loadPastQuestions([],source);
      return items.map(i=>({id:i.id,subject:i.subject,title:i.title,page:i.page,box:i.box,pdfFile:i.pdfFile,publicPath:i.publicPath,no:String(i.no),nativeImageBoxes:i.nativeImageBoxes,record:i.record}));},SOURCE||'');
    let todo=VERIFY?items.filter(i=>fs.existsSync(path.join(OUT,i.id+'.json'))).sort(()=>Math.random()-.5).slice(0,VERIFY):items.filter(i=>!fs.existsSync(path.join(OUT,i.id+'.json')));if(ONLY)todo=todo.filter(i=>i.id.includes(ONLY));if(LIMIT)todo=todo.slice(0,LIMIT);
    L(`문항 ${items.length}개 · 남은 것 ${todo.length}개 · 쪽 ${PAGES}개 · 엔진 ${engineKey}`);
    const failed=[];let done=0;const t0=Date.now();
    // 쪽 하나로 수천 문항을 바꾸면 메모리가 쌓여 쪽이 죽는다(11-03 1,200개째) — 150문항마다 새 쪽, 죽으면 새 쪽에서 한 번 더.
    await page0.close();
    async function fresh(){const page=await ctx.newPage();await page.goto(origin+'/assets/exampool/sheet/index.html');
      await page.evaluate(async()=>{window.__eng=await import('/assets/exampool/convert/kice-engine.js?v=1019-convert');window.__drv=await import('/assets/exampool/convert/es/drive-source.mjs');});return page;}
    async function worker(k){let page=await fresh(),used=0;
      for(;;){const item=todo.shift();if(!item){await page.close().catch(()=>{});return;}
        if(++used>150){await page.close().catch(()=>{});page=await fresh();used=1;}
        const run=()=>page.evaluate(async item=>{try{
          window.__eng.setPdfSource(name=>{if(name!==item.pdfFile)throw Error('원본 PDF 경로를 찾지 못했습니다.');return window.__drv.downloadDriveFile(item.publicPath);});
          const rec=item.record||[];
          const source={id:item.id,subject:item.subject,title:item.title,page:item.page,box:item.box,pdfFile:item.pdfFile,publicPath:item.publicPath,no:item.no,
            ...(item.nativeImageBoxes?.length?{nativeImageBoxes:item.nativeImageBoxes}:{}),...(rec.length?{form:rec[0],struct:rec[1],layout:rec[2],choiceShape:rec[3],choiceArrange:rec[4]}:{})};
          const {question,diag}=await window.__eng.convertKice(source,{number:'0'});return {ok:true,json:JSON.stringify({question,diag:{notes:diag?.notes||[]}})};
        }catch(e){return {ok:false,error:String(e?.message||e)};}},item);
        let r;try{r=await run();}catch(e){await page.close().catch(()=>{});page=await fresh();used=1;try{r=await run();}catch(e2){r={ok:false,error:'쪽 멈춤: '+String(e2.message).slice(0,80)};await page.close().catch(()=>{});page=await fresh();}}
        const norm=t=>{const m=new Map();return t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,x=>m.get(x)||(m.set(x,'id'+m.size),m.get(x)));};
        if(VERIFY){const saved=JSON.parse(fs.readFileSync(path.join(OUT,item.id+'.json'),'utf8'));const same=r.ok&&norm(JSON.stringify(JSON.parse(r.json).question))===norm(JSON.stringify(saved.question));if(!same)failed.push({id:item.id,error:'다름'});}
        else if(r.ok){fs.writeFileSync(path.join(OUT,item.id+'.json'),JSON.stringify({v:engineKey,id:item.id,...JSON.parse(r.json)}));}else failed.push({id:item.id,error:r.error});
        if(++done%50===0){const s=(Date.now()-t0)/1000;L(`${done}개 · ${(s/done).toFixed(2)}초/개 · 실패 ${failed.length}`);}}}
    await Promise.all(Array.from({length:PAGES},(_,k)=>worker(k)));
    if(!VERIFY)fs.writeFileSync(path.join(OUT,'failed.json'),JSON.stringify(failed,null,1));else L('같은지 확인',done,'개 중 다름',failed.length,JSON.stringify(failed.slice(0,5)));
    L(`끝: ${done}개 · 실패 ${failed.length} · ${((Date.now()-t0)/1000).toFixed(0)}초`);
  }finally{await browser.close();}
},{isolated:true});
