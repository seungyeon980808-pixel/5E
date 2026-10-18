#!/usr/bin/env node
// 기출 그림 찾기 검사(AI 없음): 조사 기록(corpus.json의 struct)과 찾은 그림 수가 맞는 비율을 잰다.
// 하네스 run.cjs의 convertBatch처럼 시험 서버 + 빈 페이지 + setPdfSource로 원본 PDF를 넘긴다. 원본은 읽기만 한다.
//
//   node tools/kice-convert/figures-check.cjs [--ids a,b] [--subject p1] [--struct two] [--sample N] [--limit N]
//        [--workers 4] [--baseline] [--png] [--out _work/kice/figures-<이름>]
//   --baseline : 지금 엔진의 그림 찾기(es/figure-fallback.mjs questionFigures)로 잰다(그림 렌더 없음).
//   --png      : 자른 그림을 <out>/png/<id>-<n>.png 로 저장해 눈으로 확인.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {chromium}=require(require.resolve('playwright',{paths:[ROOT]}));
const h=require(path.join(ROOT,'tests/helpers/rhwp-exam.cjs'));
const args=Object.fromEntries(process.argv.slice(2).map((a,i,all)=>a.startsWith('--')?[a.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]:null).filter(Boolean));
const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus.json'),'utf8'));
let items=corpus;
if(args.ids)items=items.filter(i=>String(args.ids).split(',').includes(i.id));
if(args.subject)items=items.filter(i=>String(args.subject).split(',').includes(i.subject));
if(args.struct)items=items.filter(i=>String(args.struct).split(',').includes(i.struct));
if(args.sample){const n=Number(args.sample),step=items.length/n;items=Array.from({length:Math.min(n,items.length)},(_,k)=>items[Math.floor(k*step)]);}
if(args.limit)items=items.slice(0,Number(args.limit));
const WORKERS=Math.max(1,Number(args.workers||4)),BASE=!!args.baseline,PNG=!!args.png;
const OUT=path.resolve(ROOT,args.out||`_work/kice/figures-${BASE?'base':'new'}-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`);
fs.mkdirSync(path.join(OUT,'png'),{recursive:true});
const pdfPath=new Map(corpus.map(i=>[i.pdfFile,path.join(PDF_ROOT,i.publicPath)]));

// 조사 기록이 말하는 그림 수. condition/experiment(상자 안 그림 수 가변)은 null.
const EXPECT={none:[0,0],one:[1,1],table:[1,1],two:[2,2],three:[3,Infinity],complex:[3,Infinity]};
const expected=s=>EXPECT[s]||null;

