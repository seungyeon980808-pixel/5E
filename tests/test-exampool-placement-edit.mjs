import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate,block,newQuestion} from '../assets/exampool/sheet/model.js';
import {placeBeside,placeAround,resizeTo,setPairRatio,ratioPair} from '../assets/exampool/sheet/placement-edit.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const ok=q=>validate({format:examples.format,questions:[q],documents:[]});
function experiment(){
  // 실험 상자 안: 과정 · 그림(가) · 결과표
  const q=newQuestion('1','합답형','실험');return q;
}
const kid=(q,kind,parent)=>q.blocks.find(b=>b.kind===kind&&(parent===undefined||b.parent===parent));

test('ratio pairs are small integers close to the dragged widths',()=>{
  assert.deepEqual(ratioPair(300,200),[3,2]);assert.deepEqual(ratioPair(100,100),[1,1]);assert.deepEqual(ratioPair(700,100),[7,1]);
  const [a,b]=ratioPair(333,667);assert.ok(a+b<=12&&Math.abs(a/(a+b)-.333)<.04);
});

test('dropping a figure beside the result table makes a side-by-side group inside the experiment with a width ratio',()=>{
  const q=experiment(),box=kid(q,'group'),fig=kid(q,'figure',box.id),table=kid(q,'table',box.id);
  assert.ok(placeBeside(q,fig.id,table.id,'right',{dragWidth:200,targetWidth:300}));
  const side=q.blocks.find(b=>b.kind==='group'&&b.layout==='나란히');
  assert.equal(side.parent,box.id);
  assert.deepEqual(q.blocks.filter(b=>b.parent===side.id).map(b=>b.id),[table.id,fig.id]);
  assert.equal(table.ratio,3);assert.equal(fig.ratio,2);ok(q);
});

test('dropping on the left puts the dragged item first; dropping into an existing side group joins it',()=>{
  const q=experiment(),box=kid(q,'group'),fig=kid(q,'figure',box.id),table=kid(q,'table',box.id),steps=kid(q,'steps',box.id);
  placeBeside(q,fig.id,table.id,'left');const side=q.blocks.find(b=>b.layout==='나란히');
  assert.deepEqual(q.blocks.filter(b=>b.parent===side.id).map(b=>b.id),[fig.id,table.id]);
  placeBeside(q,steps.id,table.id,'right');
  assert.deepEqual(q.blocks.filter(b=>b.parent===side.id).map(b=>b.id),[fig.id,table.id,steps.id]);ok(q);
});

test('moving the last but one item out unwraps the automatic group; user groups are kept',()=>{
  const q=experiment(),box=kid(q,'group'),fig=kid(q,'figure',box.id),table=kid(q,'table',box.id),steps=kid(q,'steps',box.id);
  placeBeside(q,fig.id,table.id,'right',{dragWidth:200,targetWidth:300});
  placeAround(q,fig.id,steps.id,'before');
  assert.equal(q.blocks.some(b=>b.label==='가로 묶음'),false);
  assert.equal(table.parent,box.id);assert.equal(table.ratio,undefined);assert.equal(fig.ratio,undefined);
  assert.deepEqual(q.blocks.filter(b=>b.parent===box.id).map(b=>b.id),[fig.id,steps.id,table.id]);
  // The experiment box itself survives even if emptied by drags.
  for(const b of q.blocks.filter(b=>b.parent===box.id))placeAround(q,b.id,q.blocks.find(x=>x.parent===null&&x.kind==='text').id,'after');
  assert.ok(q.blocks.includes(box));ok(q);
});

test('a group cannot be dropped inside itself',()=>{
  const q=experiment(),box=kid(q,'group'),table=kid(q,'table',box.id);
  assert.throws(()=>placeBeside(q,box.id,table.id,'right'),/자기 안/);
  assert.throws(()=>placeAround(q,box.id,table.id,'after'),/자기 안/);
});

test('resize handle widths snap to 5% of the cell; full width returns to automatic',()=>{
  const q=experiment(),fig=kid(q,'figure');
  assert.ok(resizeTo(q,fig.id,163,250));assert.equal(fig.size,65);
  assert.equal(resizeTo(q,fig.id,162,250),false);
  assert.ok(resizeTo(q,fig.id,249,250));assert.equal(fig.size,undefined);ok(q);
});

test('dragging a divider between neighbours keeps the other columns and their total',()=>{
  const q=experiment(),box=kid(q,'group'),fig=kid(q,'figure',box.id),table=kid(q,'table',box.id),steps=kid(q,'steps',box.id);
  placeBeside(q,fig.id,table.id,'right');placeBeside(q,steps.id,fig.id,'right');
  const side=q.blocks.find(b=>b.layout==='나란히');
  setPairRatio(q,table.id,fig.id,300,100);
  // table+fig keep two thirds of the row; steps keeps one third.
  const share=b=>b.ratio/(table.ratio+fig.ratio+steps.ratio);
  assert.ok(Math.abs(share(steps)-1/3)<1e-9);assert.ok(Math.abs(share(table)/share(fig)-3)<1e-9);
  setPairRatio(q,table.id,fig.id,100,100);
  assert.deepEqual(q.blocks.filter(b=>b.parent===side.id).map(b=>b.ratio),[undefined,undefined,undefined]);ok(q);
});
