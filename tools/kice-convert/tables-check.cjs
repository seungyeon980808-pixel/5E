#!/usr/bin/env node
// 기출 표 복원 검사(AI 없음): detectFigures가 role:'table'로 찾은 괘선 표마다 detectTables가 편집 가능한 표로 읽었는지(복원율),
// 읽었다면 칸 글이 원본 PDF 글과 얼마나 같은지(글자 F1: 한글·숫자·영문, 순서 무시)를 잰다. 원본은 읽기만 한다.
//
//   node tools/kice-convert/tables-check.cjs [--ids a,b] [--struct table] [--sample N] [--workers 4] [--out _work/kice/tables-<이름>]
//   기본 대상: struct가 table·complex·experiment·condition인 문항(표가 들어갈 수 있는 문항).
'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {chromium}=require(require.resolve('playwright',{paths:[ROOT]}));
const h=require(path.join(ROOT,'tests/helpers/rhwp-exam.cjs'));
const args=Object.fromEntries(process.argv.slice(2).map((a,i,all)=>a.startsWith('--')?[a.slice(2),all[i+1]&&!all[i+1].startsWith('--')?all[i+1]:true]:null).filter(Boolean));
const PDF_ROOT=process.env.KICE_PDF_ROOT||'/Users/parkseungyeon/Library/CloudStorage/GoogleDrive-park49174332@gmail.com/내 드라이브/1. 개인작업/5E_공유폴더테스트_0916';
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus.json'),'utf8'));
let items=corpus.filter(i=>['table','complex','experiment','condition'].includes(i.struct));
if(args.ids)items=corpus.filter(i=>String(args.ids).split(',').includes(i.id));
if(args.struct)items=corpus.filter(i=>String(args.struct).split(',').includes(i.struct));
if(args.sample){const n=Number(args.sample),step=items.length/n;items=Array.from({length:Math.min(n,items.length)},(_,k)=>items[Math.floor(k*step)]);}
const WORKERS=Math.max(1,Number(args.workers||4));
const OUT=path.resolve(ROOT,args.out||`_work/kice/tables-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`);
fs.mkdirSync(OUT,{recursive:true});
const pdfPath=new Map(corpus.map(i=>[i.pdfFile,path.join(PDF_ROOT,i.publicPath)]));

