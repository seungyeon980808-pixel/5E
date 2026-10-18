// 기출 복원 채점(AI 없음). 문항 하나가 다섯 검사를 모두 통과해야 합격.
// ① 칸 나누기  ② 글 일치  ③ 수식  ④ 틀  ⑤ 조판(경고 없음 + 높이 비율)
'use strict';
const TEXT_MIN=0.97,HEIGHT_RANGE=[0.85,1.2];
const EQ=/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;
// 한글 엔진은 완성형 밖 글자를 &#9702; 같은 문자 참조로 꺼낸다(handoff.js decodeNativeText와 같은 규칙으로 되돌림).
const decodeRefs=s=>String(s||'').replace(/&(?:amp;)?#(\d+);/g,(m,n)=>Number(n)>=128?String.fromCodePoint(Number(n)):m);
const norm=s=>decodeRefs(s).replace(/[〔［]/g,'[').replace(/[〕］]/g,']').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[～∼]/g,'~').replace(/\s+/g,'')
  .replace(/^\d{1,2}\./,'').replace(/\[3점\]/g,'').replace(/\((카드|엑셀)에서입력\)/g,'').replace(/[​⁠]/g,'');
// 2·LCS/(a+b): 순서까지 맞아야 높다.
function similarity(a,b){if(!a.length&&!b.length)return 1;if(!a.length||!b.length)return 0;
  const n=a.length,m=b.length;let prev=new Uint16Array(m+1),cur=new Uint16Array(m+1);
  for(let i=1;i<=n;i++){const ai=a.charCodeAt(i-1);for(let j=1;j<=m;j++)cur[j]=ai===b.charCodeAt(j-1)?prev[j-1]+1:(prev[j]>cur[j-1]?prev[j]:cur[j-1]);[prev,cur]=[cur,prev];cur.fill(0);}
  return 2*prev[m]/(n+m);}
function equationsIn(q){let n=0;const add=s=>{n+=(String(s||'').match(EQ)||[]).length;};add(q.ask);for(const b of q.blocks||[]){add(b.text);for(const l of b.lines||[])add(l.text);if(b.table)for(const r of b.table.cells)for(const c of r)add(c.value);}
  for(const c of q.choices||[])add(c.text);if(q.form==='pair'||q.style==='대응표')for(const r of q.choiceTable?.cells||[])for(const c of r)add(c.value);return n;}
function score(item,ref,conv,ts,{convertOnly=false}={}){
  const row={id:item.id,subject:item.subject,form:item.form,struct:item.struct,layout:item.layout,title:item.title,checks:{},reasons:[]};
  const fail=(k,why)=>{row.checks[k]=false;row.reasons.push(`${k}: ${why}`);};const pass=k=>{if(row.checks[k]!==false)row.checks[k]=true;};
  if(!conv?.ok){fail('convert',conv?.error||'변환 실패');row.pass=false;row.ms=conv?.ms;return row;}
  const q=conv.question,d=conv.diag||{},c=d.counts||{};row.ms=conv.ms;row.decisions=d.decisions;row.notes=(d.notes||[]).slice(0,6);
  // ① 칸 나누기
  if(!q.ask.trim())fail('structure','발문 없음');
  if(c.choices!==5)fail('structure',`선지 ${c.choices}개`);
  if(item.form==='combo'&&!(c.bogi>=2))fail('structure',`보기 ${c.bogi}줄`);
  if(ref&&!!c.three!==!!ref.three)fail('structure',`[3점] ${c.three?'있음':'없음'}(원본 ${ref.three?'있음':'없음'})`);
  pass('structure');
  // ④ 틀
  if(d.decisions?.form&&d.decisions.form!==item.form)fail('template',`유형 ${d.decisions.form}(기록 ${item.form})`);
  // 조건·실험 상자는 상자 자체가 자료라 그림이 없어도 된다. 표도 자료로 센다(엔진 counts.figures에 표 포함).
  const need=item.struct==='none'?0:['condition','experiment'].includes(item.struct)?-1:item.struct==='two'?2:['three','complex'].includes(item.struct)?2:1;
  if(need===0&&c.figures>0)fail('template',`그림 ${c.figures}개(기록: 자료 없음)`);
  else if(need>0&&!(c.figures>=need))fail('template',`그림 ${c.figures}개(기록 자료 구조 ${item.struct})`);
  pass('template');
  if(convertOnly){row.pass=Object.values(row.checks).every(Boolean);return row;}
  if(!ts||ts.error&&!ts.status){fail('typeset',ts?.error||'조판 결과 없음');row.pass=false;return row;}
  // ② 글: 한글 조판 결과의 글 vs 원본 PDF 본문 글
  const sim=ref?similarity(norm(ts.text),norm(ref.body)):0;row.textSim=Math.round(sim*1000)/1000;row.textHead=String(ts.text).slice(0,120);
  if(sim<TEXT_MIN)fail('text',`글 일치 ${(sim*100).toFixed(1)}%`);pass('text');
  // ③ 수식: 문항의 $…$ 수 = 한글 문서의 수식 개체 수
  const want=equationsIn(q);row.eq={want,got:ts.eq};
  if(ts.eq<0||ts.eq!==want)fail('equation',`수식 ${ts.eq}/${want}`);pass('equation');
  // ⑤ 조판: 경고 없음 + 원본 대비 높이
  const st=String(ts.status||'');
  if(ts.error||/넘습니다|겹칩니다|읽지 못|실패|오류|초과/.test(st))fail('typeset',st.slice(0,80));
  if(ref?.heightMm&&ts.usedMm){const r=ts.usedMm/ref.heightMm;row.heightRatio=Math.round(r*100)/100;if(r<HEIGHT_RANGE[0]||r>HEIGHT_RANGE[1])fail('typeset',`높이 ${ts.usedMm}mm / 원본 ${ref.heightMm}mm`);}
  else fail('typeset','높이 측정 안 됨');
  pass('typeset');
  row.pass=Object.values(row.checks).every(Boolean);return row;
}
function summarize(rows){
  const pct=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'-';const n=rows.length,ok=rows.filter(r=>r.pass).length;
  const lines=[`# 기출 복원 채점 결과`,'',`**합격 ${ok}/${n} (${pct(ok,n)})**`,'','| 검사 | 통과 |','|---|---|'];
  for(const k of ['convert','structure','text','equation','template','typeset']){const has=rows.filter(r=>k in r.checks);if(!has.length)continue;const p=has.filter(r=>r.checks[k]).length;lines.push(`| ${k} | ${p}/${has.length} (${pct(p,has.length)}) |`);}
  const group=(key,label)=>{const m=new Map();for(const r of rows){const g=r[key];if(!m.has(g))m.set(g,[0,0]);const v=m.get(g);v[1]++;if(r.pass)v[0]++;}
    lines.push('',`| ${label} | 합격 |`,'|---|---|',...[...m].sort((a,b)=>b[1][1]-a[1][1]).map(([g,[a,b]])=>`| ${g} | ${a}/${b} (${pct(a,b)}) |`));};
  group('subject','과목');group('form','유형');group('struct','자료 구조');
  const reasons=new Map();for(const r of rows)for(const x of r.reasons){const k=x.replace(/\d+(\.\d+)?/g,'#').replace(/\(.*?\)/g,'').slice(0,60);reasons.set(k,(reasons.get(k)||0)+1);}
  lines.push('','## 실패 원인(많은 순)','','| 원인 | 문항 수 |','|---|---|',...[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>`| ${k} | ${v} |`));
  return lines.join('\n')+'\n';
}
module.exports={score,summarize,similarity,norm};
