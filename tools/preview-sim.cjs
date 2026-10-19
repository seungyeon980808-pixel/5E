#!/usr/bin/env node
// 공개 1.7.0 프리뷰(/preview/) 흉내 서버와 ExamPool 확인 검사.
// - 소스 전체를 /preview/ 아래에서 제공하고, index.html만 배포 스크립트(main의 scripts/preview-publication.cjs stamp)와 같은 규칙으로 주소를 바꾼다.
// - /preview/ 밖 요청(공개 사이트라면 정식 1.6.3 파일을 부르게 될 요청)과 /api/ 요청은 정적 사이트처럼 404로 막고 '새는 주소'로 기록한다.
//   node tools/preview-sim.cjs [--port 8904]            서버만(Safari 등으로 http://127.0.0.1:8904/preview/?mode=pro&mobile=0)
//   node tools/preview-sim.cjs --check [--out 폴더]      서버 + ExamPool 열기·기출 「변형」까지 자동 확인(빈 브라우저, 사용자 데이터 없음)
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf('--'+k);return i>=0?args[i+1]:null;};
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.wasm':'application/wasm','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
const leaks=[];
function stampIndex(html){
  // 배포와 같은 규칙: 루트 기준 src/href를 /preview/ 아래로
  return html.replace(/\b(src|href)="\/(js|css|assets|fonts|vendor|experiments)\//g,'$1="/preview/$2/');
}
function serve(port){
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://x');let p=decodeURIComponent(url.pathname);
    if(!p.startsWith('/preview/')){if(p!=='/favicon.ico')leaks.push(`${req.method} ${p}`);res.writeHead(404,{'content-type':'text/plain'});return res.end('정식 사이트 경로(프리뷰 밖): '+p);}
    p=p.slice('/preview'.length);if(p.endsWith('/'))p+='index.html';
    const file=path.resolve(ROOT,'.'+p);if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('없음');}
    let body=fs.readFileSync(file);if(file===path.join(ROOT,'index.html'))body=Buffer.from(stampIndex(body.toString('utf8')));
    res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
  });
  return new Promise(ok=>server.listen(port,'127.0.0.1',()=>ok(server)));
}
async function check(origin,out){
  const {chromium}=require(require.resolve('playwright',{paths:[ROOT]}));
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});const report={leaks:[],errors:[],steps:[]};
  try{
    const ctx=await browser.newContext({viewport:{width:1600,height:1000}});const page=await ctx.newPage();
    page.on('pageerror',e=>report.errors.push(e.message.slice(0,200)));
    const step=s=>{report.steps.push(s);console.log('·',s);};
    await page.goto(origin+'/preview/?mode=pro&mobile=0',{waitUntil:'load'});await page.waitForTimeout(3500);
    step('첫 화면 열림: '+await page.title());
    await page.evaluate(()=>{for(const b of document.querySelectorAll('button'))if(/건너뛰기/.test(b.textContent))b.click();});
    await page.click('#exam-pool-open');const fh=await page.waitForSelector('#exampool-sheet-workspace iframe',{timeout:20000});const sheet=await fh.contentFrame();
    await sheet.waitForSelector('#side-new',{timeout:30000});await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:30000});
    step('ExamPool 열림: '+await sheet.evaluate(()=>document.querySelector('#status').textContent));
    await sheet.click('#side-new');await sheet.click('#new-dialog .nq-opt[data-step="form"][data-k="combo"]');await sheet.click('#new-dialog .nq-opt[data-step="struct"][data-k="big"]');await sheet.click('#new-dialog [data-nq="go"]');
    await sheet.waitForSelector('#card-view:not([hidden]) .cv-writer');step('새 문항 카드');
    await sheet.click('#card-view [data-cvtab="past"]');await sheet.waitForSelector('[data-cvconvert]',{timeout:30000});
    step('기출 목록: '+await sheet.evaluate(()=>document.querySelector('.lp-count')?.textContent));
    await sheet.fill('[data-cvpast="query"]','화학 결합 모형');await sheet.waitForTimeout(1200);
    const id=await sheet.evaluate(()=>document.querySelector('[data-cvconvert="c1_2024_06_02"]')?.dataset.cvconvert||document.querySelector('[data-cvconvert]')?.dataset.cvconvert);
    await sheet.click(`[data-cvconvert="${id}"]`);
    await sheet.waitForFunction(()=>/가져왔습니다|실패/.test(document.querySelector('#status').textContent),null,{timeout:120000}).catch(()=>{});
    step('변형('+id+'): '+await sheet.evaluate(()=>document.querySelector('#status').textContent));
    await sheet.waitForFunction(()=>{const p=document.querySelector('#preview-dialog');return p&&!p.hidden&&p.getAttribute('aria-busy')!=='true'&&document.querySelector('#native-editor')?.dataset.ready==='true';},null,{timeout:90000}).catch(()=>{});
    step('한글 조판: '+await sheet.evaluate(()=>document.querySelector('#typeset-title')?.textContent+' · '+(document.querySelector('#typeset-status')?.textContent||'')));
    await page.screenshot({path:path.join(out,'preview-exampool.png')});
  }catch(e){report.errors.push('검사 중단: '+String(e.message).split('\n')[0]);}
  finally{await browser.close();}
  report.leaks=[...new Set(leaks)];fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(`새는 주소 ${report.leaks.length}개`,report.leaks.slice(0,20));console.log(`화면 오류 ${report.errors.length}개`,report.errors.slice(0,10));
  return report;
}
(async()=>{
  const port=Number(opt('port')||(args.includes('--check')?0:8904));const server=await serve(port);const origin=`http://127.0.0.1:${server.address().port}`;
  console.log(`프리뷰 흉내: ${origin}/preview/?mode=pro&mobile=0`);
  if(args.includes('--check')){const r=await check(origin,path.resolve(ROOT,opt('out')||'_work/preview-sim'));server.close();process.exitCode=r.leaks.length||r.errors.length?1:0;}
})();
