import test from 'node:test';
import assert from 'node:assert/strict';
import { documentShortcut, cellResizePlan, paragraphStepPlan } from '../js/rhwp-exam-shortcuts.js';
const key = (code, modifiers = {}) => ({ key:code.replace('Key','').toLowerCase(), code,
  ctrlKey:false, metaKey:false, altKey:false, shiftKey:false, ...modifiers });
test('physical codes preserve Korean and macOS Option shortcut meanings', () => {
  assert.equal(documentShortcut(key('KeyN',{key:'ㅜ',altKey:true,shiftKey:true})), 'format:char-spacing-decrease');
  assert.equal(documentShortcut(key('KeyP',{key:'∏',altKey:true,shiftKey:true})), 'format:superscript');
  assert.equal(documentShortcut(key('KeyL',{key:'¬',altKey:true})), 'format:char-shape');
  assert.equal(documentShortcut(key('KeyC',{ctrlKey:true,shiftKey:true})), 'format:align-center');
  assert.equal(documentShortcut(key('KeyH',{metaKey:true})), 'edit:find-replace');
});
test('paragraph and table keys keep different meanings', () => {
  assert.equal(documentShortcut(key('Enter',{ctrlKey:true})), 'page:break');
  assert.equal(documentShortcut(key('Enter',{ctrlKey:true}),{inCell:true}), 'table:insert-row-below');
  assert.equal(documentShortcut(key('Tab',{ctrlKey:true,shiftKey:true}),{inCell:true}), 'hanging-indent');
  assert.equal(documentShortcut(key('KeyH')), null);
  assert.equal(documentShortcut(key('KeyH'),{cellSelection:true}), 'equal-height');
  assert.equal(documentShortcut(key('Digit1',{ctrlKey:true})), null, 'palette keys stay unchanged');
});
test('Han/글 paragraph indent, margin and level keys', () => {
  for (const [code, mods, action] of [
    ['F6',{ctrlKey:true},'para:indent-in'], ['F5',{ctrlKey:true},'para:indent-out'],
    ['KeyI',{ctrlKey:true,shiftKey:true},'para:indent-in'], ['KeyO',{ctrlKey:true,shiftKey:true},'para:indent-out'],
    ['F6',{ctrlKey:true,altKey:true},'para:left-increase'], ['F5',{ctrlKey:true,altKey:true},'para:left-decrease'],
    ['KeyG',{ctrlKey:true,shiftKey:true},'para:left-increase'], ['KeyE',{ctrlKey:true,shiftKey:true},'para:left-decrease'],
    ['F7',{ctrlKey:true,altKey:true},'para:right-increase'], ['F8',{ctrlKey:true,altKey:true},'para:right-decrease'],
    ['KeyD',{ctrlKey:true,shiftKey:true},'para:right-increase'], ['KeyF',{ctrlKey:true,shiftKey:true},'para:right-decrease'],
    ['F8',{ctrlKey:true},'para:margins-increase'], ['F7',{ctrlKey:true},'para:margins-decrease'],
    ['NumpadSubtract',{key:'-',ctrlKey:true},'level-increase'], ['NumpadAdd',{key:'+',ctrlKey:true},'level-decrease'],
  ]) assert.equal(documentShortcut(key(code,mods)), action, code + JSON.stringify(mods));
  assert.equal(documentShortcut(key('KeyI',{metaKey:true,shiftKey:true})), null, 'Command+Shift stays with the browser');
  assert.equal(documentShortcut(key('F5'),{inCell:true}), null, 'plain F5 keeps cell selection');
  assert.equal(documentShortcut(key('F5',{shiftKey:true}),{inCell:true}), 'extend-cells');
});
test('paragraph steps use one character for indents and 1pt for margins', () => {
  const para = { indent:0, marginLeft:6.7, marginRight:0 };
  assert.deepEqual(paragraphStepPlan(para, 1000, { indent:1 }), { indent:2000 });
  assert.deepEqual(paragraphStepPlan(para, 1200, { indent:-1 }), { indent:-2400 });
  assert.deepEqual(paragraphStepPlan(para, 1000, { left:1 }), { marginLeft:1200 });
  assert.deepEqual(paragraphStepPlan(para, 1000, { left:-1, right:-1 }), { marginLeft:800 });
  assert.equal(paragraphStepPlan({ indent:0, marginLeft:0, marginRight:0 }, 1000, { left:-1 }), null);
});
const cells = [0,1,2,3].map(cellIdx => ({cellIdx,row:cellIdx>>1,col:cellIdx%2,rowSpan:1,colSpan:1,width:cellIdx%2?2000:1000,height:cellIdx<2?1000:2000,cellProtect:false}));
test('equal dimensions account for spans and leave unselected cells alone', () => {
  assert.deepEqual(cellResizePlan(cells,[0,1],{axis:'width',mode:'equal'}), [{cellIdx:0,widthDelta:500},{cellIdx:1,widthDelta:-500}]);
  assert.deepEqual(cellResizePlan(cells,[0,2],{axis:'height',mode:'equal'}), [{cellIdx:0,heightDelta:500},{cellIdx:2,heightDelta:-500}]);
  const merged = [{...cells[0],width:2000,colSpan:2},{...cells[1],col:2,width:2000}];
  const result = cellResizePlan(merged,[0,1],{axis:'width',mode:'equal'});
  assert.deepEqual(result,[{cellIdx:0,widthDelta:667},{cellIdx:1,widthDelta:-667}]);
});
test('cell, whole-track and fixed-table resize have distinct scopes', () => {
  assert.deepEqual(cellResizePlan(cells,[0],{axis:'width',mode:'cell',delta:300}), [{cellIdx:0,widthDelta:300}]);
  assert.deepEqual(cellResizePlan(cells,[0],{axis:'width',mode:'track',delta:300}), [{cellIdx:0,widthDelta:300},{cellIdx:2,widthDelta:300}]);
  const changes=cellResizePlan(cells,[0],{axis:'width',mode:'fixed',delta:300});
  assert.equal(changes.reduce((sum,c)=>sum+c.widthDelta,0),0);
  assert.deepEqual(changes,[{cellIdx:0,widthDelta:300},{cellIdx:1,widthDelta:-300},{cellIdx:2,widthDelta:300},{cellIdx:3,widthDelta:-300}]);
  assert.deepEqual(cellResizePlan(cells,[0,1],{axis:'width',mode:'fixed',delta:300}), []);
});
test('protected and undersized neighbors block a complete resize', () => {
  assert.deepEqual(cellResizePlan(cells.map(c=>({...c,cellProtect:c.cellIdx===1})),[0],{axis:'width',mode:'fixed',delta:300}), []);
  assert.deepEqual(cellResizePlan(cells,[1],{axis:'width',mode:'fixed',delta:1000}), []);
  assert.deepEqual(cellResizePlan(cells,[],{axis:'height',mode:'equal'}), []);
});