async function batchRun(browser,origin,batch){
  const ctx=await browser.newContext();
  await ctx.route('**/__kice_blank',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8><title>kice</title>'}));
  await ctx.route('**/__kice_pdf/**',r=>{const name=decodeURIComponent(new URL(r.request().url()).pathname.split('/__kice_pdf/')[1]);const f=pdfPath.get(name);if(!f||!fs.existsSync(f))return r.fulfill({status:404,body:'no pdf'});return r.fulfill({status:200,contentType:'application/pdf',body:fs.readFileSync(f)});});
  const page=await ctx.newPage();
  await page.goto(origin+'/__kice_blank');
  await page.evaluate(async()=>{
    const viewer=await import('/assets/exampool/convert/es/pdf-viewer.mjs?v=library-release-20261011-3');
    viewer.setPdfSource(name=>fetch('/__kice_pdf/'+encodeURIComponent(name)).then(r=>{if(!r.ok)throw Error('PDF 없음 '+name);return r.arrayBuffer();}));
    const dr=await import('/assets/exampool/convert/es/pdf-drawings.mjs?v=readability-20261004-4');
    const m=await import('/assets/exampool/convert/figures.js?v='+Date.now());
    window.__run=async item=>{
      const figs=(await m.detectFigures(item)).filter(f=>f.role==='table').map(f=>f.box);
      const tables=(await m.detectTables(item)).filter(t=>t.confidence>=.5);
      const pdf=await viewer.readQuestionPdf(item);
      // 원본 글: 표 영역 안 글자(가운데가 안에 든 글 조각).
      const eq=t=>/^(?:HyhwpEQ|HYhwpEQ)/u.test(pdf.fonts[t.fontName]?.name?.split('+').at(-1)||'');
      // 수식 글꼴 글자는 PUA로 찍혀 원본 글로 쓸 수 없다: 글은 수식 밖 글자만, 수식은 글자 수만 비교한다.
      const inside=(t,b)=>{const x=dr.textItemBox(t,pdf.pageHeight).box;const cx=(x[0]+x[2])/2,cy=(x[1]+x[3])/2;return cx>=b[0]&&cx<=b[2]&&cy>=b[1]&&cy<=b[3];};
      const truth=b=>({text:pdf.content.items.filter(t=>t.str&&t.transform&&!eq(t)&&inside(t,b)).map(t=>t.str).join(' '),
        eq:(pdf.equationItems||[]).filter(t=>inside(t,b)).reduce((n,t)=>n+t.str.replace(/\s/gu,'').length,0)});
      return {figs,tables:tables.map(t=>({...t,truth:truth(t.box)})),truthOf:figs.map(truth)};
    };
  });
  const out=[];
  for(const item of batch){
    const r=await Promise.race([page.evaluate(async item=>{try{return {ok:true,...await window.__run(item)};}catch(e){return {ok:false,error:String(e?.stack||e).slice(0,300)};}},item),
      new Promise(ok=>setTimeout(()=>ok({ok:false,error:'시간 초과(90초)'}),90000))]);
    out.push({item,r});
  }
  await ctx.close();return out;
}

// 수식 속 \text{…}는 본문 글꼴로 찍힌 글이므로 글 쪽으로 센다.
const texts=s=>(String(s).match(/\$[^$]*\$/g)||[]).flatMap(x=>[...x.matchAll(/\\text\{([^{}]*)\}/g)].map(m=>m[1])).join(' ');
const chars=s=>{const m=new Map();for(const ch of (String(s).replace(/\$[^$]*\$/g,' ')+' '+texts(s)).match(/[가-힣0-9A-Za-z]/gu)||[])m.set(ch,(m.get(ch)||0)+1);return m;};
// 수식 글자 수: 스크립트에서 명령어·괄호·첨자 기호를 빼고 남은 글자
const eqLen=s=>(String(s).match(/\$[^$]*\$/g)||[]).join('').replace(/\\text\{[^{}]*\}/g,'').replace(/\$|\\[a-zA-Z]+|\b(?:rm|it|bold|over|sqrt|LEFT|RIGHT|left|right|times|cdot)\b|[{}_^`~\s]/g,'').length;
// 표 기호(○ × 등)는 detectTables가 글자로 풀지만 원본에선 수식 글꼴이라 수식 쪽으로 센다.
const eqLen2=s=>eqLen(s)+(String(s).replace(/\$[^$]*\$/g,'').match(/[×○●◯△▲□■]/gu)||[]).length;
const eqScore=(p,t)=>!p&&!t?1:Math.min(p,t)/Math.max(p,t);
function f1(pred,truth){const p=chars(pred),t=chars(truth);let hit=0,np=0,nt=0;for(const v of p.values())np+=v;for(const v of t.values())nt+=v;for(const [k,v] of p)hit+=Math.min(v,t.get(k)||0);
  if(!np&&!nt)return 1;if(!np||!nt)return 0;const P=hit/np,R=hit/nt;return P+R?2*P*R/(P+R):0;}
// 칸 글이 원본 칸 폭을 얼마나 채우는지(글자 폭 어림: 한글 1em, 그 밖 0.55em, 분수는 분자·분모 중 긴 쪽).
const lineWidth=(line,size)=>{let t=String(line);for(let i=0;i<4;i++)t=t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,(_,a,b)=>a.length>=b.length?a:b);
  t=t.replace(/\\text\{([^{}]*)\}/g,'$1').replace(/\\[a-zA-Z]+|[$_^{}`~]/g,'');return [...t].reduce((w,c)=>w+(/[가-힣ㄱ-ㅎ㉠-㉿ⓐ-ⓩ○×△●]/u.test(c)?1:/\s/u.test(c)?.3:.55),0)*size;};
function fitOf(tb){if(!tb.colWidths)return null;let fill=0,lines=0,frac=0,longest=0;
  tb.merges=tb.merges||[];const span=(r,c)=>{const m=tb.merges.find(m=>m.r===r&&m.c===c);return m?m.cs:1;};
  tb.cells.forEach((row,r)=>row.forEach((cell,c)=>{if(!cell.text)return;const w=tb.colWidths.slice(c,c+span(r,c)).reduce((a,b)=>a+b,0);const size=cell.size||tb.fontSize||10;
    for(const l of cell.text.split('\n')){const lw=lineWidth(l,size);fill=Math.max(fill,lw/Math.max(1,w-2));longest=Math.max(longest,lw);}
    lines=Math.max(lines,cell.lines||cell.text.split('\n').length);if(/\\frac/.test(cell.text))frac++;}));
  return {fill:Math.round(fill*100)/100,lines,frac,widthPt:tb.widthPt,fontSize:tb.fontSize};}
const iou=(a,b)=>{const x0=Math.max(a[0],b[0]),y0=Math.max(a[1],b[1]),x1=Math.min(a[2],b[2]),y1=Math.min(a[3],b[3]);if(x1<=x0||y1<=y0)return 0;const i=(x1-x0)*(y1-y0),A=(a[2]-a[0])*(a[3]-a[1]),B=(b[2]-b[0])*(b[3]-b[1]);return i/(A+B-i);};

