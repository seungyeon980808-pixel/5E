import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMAT,newQuestion,block,validate,clone,makeTable} from '../assets/exampool/sheet/model.js';
import {parseClipboard,encodeClipboard,expandRange,planPaste,applyGridValues,gridValue} from '../assets/exampool/sheet/grid-model.js';
const state=()=>({format:FORMAT,questions:[newQuestion('01'),newQuestion('02'),newQuestion('03')],documents:[]});
test('Excel clipboard preserves quoted multiline, tabs, quotes, blank cells and literal formulas',()=>{
  const rows=[['가\n나','a\tb','"quoted"','001','1.0','=1+1',''],['','0','㉠','','','끝','']];
  assert.deepEqual(parseClipboard(encodeClipboard(rows)),rows);
  assert.deepEqual(parseClipboard('a\tb\r\nc\td\r\n'),[['a','b'],['c','d']]);
  assert.throws(()=>parseClipboard('"unclosed'),/따옴표/);
});
test('paste one value fills a selected rectangle, multi-cell paste grows from its upper left with bounds checks',()=>{
  assert.deepEqual(planPaste([['0']],[1,1,2,2],4,5).writes,[{r:1,c:1,value:'0'},{r:1,c:2,value:'0'},{r:2,c:1,value:'0'},{r:2,c:2,value:'0'}]);
  assert.deepEqual(planPaste([['a','b'],['c','d']],[0,0,0,0],3,3).range,[0,0,1,1]);
  assert.throws(()=>planPaste([['a','b']],[0,2,0,2],3,3),/범위/);
});
test('range grows to include intersecting merged headers and stops at their complete boundaries',()=>{
  const merges=[{r:0,c:1,rs:2,cs:1},{r:1,c:2,rs:1,cs:2}];
  assert.deepEqual(expandRange([1,1,1,2],merges),[0,1,1,3]);
  assert.deepEqual(expandRange([3,0,3,0],merges),[3,0,3,0]);
});
test('filtered registry paste targets visible IDs without overwriting hidden rows; rejects unknown list values',()=>{
  const d=state(),scope={kind:'registry',ids:[d.questions[0].id,d.questions[2].id],allowAppend:false};
  applyGridValues(d,scope,[{r:1,c:5,value:'세 번째만 변경'},{r:1,c:6,value:'②'}]);
  assert.equal(d.questions[1].ask,'');assert.equal(d.questions[2].ask,'세 번째만 변경');assert.equal(d.questions[2].answer,1);assert.equal(gridValue(d.questions[2],6),'②');validate(d);
  assert.throws(()=>applyGridValues(clone(d),scope,[{r:2,c:5,value:'x'}]),/검색/);
  assert.throws(()=>applyGridValues(clone(d),scope,[{r:0,c:1,value:'wrong'}]),/답안형/);
});
test('registry range paste adds valid rows, converts answer labels, preserves old question content through type changes',()=>{
  const d=state();d.questions[0].blocks[0].text='기존 자료';const scope={kind:'registry',ids:d.questions.map(q=>q.id),allowAppend:true};
  applyGridValues(d,scope,[{r:0,c:1,value:'합답형'},{r:0,c:2,value:'실험'},{r:0,c:7,value:'0'},{r:3,c:5,value:'네 번째'},{r:3,c:6,value:'5'}]);
  assert.equal(d.questions.length,4);assert.equal(d.questions[0].blocks[0].text,'기존 자료');assert.equal(d.questions[0].points,0);assert.equal(d.questions[3].answer,4);validate(d);
});
test('table range edits preserve images, visible numeric distinctions and merged cell safety',()=>{
  const d=state(),b=block('table');b.table=makeTable(3,3);b.table.merges=[{r:0,c:0,rs:1,cs:2}];b.table.cells[1][0].raw='x_0';d.questions[0].blocks.push(b);
  const figure={name:'기존 그림',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',width:1,height:1};b.table.cells[1][0].figure=figure;
  const scope={kind:'table',questionId:d.questions[0].id,tableId:b.id};applyGridValues(d,scope,[{r:1,c:0,value:'001'},{r:1,c:1,value:'1.0'},{r:1,c:2,value:'0'}]);
  assert.deepEqual(b.table.cells[1].map(c=>c.value),['001','1.0',0]);assert.equal(b.table.cells[1][0].raw,undefined);validate(d);
  assert.throws(()=>applyGridValues(clone(d),scope,[{r:0,c:0,value:'a'},{r:0,c:1,value:'b'}]),/병합/);
  applyGridValues(d,scope,[{r:0,c:0,value:''},{r:0,c:1,value:''}],{clear:true});validate(d);
  applyGridValues(d,scope,[{r:1,c:0,value:''}],{clear:true});assert.deepEqual(b.table.cells[1][0].figure,figure);assert.equal(b.table.cells[1][0].value,'');validate(d);
});