async function batchRun(browser,origin,batch){
  const ctx=await browser.newContext();
  await ctx.route('**/__kice_blank',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8><title>kice</title>'}));
  await ctx.route('**/__kice_pdf/**',r=>{const name=decodeURIComponent(new URL(r.request().url()).pathname.split('/__kice_pdf/')[1]);const f=pdfPath.get(name);if(!f||!fs.existsSync(f))return r.fulfill({status:404,body:'no pdf'});return r.fulfill({status:200,contentType:'application/pdf',body:fs.readFileSync(f)});});
  const page=await ctx.newPage();
  await page.goto(origin+'/__kice_blank');
  await page.evaluate(async base=>{
    const v='?v='+Date.now();
    const viewer=await import('/assets/exampool/convert/es/pdf-viewer.mjs?v=library-release-20261011-3');
    viewer.setPdfSource(name=>fetch('/__kice_pdf/'+encodeURIComponent(name)).then(r=>{if(!r.ok)throw Error('PDF 없음 '+name);return r.arrayBuffer();}));
    if(base){const fb=await import('/assets/exampool/convert/es/figure-fallback.mjs?v=library-release-20261011-3');
      window.__detect=async item=>(fb.questionFigures(item,await viewer.readQuestionPdf(item))).map(f=>({box:f.box,page:f.page,kind:f.kind,caption:null}));}
    else{const m=await import('/assets/exampool/convert/figures.js'+v);window.__detect=item=>m.detectFigures(item);}
  },BASE);
  const out=[];
  for(const item of batch){
    const t0=Date.now();
    const r=await Promise.race([page.evaluate(async item=>{try{return {ok:true,figures:await window.__detect(item)};}catch(e){return {ok:false,error:String(e?.message||e)};}},item),
      new Promise(ok=>setTimeout(()=>ok({ok:false,error:'시간 초과(60초)'}),60000))]);
    r.ms=Date.now()-t0;out.push({item,r});
  }
  await ctx.close();return out;
}

h.withServer(async origin=>{
  console.log(`figures-check: ${items.length}문항 · ${BASE?'기존(questionFigures)':'새 detectFigures'} · 결과 ${path.relative(ROOT,OUT)}`);
  const browser=await chromium.launch({headless:true});
  const rows=[];const queue=[...items];
  try{
    await Promise.all(Array.from({length:WORKERS},async()=>{
      while(queue.length){
        const batch=queue.splice(0,16);
        let res;try{res=await batchRun(browser,origin,batch);}catch(e){res=batch.map(item=>({item,r:{ok:false,error:'작업 실패: '+e.message}}));}
        for(const {item,r} of res){
          const figs=r.ok?r.figures:[];
          if(PNG)figs.forEach((f,k)=>{if(f.data)fs.writeFileSync(path.join(OUT,'png',`${item.id}-${k+1}.png`),Buffer.from(f.data.split(',')[1],'base64'));});
          const exp=expected(item.struct),n=figs.length;
          const row={id:item.id,subject:item.subject,struct:item.struct,ok:r.ok,error:r.error,n,ms:r.ms,
            match:exp?(n>=exp[0]&&n<=exp[1]):null,
            figures:figs.map(f=>({box:f.box?.map(v=>Math.round(v*10)/10),page:f.page,caption:f.caption,kind:f.kind,widthPt:f.widthPt}))};
          rows.push(row);
        }
        process.stdout.write(`\r  ${rows.length}/${items.length}`);
      }
    }));
  }finally{await browser.close();}
  console.log('');
  rows.sort((a,b)=>a.id<b.id?-1:1);
  fs.writeFileSync(path.join(OUT,'results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const strict=rows.filter(r=>r.match!==null),hit=strict.filter(r=>r.match).length;
  const lines=[`# 그림 수 일치 (${BASE?'기존':'새'})`,'',`- 문항 ${rows.length} · 오류 ${rows.filter(r=>!r.ok).length}`,
    `- 엄격 비교(none/one/table/two/three/complex) ${hit}/${strict.length} = ${(100*hit/Math.max(1,strict.length)).toFixed(1)}%`,'','| struct | 일치 | 분포(찾은 수:문항) |','|---|---|---|'];
  for(const s of [...new Set(rows.map(r=>r.struct))].sort()){
    const g=rows.filter(r=>r.struct===s),dist={};for(const r of g)dist[r.n]=(dist[r.n]||0)+1;
    const m=g.filter(r=>r.match).length;
    lines.push(`| ${s} | ${expected(s)?`${m}/${g.length} (${(100*m/g.length).toFixed(0)}%)`:'가변'} | ${Object.entries(dist).map(([k,v])=>`${k}:${v}`).join(' ')} |`);
  }
  const subj={};for(const r of strict){(subj[r.subject]??=[0,0])[1]++;if(r.match)subj[r.subject][0]++;}
  lines.push('','| 과목 | 일치 |','|---|---|',...Object.entries(subj).map(([s,[a,b]])=>`| ${s} | ${a}/${b} (${(100*a/b).toFixed(0)}%) |`));
  const md=lines.join('\n')+'\n';fs.writeFileSync(path.join(OUT,'summary.md'),md);console.log(md);
});
