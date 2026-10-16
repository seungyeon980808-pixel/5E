import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {FORMAT,newQuestion,validate,block} from '../assets/exampool/sheet/model.js';
import {workflow,writeRectangle,mergeWorkbook,createHistory,documentField,compoundField} from '../assets/exampool/concept/workspace-model.js';
import {project,enhanceZip,importExcel} from '../assets/exampool/sheet/excel.js';
import {groupMetrics,materialTree,updateMaterial,moveMaterial,insertMaterial} from '../assets/exampool/concept/material-model.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const data=()=>({format:FORMAT,questions:[newQuestion('1'),newQuestion('2')],documents:[]});
test('document objects link to their worksheet field without flattening nested materials',async()=>{
 const original=JSON.parse(await readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8')),q=original.questions[0];
 const text=q.blocks.find(b=>b.kind==='text'&&!b.parent),table=q.blocks.find(b=>b.kind==='table'),bogi=q.blocks.find(b=>b.kind==='bogi'),steps=q.blocks.find(b=>b.kind==='steps');
 assert.equal(documentField(q,'ask'),'ask');assert.equal(documentField(q,`block:${text.id}`),'passage');
 assert.equal(documentField(q,`cell:${table.id}:2:1`),'materials');assert.equal(documentField(q,`note:${table.id}`),'materials');
 assert.equal(documentField(q,`line:${bogi.id}:${bogi.lines[0].id}`),'bogi');assert.equal(documentField(q,`line:${steps.id}:${steps.lines[0].id}`),'materials');
 assert.equal(documentField(q,'choice:2'),'choices');assert.equal(documentField(q,'cell:choices:2:1'),'choices');
 assert.equal(documentField(q,`block:${table.id}`),'materials');assert.equal(documentField(q,'block:missing'),null);
 const nested={id:'nested',parent:table.parent,kind:'text',text:'자료 안 설명'};nested.parent ||= 'group';q.blocks.push(nested);
 assert.equal(documentField(q,'block:nested'),'materials');
});
test('a rejected rectangle leaves every previous cell and completion state intact',()=>{
 const original=data();original.questions[0].workflow='complete';const before=structuredClone(original);
 assert.throws(()=>writeRectangle(original,original.questions.map(q=>q.id),[{r:1,c:0,value:'변경하면 안 됨'},{r:17,c:1,value:'배점 오류'}]),/배점/);
 assert.deepEqual(original,before);
});
test('a rectangle edits questions by ID and sends only changed completed questions to review',()=>{
 const original=data();original.questions.forEach(q=>q.workflow='complete');
 const next=writeRectangle(original,original.questions.map(q=>q.id).reverse(),[{r:1,c:0,value:'운동량'},{r:5,c:0,value:'힘, 힘, 운동량'}]);
 assert.equal(next.questions[1].unitLarge,'운동량');assert.deepEqual(next.questions[1].concepts,['힘','운동량']);
 assert.equal(workflow(next.questions[1]),'review');assert.equal(workflow(next.questions[0]),'complete');assert.equal(workflow(original.questions[1]),'complete');
 const same=writeRectangle(next,[next.questions[0].id],[{r:7,c:0,value:next.questions[0].ask}]);assert.equal(workflow(same.questions[0]),'complete');
});
test('workbook merge retains questions absent from the file and restores the entire import through history',()=>{
 const current=data();current.questions[0].workflow='complete';current.questions[1].cardTitle='사용자가 작성한 문항';
 const incoming={...data(),questions:[structuredClone(current.questions[0]),newQuestion('3')]};incoming.questions[0].ask='엑셀에서 수정한 발문';
 const history=createHistory();history.record({data:current,order:[current.questions[1].id]});const result=mergeWorkbook(current,incoming);
 assert.equal(result.updated,1);assert.equal(result.added,1);assert.equal(result.data.questions.length,3);assert.equal(result.data.questions[1].cardTitle,'사용자가 작성한 문항');assert.equal(workflow(result.data.questions[0]),'review');assert.equal(workflow(result.data.questions[2]),'draft');
 const restored=history.replay('undo',{data:result.data,order:[]});assert.deepEqual(restored,{data:current,order:[current.questions[1].id]});
 assert.deepEqual(history.replay('redo',restored),{data:result.data,order:[]});
});
test('typing is grouped for undo and a new edit after undo discards the redo branch',()=>{
 const h=createHistory(2);h.record({value:''},'ask',0);h.record({value:'가'},'ask',100);h.record({value:'가나'},'ask',200);
 assert.deepEqual(h.replay('undo',{value:'가나다'}),{value:''});assert.equal(h.canUndo,false);assert.equal(h.canRedo,true);
 h.record({value:''},'other',300);assert.equal(h.canRedo,false);
});
test('edited vertical XLSX preserves merged experiment cells, image choices and author formatting on import',async()=>{
 const original=JSON.parse(await readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));validate(original);
 const q=original.questions[0];q.workflow='complete';q.docFormats={ask:{bold:true,hanging:true}};
 const {wb,pack,images}=project(XLSX,original);wb.Sheets['문항'].B9.v='엑셀에서 바꾼 발문';
 const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));await enhanceZip(zip,wb.SheetNames,images,pack.excel.indices);
 const incoming=await importExcel(XLSX,JSZip,await zip.generateAsync({type:'arraybuffer'})),merged=mergeWorkbook(original,incoming);
 assert.equal(merged.data.questions[0].ask,'엑셀에서 바꾼 발문');assert.deepEqual(merged.data.questions[0].docFormats,q.docFormats);assert.equal(workflow(merged.data.questions[0]),'review');
 assert.deepEqual(merged.data.questions[0].blocks.find(b=>b.kind==='table').table,q.blocks.find(b=>b.kind==='table').table);
 assert.deepEqual(merged.data.questions[2].choices.map(c=>c.figure),original.questions[2].choices.map(c=>c.figure));
});

