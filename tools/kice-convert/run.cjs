#!/usr/bin/env node
// 기출 → ExamPool 한글 조판 채점 하네스(AI 없음).
// 1) 엔진(assets/exampool/convert/kice-engine.js)으로 문항 변환 → 2) ExamPool에 불러오기 → 3) 한글 조판 → 4) 자동 채점·캡처.
// 사용자 데이터·8897 서버는 건드리지 않는다: 시험 서버를 따로 띄우고 빈 브라우저 맥락에서만 돈다. 원본 PDF는 읽기만 한다.
//
//   node tools/kice-convert/run.cjs [--ids a,b] [--subject p1] [--form combo] [--struct small] [--limit N] [--sample N]
//        [--workers 4] [--out _work/kice/<이름>] [--paper B4] [--no-shots] [--convert-only]
//   KICE_PDF_ROOT=<공유 폴더> (기본: 구글 드라이브 5E_공유폴더테스트_0916)
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {chromium}=require(require.resolve('playwright',{paths:[ROOT]}));
const h=require(path.join(ROOT,'tests/helpers/rhwp-exam.cjs'));
const {score,summarize}=require('./score.cjs');
const args=Object.fromEntries(process.argv.slice(2).map((a,i,all)=>a.startsWith('--')?[a.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]:null).filter(Boolean));
const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus.json'),'utf8'));
const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'reference.json'),'utf8'));
let items=corpus;
if(args.ids)items=items.filter(i=>String(args.ids).split(',').includes(i.id));
if(args.subject)items=items.filter(i=>String(args.subject).split(',').includes(i.subject));
if(args.form)items=items.filter(i=>i.form===args.form);
if(args.struct)items=items.filter(i=>i.struct===args.struct);
if(args.failed){const prev=fs.readFileSync(args.failed,'utf8').trim().split('\n').map(l=>JSON.parse(l));const bad=new Set(prev.filter(r=>!r.pass).map(r=>r.id));items=items.filter(i=>bad.has(i.id));}
if(args.sample){// 과목·유형이 고루 섞이게 일정 간격으로 뽑는다
  const n=Number(args.sample),step=items.length/n;items=Array.from({length:Math.min(n,items.length)},(_,k)=>items[Math.floor(k*step)]);}
if(args.limit)items=items.slice(0,Number(args.limit));
const WORKERS=Math.max(1,Number(args.workers||4)),PAPER=args.paper===undefined?'B4':String(args.paper);
const OUT=path.resolve(ROOT,args.out||`_work/kice/${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`);
fs.mkdirSync(path.join(OUT,'shots'),{recursive:true});
const pdfPath=new Map(corpus.map(i=>[i.pdfFile,path.join(PDF_ROOT,i.publicPath)]));
const log=(...a)=>{const line=a.join(' ');console.log(line);fs.appendFileSync(path.join(OUT,'run.log'),line+'\n');};

