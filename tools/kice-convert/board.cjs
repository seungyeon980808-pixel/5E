#!/usr/bin/env node
// 원본 기출 카드와 ExamPool 한글 조판 결과를 나란히 보는 비교판(HTML). 무작위(시드 고정) N문항 + 과목별 합격률.
//   node tools/kice-convert/board.cjs <결과 폴더> <출력 폴더> [--n 50] [--cards <원본 카드 webp 폴더>]
'use strict';
const fs=require('fs'),path=require('path');
const [dirArg,outArg]=process.argv.slice(2);const opt=k=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:null;};
const dir=path.resolve(dirArg),out=path.resolve(outArg),N=Number(opt('n')||50);
const CARDS=opt('cards')||'/private/tmp/claude-501/-Users-parkseungyeon-Desktop-project/1b923002-37e2-4bf3-88d0-68db71d74b84/scratchpad/exam-search/cards';
const rows=fs.readFileSync(path.join(dir,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
let seed=20261019;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const pick=[...rows].sort(()=>rnd()-.5).slice(0,N).sort((a,b)=>a.id.localeCompare(b.id));
fs.mkdirSync(path.join(out,'img'),{recursive:true});
for(const r of pick){const c=path.join(CARDS,r.id+'.webp');if(fs.existsSync(c))fs.copyFileSync(c,path.join(out,'img',r.id+'-orig.webp'));const s=path.join(dir,'shots',r.id+'.png');if(fs.existsSync(s))fs.copyFileSync(s,path.join(out,'img',r.id+'-hwp.png'));}
const E=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SUB={p1:'물리학Ⅰ',p2:'물리학Ⅱ',c1:'화학Ⅰ',c2:'화학Ⅱ',b1:'생명과학Ⅰ',b2:'생명과학Ⅱ',e1:'지구과학Ⅰ',e2:'지구과학Ⅱ'};
const ok=rows.filter(r=>r.pass).length,by={};for(const r of rows){(by[r.subject]??=[0,0])[1]++;if(r.pass)by[r.subject][0]++;}
const pct=(a,b)=>(a/b*100).toFixed(1)+'%';
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>기출 복원 비교판</title>
<style>:root{--bg:#0a0e14;--panel:#0d1117;--raise:#161b22;--line:#21262d;--ink:#e6edf3;--ink2:#c9d1d9;--ink3:#8b949e;--ok:#3fb950;--bad:#f85149;--go:#6ba4f8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.6 -apple-system,"Apple SD Gothic Neo",system-ui,sans-serif}
header{max-width:1280px;margin:0 auto;padding:24px 20px 8px}h1{margin:0 0 4px;font-size:20px}header p{margin:0;color:var(--ink3)}
.sum{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.sum span{background:var(--raise);border-radius:6px;padding:4px 10px;color:var(--ink2)}.sum b{color:var(--ink)}
main{max-width:1280px;margin:0 auto;padding:0 20px 60px;display:flex;flex-direction:column;gap:18px}
.q{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}.q h2{margin:0 0 8px;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tag{font-size:11px;padding:1px 8px;border-radius:10px;font-weight:600}.tag.ok{background:rgba(63,185,80,.15);color:var(--ok)}.tag.bad{background:rgba(248,81,73,.15);color:var(--bad)}
.meta{color:var(--ink3);font-size:12px;font-weight:400}.why{color:#ffa198;font-size:12px;margin:0 0 8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair div{background:#fff;border-radius:6px;padding:8px;display:flex;align-items:flex-start;justify-content:center;min-height:120px}.pair img{max-width:100%;height:auto}
.lab{color:var(--ink3);font-size:11px;margin:0 0 4px}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style></head><body>
<header><h1>기출 복원 비교판 — 원본 / ExamPool 한글 조판(AI 없음)</h1><p>${E(path.basename(dir))} · 전체 ${rows.length}문항 중 합격 <b>${ok}</b> (${pct(ok,rows.length)}) · 아래는 무작위 ${pick.length}문항(시드 고정)</p>
<div class="sum">${Object.entries(by).map(([k,[a,b]])=>`<span>${SUB[k]||k} <b>${pct(a,b)}</b> (${a}/${b})</span>`).join('')}</div></header>
<main>${pick.map(r=>`<section class="q"><h2>${E(r.title||r.id)} <span class="tag ${r.pass?'ok':'bad'}">${r.pass?'합격':'불합격'}</span><span class="meta">${E(r.id)} · ${E(r.form)}/${E(r.struct)} · 글 일치 ${r.textSim??'-'} · 높이 비율 ${r.heightRatio??'-'}</span></h2>
${r.pass?'':`<p class="why">${E(r.reasons.join(' / '))}</p>`}<div class="pair"><figure style="margin:0"><p class="lab">원본(평가원 PDF)</p><div><img loading="lazy" src="img/${r.id}-orig.webp" alt=""></div></figure><figure style="margin:0"><p class="lab">ExamPool 한글 조판</p><div><img loading="lazy" src="img/${r.id}-hwp.png" alt=""></div></figure></div></section>`).join('')}</main></body></html>`;
fs.writeFileSync(path.join(out,'index.html'),html);console.log('board',path.join(out,'index.html'),pick.length);