h.withServer(async origin=>{
  console.log(`tables-check: ${items.length}문항 · 결과 ${path.relative(ROOT,OUT)}`);
  const browser=await chromium.launch({headless:true});
  const rows=[];const queue=[...items];
  try{
    await Promise.all(Array.from({length:WORKERS},async()=>{
      while(queue.length){
        const batch=queue.splice(0,12);
        let res;try{res=await batchRun(browser,origin,batch);}catch(e){res=batch.map(item=>({item,r:{ok:false,error:'작업 실패: '+e.message}}));}
        for(const {item,r} of res){
          const row={id:item.id,struct:item.struct,ok:r.ok,error:r.error,figTables:r.figs?.length||0,tables:[]};
          if(r.ok){
            const used=new Set();
            r.figs.forEach((fb,k)=>{const t=r.tables.map((t,i)=>[i,iou(t.box,fb)]).filter(([i,v])=>v>.4&&!used.has(i)).sort((a,b)=>b[1]-a[1])[0];
              if(t){used.add(t[0]);const tb=r.tables[t[0]];row.tables.push({box:fb,found:true,confidence:tb.confidence,source:tb.source,rows:tb.rows,cols:tb.cols,merges:tb.merges.length,fit:fitOf(tb),f1:f1(tb.cells.flat().map(c=>c.text).join(' '),r.truthOf[k].text),eq:eqScore(eqLen2(tb.cells.flat().map(c=>c.text).join(' ')),r.truthOf[k].eq),cells:tb.cells.map(rw=>rw.map(c=>c.text))});}
              else row.tables.push({box:fb,found:false,truth:r.truthOf[k].text.slice(0,200)});});
            r.tables.forEach((tb,i)=>{if(!used.has(i))row.tables.push({box:tb.box,found:true,extra:true,confidence:tb.confidence,source:tb.source,rows:tb.rows,cols:tb.cols,f1:f1(tb.cells.flat().map(c=>c.text).join(' '),tb.truth.text),eq:eqScore(eqLen2(tb.cells.flat().map(c=>c.text).join(' ')),tb.truth.eq)});});
          }
          rows.push(row);
        }
        process.stdout.write(`\r  ${rows.length}/${items.length}`);
      }
    }));
  }finally{await browser.close();}
  console.log('');
  rows.sort((a,b)=>a.id<b.id?-1:1);
  fs.writeFileSync(path.join(OUT,'results.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const all=rows.flatMap(r=>r.tables.filter(t=>!t.extra).map(t=>({...t,struct:r.struct})));
  const found=all.filter(t=>t.found),hi=found.filter(t=>t.confidence>=.5);
  const avg=(a,k='f1')=>a.length?(a.reduce((s,t)=>s+t[k],0)/a.length):0;
  const lines=['# 표 복원 검사','',`- 문항 ${rows.length} · 오류 ${rows.filter(r=>!r.ok).length}`,
    `- 괘선 표(detectFigures role:table) ${all.length}개 중 편집 표로 읽음 ${found.length} (${(100*found.length/Math.max(1,all.length)).toFixed(1)}%), 확신 높음(≥0.5) ${hi.length} (${(100*hi.length/Math.max(1,all.length)).toFixed(1)}%)`,
    `- 칸 글 정확도(수식 밖 글자 F1 평균): 전체 ${(100*avg(found)).toFixed(1)}% · 확신 높음 ${(100*avg(hi)).toFixed(1)}% · F1≥0.95인 표 ${hi.filter(t=>t.f1>=.95).length}/${hi.length}`,
    `- 수식 글자 수 일치(평균): 확신 높음 ${(100*avg(hi,'eq')).toFixed(1)}% · 0.9 이상 ${hi.filter(t=>t.eq>=.9).length}/${hi.length}`,
    `- 표 그림이 아닌 곳에서 더 읽은 표 ${rows.reduce((s,r)=>s+r.tables.filter(t=>t.extra).length,0)}개`,'','| struct | 표 | 읽음 | 확신 높음 | F1 |','|---|---|---|---|---|'];
  for(const s of [...new Set(all.map(t=>t.struct))].sort()){const g=all.filter(t=>t.struct===s),f=g.filter(t=>t.found),hh=f.filter(t=>t.confidence>=.5);lines.push(`| ${s} | ${g.length} | ${f.length} | ${hh.length} | ${(100*avg(hh)).toFixed(1)}% |`);}
  const md=lines.join('\n')+'\n';fs.writeFileSync(path.join(OUT,'summary.md'),md);console.log(md);
});