async function convertBatch(browser,origin,batch){
  const ctx=await browser.newContext();
  await ctx.route('**/__kice_blank',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8><title>kice</title>'}));
  await ctx.route('**/__kice_pdf/**',r=>{const name=decodeURIComponent(new URL(r.request().url()).pathname.split('/__kice_pdf/')[1]);const f=pdfPath.get(name);if(!f||!fs.existsSync(f))return r.fulfill({status:404,body:'no pdf'});return r.fulfill({status:200,contentType:'application/pdf',body:fs.readFileSync(f)});});
  const page=await ctx.newPage();page.on('pageerror',e=>log('  pageerror',e.message.slice(0,200)));
  await page.goto(origin+'/__kice_blank');
  await page.evaluate(async()=>{window.__kice=await import('/assets/exampool/convert/kice-engine.js?v='+Date.now());window.__kice.setPdfSource(name=>fetch('/__kice_pdf/'+encodeURIComponent(name)).then(r=>{if(!r.ok)throw Error('PDF 없음 '+name);return r.arrayBuffer();}));});
  const out=[];
  for(const [k,item] of batch.entries()){
    const t0=Date.now();
    const r=await Promise.race([page.evaluate(async({item,number})=>{try{const {question,diag}=await window.__kice.convertKice(item,{number});return {ok:true,question,diag};}catch(e){return {ok:false,error:String(e?.message||e)};}},{item,number:String(k+1)}),new Promise(ok=>setTimeout(()=>ok({ok:false,error:'변환 시간 초과(90초)'}),90000))]);
    r.ms=Date.now()-t0;r.id=item.id;out.push(r);
  }
  await ctx.close();return out;
}

const READY=n=>{const p=document.querySelector('#preview-dialog'),t=document.querySelector('#typeset-title')?.textContent||'',s=document.querySelector('#typeset-status')?.textContent||'';
  // 조판이 실패하면 제목이 이전 문항에 머문다: 오류가 뜨면 바로 끝낸다.
  if(p&&p.getAttribute('aria-busy')!=='true'&&(document.querySelector('#typeset-status')?.dataset.error==='true'||/읽지 못했습니다|실패했습니다/.test(s))&&window.__kiceOpenedAt&&Date.now()-window.__kiceOpenedAt>800)return true;
  return t.startsWith(n+'번')&&p&&!p.hidden&&p.getAttribute('aria-busy')!=='true'&&!/조판하는 중|준비 중/.test(s)&&(document.querySelector('#native-editor')?.dataset.ready==='true'||/읽지 못|실패|오류|확인하세요/.test(s));};

async function typesetBatch(browser,origin,converted,wid){
  const ok=converted.filter(c=>c.ok);if(!ok.length)return [];
  const ctx=await browser.newContext({viewport:{width:1700,height:1150}});
  if(PAPER&&PAPER!=='A4')await ctx.route(/\/assets\/exampool\/sheet\/typeset\.js/,async r=>{const res=await r.fetch();let body=await res.text();body=body.replace("saved?.profile.paper||'A4'",`saved?.profile.paper||'${PAPER}'`);await r.fulfill({response:res,body});});
  // --debug-verify: '일부 글을 읽지 못했습니다' 오류에 빠진 글을 붙인다(브라우저 안에서만 바꿈).
  if(args['debug-verify'])await ctx.route(/\/assets\/exampool\/sheet\/handoff\.js/,async r=>{const res=await r.fetch();let body=await res.text();body=body.replace("if(plan.texts.some(v=>!body.includes(normalized(v))))throw Error('한글에서 일부 글을 읽지 못했습니다. 기존 시험지는 보존했습니다.');","{const miss=plan.texts.find(v=>!body.includes(normalized(v)));if(miss!==undefined)throw Error('한글에서 일부 글을 읽지 못했습니다. 기존 시험지는 보존했습니다. [빠짐: '+JSON.stringify(normalized(miss)).slice(0,160)+' | 본문: '+JSON.stringify(body).slice(0,200)+']');}");await r.fulfill({response:res,body});});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  await h.navigate(page,origin+'/?mode=pro&mobile=0');await h.ready(page);
  // 5E_exam 열기: 예전 단추(#exam-pool-open)가 없으면 맨 위 앱 전환(exam).
  await page.evaluate(()=>{const b=document.querySelector('[data-app-switch="exam"]')||document.querySelector('#exam-pool-open');b.click();});const frameHandle=await page.waitForSelector('#exampool-sheet-workspace iframe');const sheet=await frameHandle.contentFrame();
  await sheet.waitForSelector('#side-new');await sheet.waitForFunction(()=>document.querySelector('#status').textContent!=='준비 중',null,{timeout:60000});
  const questions=ok.map((c,i)=>{const q=structuredClone(c.question);delete q.kice;q.number=String(i+1);return q;});
  const FORMAT=await sheet.evaluate(async()=>(await import('/assets/exampool/sheet/model.js')).FORMAT);
  const file=JSON.stringify({format:FORMAT,questions,documents:[]});
  await sheet.setInputFiles('#excel-file',{name:`kice-${wid}.json`,mimeType:'application/json',buffer:Buffer.from(file)});
  const imported=await sheet.waitForSelector('#import-dialog[open]',{timeout:30000}).then(()=>true).catch(()=>false);
  if(!imported){const st=await sheet.evaluate(()=>document.querySelector('#status').textContent);await ctx.close();return ok.map(c=>({id:c.id,typeset:{error:'불러오기 실패: '+st}}));}
  await sheet.evaluate(()=>{const u=document.querySelector('input[name="import-mode"][value="update"]');if(u)u.checked=true;});// 문항 ID를 그대로 유지
  await sheet.click('#apply-import');
  await sheet.waitForFunction(n=>document.querySelectorAll('[data-open-card]').length>=n,questions.length,{timeout:30000});
  const ids=await sheet.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-open-card]')].map(n=>[n.dataset.openCard,1])));
  const res=[];
  for(const [i,c] of ok.entries()){
    const qid=questions[i].id,n=String(i+1),t0=Date.now();
    try{
      await sheet.evaluate(id=>{window.__kiceOpenedAt=Date.now();document.querySelector(`[data-open-card="${id}"]`)?.click();},qid);
      await sheet.waitForFunction(READY,n,{timeout:90000});
      await sheet.waitForTimeout(350);
      const m=await sheet.evaluate(async()=>{
        const status=document.querySelector('#typeset-status').textContent,metrics=document.querySelector('#preview-dialog .typeset-info')?.textContent||'';
        const w=document.querySelector('#native-editor iframe')?.contentWindow;let text='',eq=-1,eqScripts=[];
        let doc;try{doc=w.rhwpStudio.plugins.deps.wasm.borrowDocumentHandle();const raw=doc.getTextFileText();text=raw.startsWith('"')?JSON.parse(raw):raw;}catch(e){text='ERR '+e.message;}
        try{const bytes=new Uint8Array(doc.exportHwpx()),zip=await window.JSZip.loadAsync(bytes),xml=await zip.file('Contents/section0.xml').async('string');eq=(xml.match(/<hp:equation\b/g)||[]).length;eqScripts=[...xml.matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map(x=>x[1]).slice(0,80);}catch(e){eq=-2;}
        const used=metrics.match(/문항\s*([\d.]+)/),width=metrics.match(/본문 폭\s*([\d.]+)/);
        return {status,metrics,text,eq,eqScripts,usedMm:used?Number(used[1]):null,widthMm:width?Number(width[1]):null,error:document.querySelector('#typeset-status').dataset.error==='true'};
      });
      if(!args['no-shots']){const box=await sheet.locator('.cv-hwp-layer').boundingBox(),fr=await frameHandle.boundingBox();if(box)await page.screenshot({path:path.join(OUT,'shots',`${c.id}.png`),clip:{x:fr.x+box.x,y:fr.y+box.y,width:box.width,height:box.height}});}
      fs.writeFileSync(path.join(OUT,'shots',`${c.id}.txt`),String(m.text||''));
      res.push({id:c.id,typeset:{...m,ms:Date.now()-t0}});
    }catch(e){const st=await sheet.evaluate(()=>({title:document.querySelector('#typeset-title')?.textContent,status:document.querySelector('#typeset-status')?.textContent,hidden:document.querySelector('#preview-dialog')?.hidden,busy:document.querySelector('#preview-dialog')?.getAttribute('aria-busy'),ready:document.querySelector('#native-editor')?.dataset.ready,layer:!!document.querySelector('.cv-hwp-layer:not([hidden])'),view:!document.querySelector('#card-view')?.hidden})).catch(()=>({}));res.push({id:c.id,typeset:{error:'조판 대기 실패: '+String(e.message).split('\n')[0]+' '+JSON.stringify(st)}});}
  }
  if(errors.length)log(`  [w${wid}] pageerror ${errors.length}: ${errors[0]}`);
  await ctx.close();return res;
}

h.withServer(async origin=>{
  log(`kice-convert: ${items.length}문항 · 작업자 ${WORKERS} · 기준 시험지 ${PAPER} · 결과 ${path.relative(ROOT,OUT)}`);
  const browser=await chromium.launch({headless:true});
  const results=path.join(OUT,'results.jsonl');fs.writeFileSync(results,'');
  const queue=[...items];let done=0;const CHUNK=Number(args.chunk||24);
  try{
    await Promise.all(Array.from({length:WORKERS},async(_,wid)=>{
      while(queue.length){
        const batch=queue.splice(0,CHUNK);
        let conv;try{conv=await convertBatch(browser,origin,batch);}catch(e){conv=batch.map(i=>({id:i.id,ok:false,error:'변환 작업 실패: '+e.message}));}
        let ts=[];if(!args['convert-only']){try{ts=await typesetBatch(browser,origin,conv,wid);}catch(e){ts=conv.filter(c=>c.ok).map(c=>({id:c.id,typeset:{error:'조판 작업 실패: '+String(e.message).split('\n')[0]}}));}}
        const tmap=new Map(ts.map(t=>[t.id,t.typeset]));
        for(const c of conv){const item=batch.find(i=>i.id===c.id);const row=score(item,reference[c.id],c,tmap.get(c.id),{convertOnly:!!args['convert-only']});
          if(c.ok)fs.writeFileSync(path.join(OUT,'shots',`${c.id}.json`),JSON.stringify({question:c.question,diag:c.diag}));
          fs.appendFileSync(results,JSON.stringify(row)+'\n');done++;}
        log(`  [w${wid}] ${done}/${items.length}`);
      }
    }));
  }finally{await browser.close();}
  const rows=fs.readFileSync(results,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
  const md=summarize(rows);fs.writeFileSync(path.join(OUT,'summary.md'),md);log(md);
});
