import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate} from '../assets/exampool/sheet/model.js';
import {partRows,applyPartChange,movePart} from '../assets/exampool/sheet/parts-view.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const question=()=>structuredClone(examples.questions[0]);
const ok=q=>validate({format:examples.format,questions:[q],documents:[]});

test('composition rows list children right under their group, in stored order',()=>{
  const q=question(),rows=partRows(q),group=q.blocks.find(b=>b.kind==='group');
  const at=rows.findIndex(r=>r.b===group);
  for(const [i,child] of q.blocks.filter(b=>b.parent===group.id).entries())assert.equal(rows[at+1+i].b,child);
  assert.ok(rows.filter(r=>r.b.parent===group.id).every(r=>r.depth===1));
});

test('typed composition values snap to the grid and blank returns to automatic',()=>{
  const q=question(),fig=q.blocks.find(b=>b.kind==='figure'||b.kind==='table');
  applyPartChange(q,fig.id,'size','63');assert.equal(fig.size,65);
  applyPartChange(q,fig.id,'gap','1.2mm');assert.equal(fig.gap,1);
  applyPartChange(q,fig.id,'align','가운데');assert.equal(fig.align,'가운데');
  applyPartChange(q,fig.id,'size','');assert.equal(fig.size,undefined);
  applyPartChange(q,'choices','choiceLayout','3+2');assert.equal(q.choiceLayout,'3+2');
  applyPartChange(q,'choices','choiceLayout','');assert.equal(q.choiceLayout,undefined);
  assert.throws(()=>applyPartChange(q,fig.id,'align','위'),/정렬/);
  ok(q);
});

test('switching a group back to vertical clears child ratios; moving into a group appends and cannot nest a group in itself',()=>{
  const q=question(),group=q.blocks.find(b=>b.kind==='group'),kids=q.blocks.filter(b=>b.parent===group.id);
  applyPartChange(q,group.id,'layout','나란히');applyPartChange(q,kids[0].id,'ratio','3');assert.equal(kids[0].ratio,3);
  applyPartChange(q,group.id,'layout','세로');assert.equal(kids[0].ratio,undefined);
  const top=q.blocks.find(b=>b.parent===null&&b.kind!=='group');applyPartChange(q,top.id,'parent',group.id);
  assert.equal(top.parent,group.id);assert.equal(q.blocks.filter(b=>b.parent===group.id).at(-1),top);
  assert.throws(()=>applyPartChange(q,group.id,'parent',group.id),/찾지 못했/);
  ok(q);
});

test('order moves stay within the same group',()=>{
  const q=question(),group=q.blocks.find(b=>b.kind==='group'),kids=q.blocks.filter(b=>b.parent===group.id);
  assert.equal(movePart(q,kids[0].id,'up'),false);
  assert.equal(movePart(q,kids[0].id,'down'),true);
  assert.deepEqual(q.blocks.filter(b=>b.parent===group.id).map(b=>b.id),[kids[1].id,kids[0].id,...kids.slice(2).map(b=>b.id)]);
  ok(q);
});
test('after a frame is made, each material cell picks picture or table; untitled boxes may keep an empty name',async()=>{
  const {questionFromShape}=await import('../assets/exampool/sheet/templates.js');
  const q=questionFromShape({form:'combo',struct:'two'},'1'),[a,b]=q.blocks.filter(x=>x.kind==='figure');
  applyPartChange(q,b.id,'kind','표');assert.equal(b.kind,'table');assert.equal(b.table.rows,3);assert.equal('figure' in b,false);ok(q);
  b.table.cells[1][1].value='2';assert.throws(()=>applyPartChange(q,b.id,'kind','그림'),/비운 뒤/);
  a.figure={name:'그림',data:'data:image/png;base64,AAAA'};assert.throws(()=>applyPartChange(q,a.id,'kind','표'),/지운 뒤/);
  const c=questionFromShape({form:'single',struct:'condition'},'2'),box=c.blocks.find(x=>x.kind==='group');
  applyPartChange(c,box.id,'label','조건');assert.equal(box.label,'조건');applyPartChange(c,box.id,'label','');assert.equal(box.label,'');
  assert.throws(()=>applyPartChange(c,c.blocks[0].id,'label',''),/이름/);
  applyPartChange(c,'choices','choiceLayout','2열');assert.equal(c.choiceLayout,'2열');ok(c);
});
