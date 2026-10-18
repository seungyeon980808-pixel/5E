import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQuestionHtml,italicVariables,labelInDocument} from '../assets/exampool/sheet/handoff.js';
import {buildTextMap,mapTextEdit,applyTextEdit} from '../assets/exampool/sheet/text-sync.js';
import {questionFromShape} from '../assets/exampool/sheet/templates.js';
import {choiceColumns,parseChoiceLayout} from '../assets/exampool/sheet/placement.js';
// 새 문항 틀을 평가원 서식으로 한글에 찍는 규칙(HTML 단계). 실제 한글 엔진 결과는 브라우저 검사에서 본다.
const docOf=plan=>plan.textSegments.map(s=>s.value).join('\n');
const shape=(form,struct,fill)=>{const q=questionFromShape({form,struct},'7');q.ask='옳은 것만을 <보기>에서 있는 대로 고른 것은?';fill?.(q);return q;};

test('[3점] follows the prompt as an uneditable tail, and <보기> comes after the prompt',async()=>{
  const q=shape('combo','big',q=>{q.points=3;q.blocks[0].text='그림은 물체의 운동을 나타낸 것이다.';q.blocks.find(b=>b.kind==='bogi').lines[0].text='운동량은 보존된다.';});
  const plan=await buildQuestionHtml(q),values=plan.textSegments.map(s=>s.value);
  const ask=plan.textSegments.find(s=>s.owner?.kind==='ask');
  assert.equal(ask.value,'옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]');assert.equal(ask.owner.suffix,5);
  assert.ok(values.indexOf(ask.value)<values.indexOf('<보 기>'),'발문 다음에 보기');
  // 좁은 폭에서도 [3점]이 혼자 다음 줄로 떨어지지 않는다.
  const narrow=await buildQuestionHtml(q,undefined,150);assert.match(narrow.textSegments.find(s=>s.owner?.kind==='ask').wrapped,/것은\? \[3점\]$/);
  // 한글 창에서 발문을 고치면 [3점] 없이 시트로, [3점]을 고치면 막는다.
  const doc=docOf(plan),map=buildTextMap(doc,plan.textSegments);
  let r=mapTextEdit(map,doc.replace('있는 대로','모두'));assert.equal(r.ok,true,r.reason);assert.equal(r.changes[0].value,'옳은 것만을 <보기>에서 모두 고른 것은?');
  applyTextEdit(q,r.changes[0].owner,r.changes[0].value);assert.equal(q.ask,'옳은 것만을 <보기>에서 모두 고른 것은?');
  r=mapTextEdit(map,doc.replace('[3점]','[2점]'));assert.equal(r.ok,false);
  q.points=2;assert.ok(!(await buildQuestionHtml(q)).textSegments.some(s=>/\[3점\]/.test(s.value)));
});

test('condition and experiment boxes print no title; experiment parts get 〔 〕 heads and hanging (가)',async()=>{
  const c=shape('single','condition',q=>{q.blocks.find(b=>b.label==='조건').text='· 질량은 m이다.';});
  const box=c.blocks.find(b=>b.kind==='group');assert.equal(labelInDocument(box),false);
  const cp=await buildQuestionHtml(c);assert.ok(!cp.textSegments.some(s=>s.owner?.kind==='label'));assert.deepEqual(cp.tables[0],{rows:1,cols:1,merges:[]});
  const e=shape('combo','experiment',q=>{q.blocks.find(b=>b.kind==='steps').lines[0].text='수레 A, B의 질량을 측정한다.';});
  const ep=await buildQuestionHtml(e),heads=ep.textSegments.filter(s=>s.owner?.kind==='label').map(s=>s.value);
  assert.deepEqual(heads,['〔실험 과정〕','〔실험 결과〕']);
  assert.ok(ep.textSegments.some(s=>s.value==='(가) 수레 A, B의 질량을 측정한다.'&&s.owner.prefix===4));
  const doc=docOf(ep),map=buildTextMap(doc,ep.textSegments);
  const r=mapTextEdit(map,doc.replace('〔실험 결과〕','〔측정 결과〕'));assert.equal(r.ok,true,r.reason);assert.equal(r.changes[0].value,'측정 결과');
  assert.equal(mapTextEdit(map,doc.replace('〔실험 결과〕','〔실험 결과]')).ok,false);
});

test('dialogue lines become name + speech rows; pair choices use the original two-column layout',async()=>{
  const t=shape('talk','none',q=>{q.blocks.find(b=>b.kind==='dialogue').lines.forEach((l,i)=>l.text=['운동량은 보존돼.','에너지는 증가해.','충격량은 같아.'][i]);});
  const tp=await buildQuestionHtml(t);
  assert.ok(tp.tables.some(x=>x.rows===3&&x.cols===2));assert.ok(tp.textSegments.some(s=>s.value==='학생 A'&&!s.owner));
  assert.deepEqual(tp.textSegments.find(s=>s.value==='운동량은 보존돼.').owner.kind,'line');
  const p=shape('pair','none',q=>{['속력','가속도','운동량','속력','운동량','가속도','가속도','속력','운동량','가속도','운동량','속력','운동량','속력','가속도'].forEach((v,i)=>q.choiceTable.cells[1+Math.floor(i/3)][i%3].value=v);});
  const pp=await buildQuestionHtml(p,undefined,540,{native:true});
  const grid=pp.tables.at(-1);assert.deepEqual(grid,{rows:4,cols:8,merges:[]});
  assert.equal((pp.html.match(/<u>/g)||[]).length,6,'두 묶음 위 A·B·C에만 밑줄');
  const last=pp.html.slice(pp.html.lastIndexOf('<table'));assert.ok(!/border:0\.4pt/.test(last),'대응 선지는 테두리 없음');
  // 병합이 있는 선지표는 예전처럼 선 있는 표.
  p.choiceTable.merges.push({r:1,c:0,rs:2,cs:1});p.choiceTable.cells[2][0].value='';
  const old=await buildQuestionHtml(p);assert.deepEqual(old.tables.at(-1).cols,4);
});

test('2-column choices, italic variables and upright units',()=>{
  assert.equal(choiceColumns('2열',5),2);assert.equal(parseChoiceLayout('2 열'),'2열');
  assert.equal(italicVariables('질량이 m인 물체가 속력 2v로 2 m 높이에서 3 m/s, 물체 A와 B'),'질량이 <i>m</i>인 물체가 속력 2<i>v</i>로 2 m 높이에서 3 m/s, 물체 A와 B');
  assert.equal(italicVariables('&lt;보 기&gt; &amp;'),'&lt;보 기&gt; &amp;');
});

test('a side material frame puts the question number in the text beside it, and the prompt after',async()=>{
  const q=shape('combo','small',q=>{q.blocks[1].text='그림과 같이 용수철에 물체를 매달았다.';});
  const plan=await buildQuestionHtml(q),values=plan.textSegments.map(s=>s.value);
  assert.equal(values[0],'7. 그림과 같이 용수철에 물체를 매달았다.');assert.deepEqual(plan.textSegments[0].owner,{kind:'block',id:q.blocks[1].id,prefix:3});
  assert.ok(values.indexOf(q.ask)>0);assert.deepEqual(plan.tables[0],{rows:1,cols:2,merges:[]});
});
