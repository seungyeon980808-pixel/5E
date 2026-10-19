import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {validate} from '../assets/exampool/sheet/model.js';
import {exportExcel,importExcel,project} from '../assets/exampool/sheet/excel.js';
import {buildQuestionHtml,choiceGrid} from '../assets/exampool/sheet/handoff.js';
import {snapSize,snapGap,snapRatio,parseSize,parseGap,parseChoiceLayout,splitWidths,validPlacement} from '../assets/exampool/sheet/placement.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const data=()=>structuredClone(examples);
const roundtrip=d=>exportExcel(XLSX,JSZip,d).then(bytes=>importExcel(XLSX,JSZip,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));

test('drag values snap to the grid: size 5%, gap 0.5mm, integer ratio',()=>{
  assert.equal(snapSize(62.4),60);assert.equal(snapSize('63%'),65);assert.equal(snapSize(3),10);assert.equal(snapSize(140),100);
  assert.equal(snapGap(2.2),2);assert.equal(snapGap('2.3mm'),2.5);assert.equal(snapGap(-4),0);assert.equal(snapGap(99),20);
  assert.equal(snapRatio(2.6),3);assert.equal(snapRatio(0),1);assert.equal(snapRatio(40),12);
  assert.equal(parseSize(''),undefined);assert.equal(parseGap(' '),undefined);
  assert.equal(parseChoiceLayout('한 줄 5개'),'한 줄');assert.equal(parseChoiceLayout('3 + 2'),'3+2');assert.equal(parseChoiceLayout('자동'),undefined);
  assert.throws(()=>parseChoiceLayout('네 줄'),/선지 배열/);assert.throws(()=>snapSize('크게'),/%/);
});

test('stored placement must already sit on the grid',()=>{
  assert.ok(validPlacement({size:60,gap:2.5,ratio:3,align:'가운데'}));
  for(const bad of [{size:62},{size:5},{gap:.3},{ratio:1.5},{ratio:13},{align:'위'}])assert.equal(validPlacement(bad),false,JSON.stringify(bad));
  const d=data();d.questions[0].blocks[0].size=62;assert.throws(()=>validate(d),/크기·간격/);
  const e=data();e.questions[0].choiceLayout='네 줄';assert.throws(()=>validate(e),/선지 배열/);
});

test('placement, ratios and choice layout survive an Excel roundtrip; files without the new columns still open',async()=>{
  const d=data(),q=d.questions[0],group=q.blocks.find(b=>b.kind==='group');
  const kids=q.blocks.filter(b=>b.parent===group.id);kids[0].ratio=3;kids[1].ratio=2;kids[1].size=70;kids[1].gap=2;kids[1].align='가운데';q.choiceLayout='3+2';
  const got=await roundtrip(d);assert.deepEqual(got.questions,d.questions);
  // Clearing the cells in Excel returns to automatic placement.
  const {wb}=project(XLSX,d),ws=wb.Sheets['구성'],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}),head=rows[0];
  const col=name=>head.indexOf(name);
  for(let r=1;r<rows.length;r++){for(const name of ['폭 비율','크기','간격','정렬'])ws[XLSX.utils.encode_cell({r,c:col(name)})]={t:'s',v:''};if(rows[r][col('구성')]==='선지')ws[XLSX.utils.encode_cell({r,c:col('배치')})]={t:'s',v:''};}
  const cleared=await importExcel(XLSX,JSZip,XLSX.write(wb,{bookType:'xlsx',type:'array'}));
  const cq=cleared.questions[0];assert.equal(cq.choiceLayout,undefined);for(const b of cq.blocks)for(const k of ['ratio','size','gap','align'])assert.equal(b[k],undefined);
  // A file written before the columns existed (no 폭 비율·크기·간격·정렬 headers) still imports.
  const legacy=project(XLSX,data()),lw=legacy.wb.Sheets['구성'],lrows=XLSX.utils.sheet_to_json(lw,{header:1,defval:''});
  const keep=lrows[0].map((h,i)=>['폭 비율','크기','간격','정렬'].includes(h)?-1:i).filter(i=>i>=0);
  legacy.wb.Sheets['구성']=XLSX.utils.aoa_to_sheet(lrows.map(r=>keep.map(i=>r[i])));
  const old=await importExcel(XLSX,JSZip,XLSX.write(legacy.wb,{bookType:'xlsx',type:'array'}));assert.equal(old.questions.length,data().questions.length);
});

