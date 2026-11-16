// 카드 「자/료」 칸의 자료 배치(10-27): 위치(글 아래·글 옆)·개수(1~3)·배열(가로·세로)를 바꿔도 채운 그림은 지워지지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {questionFromShape,materialLayout,setMaterialLayout} from '../assets/exampool/sheet/templates.js';

const kids=(q,g)=>q.blocks.filter(b=>b.parent===g.id);
test('small → 2 across → 3 down → 1 below, keeping order after the passage', () => {
  const q=questionFromShape({form:'combo',struct:'small'},1);
  assert.deepEqual(materialLayout(q),{count:1,place:'side',dir:'col'});
  setMaterialLayout(q,{count:2,dir:'row'});
  const g=q.blocks.find(b=>b.kind==='group'&&b.label==='자료');assert.equal(g.layout,'나란히');assert.deepEqual(kids(q,g).map(b=>b.label),['(가)','(나)']);
  assert.equal(q.blocks.indexOf(g),q.blocks.findIndex(b=>b.kind==='text')+1,'materials sit right after the passage');
  assert.deepEqual(setMaterialLayout(q,{count:3,dir:'col'}),{count:3,place:'below',dir:'col'});
  assert.deepEqual(setMaterialLayout(q,{count:1,place:'below'}),{count:1,place:'below',dir:'col'});
  assert.equal(q.blocks.filter(b=>b.kind==='group').length,0,'the empty group is gone');
});
test('a filled picture survives; shrinking stops with a reason when only filled slots are left', () => {
  const q=questionFromShape({form:'combo',struct:'two'},1);
  const [a,b]=q.blocks.filter(x=>x.kind==='figure');a.figure={data:'x'};b.figure={data:'y'};
  assert.throws(()=>setMaterialLayout(q,{count:1}),/채운 자료가 2개/);
  setMaterialLayout(q,{count:3});const c=q.blocks.filter(x=>x.kind==='figure');assert.equal(c.length,3);
  setMaterialLayout(q,{count:2});assert.deepEqual(q.blocks.filter(x=>x.kind==='figure').map(x=>!!x.figure),[true,true]);
});
test('side is only for one material', () => {
  const q=questionFromShape({form:'combo',struct:'two'},1);
  assert.equal(setMaterialLayout(q,{place:'side'}).place,'below');
  assert.equal(setMaterialLayout(q,{count:1,place:'side'}).place,'side');
});
