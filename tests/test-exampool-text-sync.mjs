import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildQuestionHtml} from '../assets/exampool/sheet/handoff.js';
import {normMap,diffRegion,buildTextMap,mapTextEdit,applyTextEdit} from '../assets/exampool/sheet/text-sync.js';
import {newQuestion} from '../assets/exampool/sheet/model.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));

// The native document text: the plan's segments in order, wrapped with soft line breaks like the HWP output.
const docOf=plan=>plan.textSegments.map(s=>s.value.replace(/ /g,(m,i)=>i%7===3?'\n':' ')).join('\n');

test('whitespace runs collapse while remembering original positions',()=>{
  const m=normMap('  가 \n 나다  ');assert.equal(m.text,'가 나다');assert.equal(m.idx.length,4);
  assert.deepEqual(diffRegion('abcdef','abXYef'),{start:2,endOld:4,endNew:4});
});

test('a typed change inside the prompt goes back to the prompt cell only',async()=>{
  const q=structuredClone(examples.questions[0]),plan=await buildQuestionHtml(q),doc=docOf(plan);
  const map=buildTextMap(doc,plan.textSegments);
  const edited=doc.replace('고른 것은?','고른 것만은?');assert.notEqual(edited,doc);
  const r=mapTextEdit(map,edited);assert.equal(r.ok,true,r.reason);
  assert.equal(r.changes[0].owner.kind,'ask');
  const copy=structuredClone(q);applyTextEdit(copy,r.changes[0].owner,r.changes[0].value);
  assert.equal(copy.ask,q.ask.replace('고른 것은?','고른 것만은?'));
  assert.deepEqual({...copy,ask:q.ask},q,'nothing else changes');
});

test('table cells, bogi lines and choices map to their own cells; prefixes are protected',async()=>{
  const q=newQuestion('7','합답형','실험'),box=q.blocks.find(b=>b.kind==='group'),table=q.blocks.find(b=>b.kind==='table');
  q.ask='옳은 것만을 고른 것은?';table.table.cells[1][1].value='0.5';
  const bogi=q.blocks.find(b=>b.kind==='bogi');bogi.lines[1].text='운동량이 보존된다.';q.choices[2].text='ㄱ, ㄴ';
  const plan=await buildQuestionHtml(q),doc=docOf(plan),map=buildTextMap(doc,plan.textSegments);
  let r=mapTextEdit(map,doc.replace('0.5','0.25'));assert.equal(r.ok,true,r.reason);assert.deepEqual(r.changes[0].owner,{kind:'cell',table:table.id,r:1,c:1});
  const a=structuredClone(q);applyTextEdit(a,r.changes[0].owner,r.changes[0].value);assert.equal(a.blocks.find(b=>b.id===table.id).table.cells[1][1].value,0.25);
  r=mapTextEdit(map,doc.replace('보존된다','보존되지 않는다'));assert.equal(r.ok,true,r.reason);assert.equal(r.changes[0].owner.id,bogi.lines[1].id);assert.equal(r.changes[0].value,'운동량이 보존되지 않는다.');
  r=mapTextEdit(map,doc.replace('ㄴ. 운동량','ㄷ. 운동량'));assert.equal(r.ok,false);assert.match(r.reason,/앞머리/);
  r=mapTextEdit(map,doc.replace('7. ','8. '));assert.equal(r.ok,false);
  assert.equal(box.label,'실험');
});

test('an edit across two cells (paragraph merge) is refused instead of guessed',async()=>{
  const q=structuredClone(examples.questions[0]),plan=await buildQuestionHtml(q),doc=docOf(plan),map=buildTextMap(doc,plan.textSegments);
  const segs=plan.textSegments.filter(s=>s.owner&&s.value.length>6);
  const a=segs[0].value,b=segs[1].value,joined=doc.replace(a.slice(-3)+'\n'+b.slice(0,3),a.slice(-3)+b.slice(0,3));
  if(joined!==doc){const r=mapTextEdit(map,joined);assert.equal(r.ok,false);}
  assert.equal(mapTextEdit(map,doc).unchanged,true);
});
