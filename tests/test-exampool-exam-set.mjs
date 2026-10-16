import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate} from '../assets/exampool/sheet/model.js';
import {questionFingerprint} from '../assets/exampool/sheet/typeset-model.js';
import {paginateQuestions,examPlan,toggleExam,moveExam} from '../assets/exampool/sheet/exam-layout.js';
import {filteredQuestions,workflowOf} from '../assets/exampool/sheet/views.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const data=()=>structuredClone(examples);

test('workflow is draft by default, validated, and not part of the typesetting fingerprint',async()=>{
  const d=data(),q=d.questions[0];assert.equal(workflowOf(q),'draft');
  const before=await questionFingerprint(q);q.workflow='complete';validate(d);
  assert.equal(await questionFingerprint(q),before);
  q.workflow='published';assert.throws(()=>validate(d),/출제·점검·완성/);
});

test('cards filter by status, type and text',()=>{
  const d=data();d.questions[1].workflow='review';
  assert.deepEqual(filteredQuestions(d,{status:'review'}).map(q=>q.id),[d.questions[1].id]);
  assert.equal(filteredQuestions(d,{status:'draft'}).length,d.questions.length-1);
  assert.equal(filteredQuestions(d,{status:'draft',query:'없는 말'}).length,0);
});

test('exam set keeps order, rejects unknown ids, and packs whole questions into two columns',()=>{
  const d=data(),[a,b,c]=d.questions.map(q=>q.id);
  toggleExam(d,a,true);toggleExam(d,b,true);toggleExam(d,c,true);toggleExam(d,b,true);validate(d);
  assert.deepEqual(d.examSet.items,[a,b,c]);
  assert.ok(moveExam(d,c,'up'));assert.deepEqual(d.examSet.items,[a,c,b]);assert.equal(moveExam(d,a,'up'),false);
  toggleExam(d,c,false);assert.deepEqual(d.examSet.items,[a,b]);
  d.examSet.items.push('missing');assert.throws(()=>validate(d),/시험지 구성/);
  assert.deepEqual(paginateQuestions([{id:'x',height:200},{id:'y',height:100},{id:'z',height:300}],{height:267,columns:2,gap:6}).map(p=>p.columns),[[['x'],['y']],[['z'],[]]]);
});

test('exam plan uses saved typesetting heights and lists questions that still need typesetting',()=>{
  const d=data(),[a,b]=d.questions;toggleExam(d,a.id,true);toggleExam(d,b.id,true);
  a.typeset={verified:true,metrics:{usedHeightMm:180}};
  const plan=examPlan(d);
  assert.equal(plan.items[0].height,180);assert.equal(plan.items[0].ready,true);
  assert.deepEqual(plan.missing.map(x=>x.id),[b.id]);
});
