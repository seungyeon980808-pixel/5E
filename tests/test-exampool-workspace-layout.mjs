import test from 'node:test';
import assert from 'node:assert/strict';
import {splitLayout,paginateQuestions} from '../assets/exampool/concept/workspace-layout.js';

test('splitter clamps both editors and restores their ratio without changing document width',()=>{
  for(const ratio of [-1,.2,.54,.8,2,NaN]){
    const l=splitLayout(1000,ratio);
    assert.ok(l.left>=260);assert.ok(l.right>=350);
    assert.equal(l.left+l.right+l.gap,1000);
    assert.equal(splitLayout(1000,l.ratio).left,l.left);
  }
  const narrow=splitLayout(500,.9);
  assert.ok(narrow.left>=0&&narrow.right>=0);
  assert.equal(narrow.left+narrow.right+narrow.gap,500);
});
test('exam packing preserves order, gaps and whole questions across columns and pages',()=>{
  const p=paginateQuestions([100,130,100,240,80].map((height,i)=>({id:String(i),height})),{height:240,columns:2,gap:12});
  assert.deepEqual(p.map(x=>x.columns),[[['0'],['1']],[['2'],['3']],[['4'],[]]]);
  assert.deepEqual(p.flatMap(x=>x.columns.flat()),['0','1','2','3','4']);
  assert.deepEqual(paginateQuestions([],{height:240}),[]);
});
test('an oversized question is isolated and explicitly marked instead of clipped',()=>{
  const p=paginateQuestions([{id:'a',height:80},{id:'long',height:300},{id:'b',height:90}],{height:240});
  assert.equal(p.length,3);assert.equal(p[1].oversized,true);
  assert.deepEqual(p.map(x=>x.columns.flat()),[['a'],['long'],['b']]);
});