test('typed Excel values are snapped and inconsistent choice layouts are rejected',async()=>{
  const d=data(),{wb}=project(XLSX,d),ws=wb.Sheets['구성'],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}),head=rows[0];
  const figureRow=rows.findIndex((r,i)=>i&&r[head.indexOf('구성')]==='그림'&&r[head.indexOf('문항 ID')]===d.questions[0].id);
  ws[XLSX.utils.encode_cell({r:figureRow,c:head.indexOf('크기')})]={t:'s',v:'63%'};
  ws[XLSX.utils.encode_cell({r:figureRow,c:head.indexOf('간격')})]={t:'s',v:'2.2mm'};
  const got=await importExcel(XLSX,JSZip,XLSX.write(wb,{bookType:'xlsx',type:'array'}));
  const fig=got.questions[0].blocks.find(b=>b.id===rows[figureRow][head.indexOf('구성 ID')]);assert.equal(fig.size,65);assert.equal(fig.gap,2);
  const choiceRows=rows.map((r,i)=>i&&r[head.indexOf('구성')]==='선지'&&r[head.indexOf('문항 ID')]===d.questions[0].id?i:0).filter(Boolean);
  ws[XLSX.utils.encode_cell({r:choiceRows[0],c:head.indexOf('배치')})]={t:'s',v:'한 줄'};ws[XLSX.utils.encode_cell({r:choiceRows[1],c:head.indexOf('배치')})]={t:'s',v:'세로'};
  await assert.rejects(importExcel(XLSX,JSZip,XLSX.write(wb,{bookType:'xlsx',type:'array'})),/선지 배열은 하나로/);
});

test('generated HWP uses ratios, sizes, alignment and the chosen choice columns',async()=>{
  assert.deepEqual(splitWidths([{ratio:3},{ratio:2}],500),[300,200]);assert.deepEqual(splitWidths([{},{}],400),[200,200]);
  assert.equal(choiceGrid([1,2,3,4,5].map(()=>({text:'가'})),400,11,'3+2').cols,3);
  assert.equal(choiceGrid([1,2,3,4,5].map(()=>({text:'가'})),400,11,'세로').cols,1);
  const d=data(),q=d.questions[0],group=q.blocks.find(b=>b.kind==='group');
  group.layout='나란히';const kids=q.blocks.filter(b=>b.parent===group.id);kids.forEach((k,i)=>k.ratio=i?1:3);q.choiceLayout='세로';
  const before=await buildQuestionHtml(data().questions[0]),after=await buildQuestionHtml(q);
  assert.notEqual(before.html,after.html);
  const widths=[...after.html.matchAll(/vertical-align:(?:top|middle);width:([\d.]+)px">/g)].map(m=>Number(m[1]));
  assert.ok(widths.length>=2&&Math.abs(widths[0]/widths[1]-3)<.01,`ratio widths ${widths}`);
  // Vertical choices: one choice per row.
  assert.equal(after.tables.at(-1).cols,1);assert.equal(after.tables.at(-1).rows,5);
  // An untouched question renders exactly as before the feature existed.
  const again=await buildQuestionHtml(data().questions[0]);assert.equal(again.html,before.html);
});

test('a boxed side-by-side group is one native table, so the result table inside keeps its merges',async()=>{
  const q=data().questions[0],group=q.blocks.find(b=>b.kind==='group');group.layout='나란히';group.boxed=true;
  const n=q.blocks.filter(b=>b.parent===group.id).length,plan=await buildQuestionHtml(q);
  assert.ok(plan.tables.some(t=>t.rows===2&&t.cols===n&&t.merges.includes(`0:0:1:${n}`)),JSON.stringify(plan.tables));
  assert.ok(!plan.tables.some(t=>t.rows===1&&t.cols===n),'no extra nested side table');
  const inner=q.blocks.find(b=>b.parent===group.id&&b.kind==='table');
  if(inner?.table.merges.length)assert.ok(plan.tables.some(t=>t.merges.length===inner.table.merges.length&&t.rows===inner.table.rows));
});

test('empty cells get an invisible word joiner only inside side-by-side cells, never a character reference',async()=>{
  const q=structuredClone(data().questions[0]),group=q.blocks.find(b=>b.kind==='group'),table=q.blocks.find(b=>b.kind==='table'&&b.parent===group.id);
  for(const row of table.table.cells)for(const c of row){c.value='';delete c.figure;}
  const plain=await buildQuestionHtml(q);assert.ok(!plain.html.includes('⁠'),'ordinary empty cells stay empty');
  group.layout='나란히';group.boxed=true;
  const side=await buildQuestionHtml(q);assert.ok(side.html.includes('⁠'));assert.ok(!/&#\d+;/.test(side.html),'the engine prints character references literally');
});
