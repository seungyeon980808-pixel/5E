import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validate} from '../assets/exampool/sheet/model.js';
import {questionFingerprint} from '../assets/exampool/sheet/typeset-model.js';
import {paginateQuestions,examPlan,paperMix,paperMixMessage} from '../assets/exampool/sheet/exam-layout.js';
import {newExam,addToExam,removeFromExam,moveInExam,dropBeforeIndex,libraryQuestions,examOf,normalizeExams} from '../assets/exampool/sheet/exams.js';
import {filteredQuestions,workflowOf} from '../assets/exampool/sheet/views.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const data=()=>structuredClone(examples);

test('workflow is draft by default, validated, and not part of the typesetting fingerprint',async()=>{
  const d=data(),q=d.questions[0];assert.equal(workflowOf(q),'draft');
  const before=await questionFingerprint(q);q.workflow='complete';validate(d);
  assert.equal(await questionFingerprint(q),before);
  q.workflow='published';assert.throws(()=>validate(d),/초안·검토 중·완성/);
});

test('cards filter by status, type and text',()=>{
  const d=data();d.questions[1].workflow='review';
  assert.deepEqual(filteredQuestions(d,{status:'review'}).map(q=>q.id),[d.questions[1].id]);
  assert.equal(filteredQuestions(d,{status:'draft'}).length,d.questions.length-1);
  assert.equal(filteredQuestions(d,{status:'draft',query:'없는 말'}).length,0);
});

test('exams keep order, a question belongs to one exam, the rest stay in the library, and pages pack whole questions',()=>{
  const d=data(),[a,b,c]=d.questions.map(q=>q.id),e1=newExam('중간고사'),e2=newExam('수행평가');d.exams=[e1,e2];
  addToExam(d,e1.id,a);addToExam(d,e1.id,b);addToExam(d,e1.id,c);validate(d);
  assert.deepEqual(e1.items,[a,b,c]);
  assert.ok(moveInExam(d,e1.id,c,1));assert.deepEqual(e1.items,[a,c,b]);assert.equal(moveInExam(d,e1.id,a,0),false);
  addToExam(d,e2.id,c);assert.deepEqual(e1.items,[a,b],'moving to another exam removes it from the first');assert.equal(examOf(d,c).id,e2.id);
  removeFromExam(d,c);assert.ok(libraryQuestions(d).some(q=>q.id===c),'removed questions return to the library');
  e1.items.push('missing');assert.throws(()=>validate(d),/시험지 구성/);e1.items.pop();
  e2.items.push(a);assert.throws(()=>validate(d),/시험지 구성/,'one question cannot sit in two exams');e2.items.pop();
  assert.deepEqual(paginateQuestions([{id:'x',height:200},{id:'y',height:100},{id:'z',height:300}],{height:267,columns:2,gap:6}).map(p=>p.columns),[[['x'],['y']],[['z'],[]]]);
});

test('the old single exam set becomes the first drafting exam',()=>{
  const d=data(),[a,b]=d.questions.map(q=>q.id);delete d.exams;d.examSet={items:[a,b]};normalizeExams(d);
  assert.equal(d.exams.length,1);assert.equal(d.exams[0].status,'drafting');assert.deepEqual(d.exams[0].items,[a,b]);assert.equal(d.examSet,undefined);
});

test('exam plan uses saved typesetting heights and lists questions that still need typesetting',()=>{
  const d=data(),[a,b]=d.questions,e=newExam('시험');d.exams=[e];addToExam(d,e.id,a.id);addToExam(d,e.id,b.id);
  a.typeset={verified:true,metrics:{usedHeightMm:180}};
  const plan=examPlan(d,e);
  assert.equal(plan.items[0].height,180);assert.equal(plan.items[0].ready,true);
  assert.deepEqual(plan.missing.map(x=>x.id),[b.id]);
});

test('exam paper follows the questions: all B4 typesets make a B4 two-column exam, mixed papers stay A4',async()=>{
  const {examPage,EXAM_PAGE}=await import('../assets/exampool/sheet/exam-layout.js');
  const item=paper=>({q:{typeset:{profile:{paper,columns:2}}}});
  assert.deepEqual(examPage([item('B4'),item('B4')]),{...EXAM_PAGE,paper:'B4',heightMm:334});
  assert.equal(examPage([item('B4'),item('A4')]),EXAM_PAGE);assert.equal(examPage([]),EXAM_PAGE);
  assert.equal(examPage([{q:{paper:'B4'}}]).paper,'B4');
});

test('question paper is optional and limited to A4, B4 and A3',async()=>{
  const {validate,newQuestion,FORMAT}=await import('../assets/exampool/sheet/model.js');
  const q=newQuestion('1');q.paper='B4';validate({format:FORMAT,questions:[q],documents:[]});
  q.paper='Letter';assert.throws(()=>validate({format:FORMAT,questions:[q],documents:[]}),/기준 용지/);
});

test('an exam whose questions were typeset on different papers is reported as mixed',()=>{
  const d=data(),exam=newExam('섞인 시험지');d.exams=[exam];for(const q of d.questions)addToExam(d,exam.id,q.id);
  d.questions[0].typeset={profile:{paper:'B4',columns:2},verified:true,metrics:{usedHeightMm:100}};d.questions[1].paper='A4';
  const {mixed}=examPlan(d,exam);
  assert.deepEqual(mixed,[{paper:'B4',numbers:[d.questions[0].number]},{paper:'A4',numbers:[d.questions[1].number,d.questions[2].number]}]);
  assert.match(paperMixMessage(mixed),/용지가 섞여 있습니다\(B4 1번 \/ A4 2번·3번\)/);
  for(const q of d.questions)q.typeset={profile:{paper:'B4',columns:2},verified:true};
  assert.equal(paperMix(examPlan(d,exam).items),null,'one paper is not mixed');
});

test('끌어 놓기: 파란 선(그 문항 앞)에 정확히 놓인다(M17)',()=>{
  const drop=(items,id,before)=>{const next=[...items],to=dropBeforeIndex(next,id,before);next.splice(next.indexOf(id),1);next.splice(to,0,id);return next.join('');};
  assert.equal(drop([...'ABCD'],'A','C'),'BACD');assert.equal(drop([...'ABCD'],'D','B'),'ADBC');assert.equal(drop([...'ABCD'],'B','C'),'ABCD');assert.equal(dropBeforeIndex([...'AB'],'A','Z'),-1);
});