test('multiline statements and choices open structured editing rather than ambiguous line splitting',()=>{
 const q=newQuestion('7','합답형');
 assert.equal(compoundField(q,'choices'),false);assert.equal(compoundField(q,'bogi'),false);
 q.choices[0].text='첫 문단\n다음 문단';assert.equal(compoundField(q,'choices'),true);
 q.blocks.find(b=>b.kind==='bogi').lines[0].text='설명\n두 번째 줄';assert.equal(compoundField(q,'bogi'),true);
 assert.equal(compoundField(q,'ask'),false);assert.equal(compoundField(q,'materials'),true);
 const original={format:FORMAT,questions:[q],documents:[]},before=structuredClone(original);
 assert.throws(()=>writeRectangle(original,[q.id],[{r:1,c:0,value:'부분 수정 금지'},{r:12,c:0,value:'ㄱ. 단순화 금지'}]),/상세 편집/);
 assert.deepEqual(original,before);
 const cleared=writeRectangle(original,[q.id],[{r:7,c:0,value:''},{r:12,c:0,value:''}],{clear:true});
 assert.equal(cleared.questions[0].ask,'');assert.deepEqual(cleared.questions[0].blocks,q.blocks);
});

test('nested material groups retain independent objects and reject cyclic moves atomically',()=>{
 const q=newQuestion('1'),box=insertMaterial(q,'box').question;
 const outer=box.blocks.at(-1),row=insertMaterial(box,'row',outer.id),photo=insertMaterial(row.question,'figure',row.id),table=insertMaterial(photo.question,'table',row.id);
 const original=structuredClone(table.question),next=updateMaterial(table.question,table.id,'slotWeight',2);
 assert.deepEqual(table.question,original);
 assert.deepEqual(groupMetrics(next,next.blocks.find(b=>b.id===row.id)),{gap:2,columns:'minmax(0,1fr) minmax(0,2fr)'});
 assert.deepEqual(materialTree(next).map(({b,depth})=>[b.kind,depth]),[['group',0],['group',1],['figure',2],['table',2]]);
 assert.throws(()=>updateMaterial(next,outer.id,'parent',row.id),/하위 묶음/);
 assert.throws(()=>updateMaterial(next,row.id,'parent',row.id),/자기 자신/);
 assert.deepEqual(next.blocks.find(b=>b.id===outer.id).parent,null);
 validate({format:FORMAT,questions:[next],documents:[]});
 const moved=moveMaterial(next,table.id,-1);
 assert.deepEqual(moved.blocks.filter(b=>b.parent===row.id).map(b=>b.id),[table.id,photo.id]);
 assert.deepEqual(moved.blocks.find(b=>b.id===table.id).table,next.blocks.find(b=>b.id===table.id).table);
 const bounded=updateMaterial(updateMaterial(next,row.id,'gapMm',1000),photo.id,'slotWeight',-10);
 assert.equal(groupMetrics(bounded,bounded.blocks.find(b=>b.id===row.id)).gap,6);
 assert.equal(bounded.blocks.find(b=>b.id===photo.id).slotWeight,1);
});
test('Excel round trip preserves nested boxes, side-by-side weights, image bytes and merged cells',async()=>{
 const original=JSON.parse(await readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8')),q=original.questions[0];
 const outer=q.blocks.find(b=>b.kind==='group'),row=block('group',outer.id,'사진과 표');row.layout='나란히';row.gapMm=3;q.blocks.push(row);
 const table=q.blocks.find(b=>b.kind==='table'),photo=q.blocks.find(b=>b.kind==='figure');
 table.parent=row.id;table.slotWeight=2;table.tableAlign='right';photo.parent=row.id;photo.slotWeight=1;
 photo.figure=structuredClone(original.questions[2].choices.find(c=>c.figure).figure);
 const {wb,pack,images}=project(XLSX,original);wb.Sheets['문항'].B9.v='묶음 구조를 유지한 엑셀 수정';
 const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));await enhanceZip(zip,wb.SheetNames,images,pack.excel.indices);
 const result=await importExcel(XLSX,JSZip,await zip.generateAsync({type:'arraybuffer'}));
 const restored=result.questions[0];assert.equal(restored.ask,'묶음 구조를 유지한 엑셀 수정');
 for(const id of [outer.id,row.id,table.id,photo.id])assert.deepEqual(restored.blocks.find(b=>b.id===id),q.blocks.find(b=>b.id===id));
});
