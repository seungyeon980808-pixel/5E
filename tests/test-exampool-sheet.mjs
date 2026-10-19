import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {FORMAT,newQuestion,block,applyPreset,validate,duplicateQuestion,mergeCells,migrate,cellValue,jsonSize} from '../assets/exampool/sheet/model.js';
import {project,exportExcel,importExcel} from '../assets/exampool/sheet/excel.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const data=()=>structuredClone(examples);
const roundtrip=d=>exportExcel(XLSX,JSZip,d).then(bytes=>importExcel(XLSX,JSZip,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
import {ROWS as SHEET_ROWS} from '../assets/exampool/sheet/vertical.js';
// 세로 시트의 첫 문항 열(B)에서 항목 칸 주소. 1행은 머리글이다.
const cellOf=key=>'B'+(SHEET_ROWS.findIndex(r=>r.key===key)+2);
test('ordered experimental hierarchy, merges, numeric zero, unknown, trailing zero and 5 graph choices roundtrip',async()=>{
 const d=data();const t=d.questions[2].blocks.find(b=>b.kind==='table').table;t.cells[1][0].figure=structuredClone(d.questions[2].choices[0].figure);t.cells[1][0].figure.editable={source:{pages:[{id:'source-1',objects:[]}]},render:{bounds:{w:10,h:12}}};
 t.cells[2][1].raw='\\alpha_{0}';t.diagonal={row:'물체',col:'구간'};
 const got=await roundtrip(d);assert.deepEqual(got.questions,d.questions);assert.deepEqual(got.documents,d.documents);
 const raw=await exportExcel(XLSX,JSZip,d),zip=await JSZip.loadAsync(raw),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');assert.match(xml,/state="frozen"/);assert.match(xml,/dataValidations count="3"/);assert.match(await zip.file('xl/workbook.xml').async('string'),/state="hidden"/);
 const count=(await zip.file('xl/drawings/drawing2.xml').async('string')).match(/<xdr:pic>/g).length;assert.equal(count,5);
});
test('Excel edits override visible cells, native table merges and graph picture bytes while literals stay strings',async()=>{
 const d=data(),{wb,pack}=project(XLSX,d);wb.Sheets['문항'][cellOf('ask')]={t:'s',v:'=literal 😀\n발문'};wb.Sheets['문항'][cellOf('points')]={t:'n',v:0};const x=pack.excel.indices[0],rg=XLSX.utils.decode_range(x.range);wb.Sheets['표'][XLSX.utils.encode_cell({r:rg.s.r+3,c:1})]={t:'s',v:'001'};
 const {enhanceZip}=await import('../assets/exampool/sheet/excel.js'),p=project(XLSX,d),zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));await enhanceZip(zip,wb.SheetNames,p.images,pack.excel.indices);const bytes=await zip.generateAsync({type:'arraybuffer'}),got=await importExcel(XLSX,JSZip,bytes);assert.equal(got.questions[0].ask,'=literal 😀\n발문');assert.equal(got.questions[0].points,0);assert.equal(got.questions[0].blocks.find(b=>b.kind==='table').table.cells[3][1].value,'001');
 wb.Sheets['문항'][cellOf('answer')]={t:'n',v:2,f:'1+1'};await assert.rejects(importExcel(XLSX,JSZip,XLSX.write(wb,{bookType:'xlsx',type:'array'})),/수식/);
});
test('disconnected block hierarchy and overlapping table merges reject before mutation',()=>{
 const d=data(),g=d.questions[0].blocks.find(b=>b.kind==='group');g.parent=g.id;assert.throws(()=>validate(d),/순환/);
 const bad=data(),t=bad.questions[0].blocks.find(b=>b.kind==='table').table;t.merges.push({r:0,c:0,rs:1,cs:1});assert.throws(()=>validate(bad),/겹칩니다/);
});
test('preset/type migration and duplicate IDs preserve content and per-block evidence',()=>{
 const q=newQuestion('001','합답형','실험');q.blocks[0].text='preserve';applyPreset(q,'그림·표');assert.equal(q.blocks[0].text,'preserve');assert.equal(q.blocks.filter(b=>b.kind==='table').length,2);
 q.references.push({target:q.blocks[0].id,label:'근거',quote:'preserve'});const n=duplicateQuestion(q);assert.notEqual(n.id,q.id);assert.equal(n.references[0].target,n.blocks[0].id);validate({format:FORMAT,questions:[q,n],documents:[]});
 const legacy={questions:[{id:'legacy',type:'합답형',number:'01',passage:'P',ask:'A',bogi:['x','y','z'],bogiVisible:true,choices:['1','2','3','4','5'],points:0,answer:0,modelAnswer:'',intent:'',explanation:'',standardCode:'',figure:null,references:[]}],documents:[]};const migrated=migrate(legacy);assert.equal(migrated.questions[0].blocks.filter(b=>b.kind==='bogi').length,1);assert.equal(migrated.questions[0].number,'01');assert.equal(migrated.questions[0].points,0);
});
test('merge refuses nonempty covered cells and literal conversion preserves distinctions',()=>{
 const q=newQuestion(),b=block('table');b.table.cells[0][1].value='must keep';assert.throws(()=>mergeCells(b.table,[0,0,0,1]),/보존/);assert.equal(b.table.cells[0][1].value,'must keep');b.table.cells[0][1].value='';mergeCells(b.table,[0,0,0,1]);assert.deepEqual(b.table.merges,[{r:0,c:0,rs:1,cs:2}]);
 assert.equal(cellValue('0'),0);assert.equal(cellValue('1.0'),'1.0');assert.equal(cellValue('001'),'001');assert.equal(cellValue('㉠'),'㉠');assert.equal(cellValue('=1+1'),'=1+1');assert.equal(cellValue(''),'');
});
test('connected textbook file and per-choice page/quote preserve through import',async()=>{
 const d=data(),doc={id:'document',name:'교과서.txt',kind:'textbooks',mime:'text/plain',data:'data:text/plain;base64,VEVTVA==',pages:['TEST']};d.documents.push(doc);d.questions[0].references.push({target:d.questions[0].choices[1].id,label:'교과서.txt 1쪽',documentId:doc.id,page:1,quote:'TEST'});const got=await roundtrip(d);assert.deepEqual(got.documents,d.documents);assert.deepEqual(got.questions[0].references,d.questions[0].references);
});
test('two tables in one experiment, per-statement evidence, and reordered Excel tabs stay connected',async()=>{
 const d=data(),q=d.questions[0],group=q.blocks.find(b=>b.kind==='group'),extra=block('table',group.id,'두 번째 결과');extra.table.cells[1][1].value='㉡';q.blocks.push(extra);const line=q.blocks.find(b=>b.kind==='bogi').lines[1];q.references.push({target:line.id,label:'보기 ㄴ 근거',quote:'연결 유지',standardCode:'[9과01-01]'});
 const duplicate=duplicateQuestion(q);assert.equal(duplicate.references.at(-1).target,duplicate.blocks.find(b=>b.kind==='bogi').lines[1].id);
 const raw=await exportExcel(XLSX,JSZip,d),zip=await JSZip.loadAsync(raw),xml=await zip.file('xl/workbook.xml').async('string'),tags=xml.match(/<sheet\b[^>]*\/>/g);zip.file('xl/workbook.xml',xml.replace(/<sheets>[\s\S]*?<\/sheets>/,`<sheets>${[tags[0],tags[3],tags[2],tags[1],tags[4]].join('')}</sheets>`));const got=await importExcel(XLSX,JSZip,await zip.generateAsync({type:'arraybuffer'}));assert.deepEqual(got.questions,d.questions);
});

// 카드 입력 성능(밤샘 점검): 키마다 도는 validate가 그림 data URL 정규식과 JSON.stringify(전체)를 매번 하지 않는다.
test('jsonSize equals JSON.stringify length without building the string', () => {
  const q=newQuestion('1');applyPreset(q,'그림');q.ask='따옴표" 줄\n바꿈 \\ 한글';q.blocks.find(b=>b.kind==='figure').figure={name:'그림.png',data:'data:image/png;base64,'+'A'.repeat(9000)};
  const cases=[{format:FORMAT,questions:[q],documents:[],exams:[]},{a:[1,undefined,null,()=>1],b:undefined,c:NaN,d:-0.25,e:1e21,f:new Date(0),g:'가'.repeat(5000),h:true}];
  for(const c of cases)assert.equal(jsonSize(c),JSON.stringify(c).length);
});
test('validate checks a figure data URL once, but still rejects a changed bad one', () => {
  const q=newQuestion('1');applyPreset(q,'그림');const f={name:'그림.png',data:'data:image/png;base64,'+'A'.repeat(2_000_000)};q.blocks.find(b=>b.kind==='figure').figure=f;
  const data={format:FORMAT,questions:[q],documents:[],exams:[]};
  let t=performance.now();validate(data);const first=performance.now()-t;
  t=performance.now();for(let i=0;i<20;i++)validate(data);const again=(performance.now()-t)/20;
  assert.ok(again<first,'a figure already checked is not re-scanned');
  f.data='data:image/png;base64,@@not-base64';assert.throws(()=>validate(data));
});
