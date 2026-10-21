// 출제 코어(가짜 응답·순수 모듈 검사). 실제 AI 대화 검증이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FORMAT,newQuestion,validate,duplicateQuestion,block} from '../assets/exampool/sheet/model.js';
import {exportExcel,importExcel} from '../assets/exampool/sheet/excel.js';
import {writeField} from '../assets/exampool/sheet/vertical.js';
import {questionFingerprint} from '../assets/exampool/sheet/typeset-model.js';
import {reviewVersion,changedComponents} from '../assets/exampool/authoring/review-version.js';
import {extractJson,parseAuthoringResponse,applyChanges,draftToChanges,checkAnswerStructure,resolveTarget} from '../assets/exampool/authoring/contract.js';
import {ensureAuthoring,syncRevision,restoreRevision,makeRequest,classifyResponse,storeProposal,applyProposal,rejectProposal,proposalChanges,recordReview,orphanBindings} from '../assets/exampool/authoring/session.js';
import {validateAuthoring} from '../assets/exampool/authoring/schema.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const roundtrip=d=>exportExcel(XLSX,JSZip,d).then(bytes=>importExcel(XLSX,JSZip,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
// 수능형 역학 합답형 예시(두 물체 v-t). 참: ㄱ, ㄴ / 거짓: ㄷ → 정답 ③ ㄱ, ㄴ.
function mechanics(){
  const q=newQuestion('1','합답형','그림');
  for(const [k,v] of [['passage','그림은 직선 위에서 운동하는 물체 A, B의 속도를 시간에 따라 나타낸 것이다.'],['ask','이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?'],
    ['bogi','0초부터 2초까지 A의 가속도의 크기는 일정하다.\n2초일 때 속력은 B가 A보다 크다.\n0초부터 4초까지 이동한 거리는 A가 B보다 크다.'],['choices','ㄱ\nㄷ\nㄱ, ㄴ\nㄴ, ㄷ\nㄱ, ㄴ, ㄷ'],['answer','3']])writeField(q,k,v);
  q.explanation='ㄱ: 기울기가 일정. ㄴ: 2초에서 B의 속도가 더 크다. ㄷ: 넓이는 B가 더 크다.';
  return q;
}
const solved={statements:[{target:'ㄱ',truth:true},{target:'ㄴ',truth:true},{target:'ㄷ',truth:false}],answer:3};
test('검토 버전은 정답 변경을 잡지만 조판 지문은 잡지 않는다',async()=>{
  const q=mechanics(),f1=await questionFingerprint(q),v1=await reviewVersion(q);
  q.answer=0;const f2=await questionFingerprint(q),v2=await reviewVersion(q);
  assert.equal(f1,f2,'조판 지문은 정답을 보지 않는다(기존 설계)');
  assert.notEqual(v1.version,v2.version);assert.deepEqual(changedComponents(v1.hashes,v2.hashes),['answer']);
  q.choiceLayout='2열';assert.equal((await reviewVersion(q)).version,v2.version,'선지 배열(표시 서식)은 검토 버전에 들어가지 않는다');
  ensureAuthoring(q).target={subject:'물리학Ⅰ'};assert.equal((await reviewVersion(q)).version,v2.version,'AI가 출제 대상을 기록해도 새 버전이 생기지 않는다');
});
test('버전 기록: 시작 상태 → 직접 수정 → 영향 표시 → 지난 검토 무효화',async()=>{
  const q=mechanics();let r=await syncRevision(q);assert.equal(r.changed,false);assert.equal(q.authoring.revision,0);assert.equal(q.authoring.history[0].by,'import');
  recordReview(q,{reply:'',review:{axes:{answer:{status:'pass'},curriculum:{status:'pass'}}},solve:solved});
  assert.equal(q.authoring.review.axes.answer.status,'pass');
  q.blocks.find(b=>b.kind==='bogi').lines[1].text='2초일 때 속력은 A가 B보다 크다.';
  r=await syncRevision(q,{by:'teacher'});assert.equal(r.revision,1);
  assert.deepEqual(q.authoring.stale.map(s=>s.target).sort(),['answer','explanation']);
  assert.equal(q.authoring.review.axes.answer.status,'stale','내용이 바뀌면 지난 통과를 그대로 두지 않는다');
  assert.equal(q.authoring.review.axes.scope.status,'none','검토하지 않은 축은 미검토로 남는다');
  q.answer=0;r=await syncRevision(q);assert.deepEqual(q.authoring.stale.map(s=>s.target),['explanation'],'정답을 고치면 정답 표시는 지워지고 해설만 남는다');
  q.answer=2;await syncRevision(q);recordReview(q,{reply:'',review:{axes:{answer:{status:'pass'}}},solve:{statements:[{target:'ㄱ',truth:true},{target:'ㄴ',truth:false},{target:'ㄷ',truth:false}]}});
  assert.equal(q.authoring.review.axes.answer.status,'issue','바뀐 ㄴ을 거짓으로 풀면 ㄱ만 → 선지 ①인데 정답 ③이라 통과가 아니다');
  recordReview(q,{reply:'',review:{axes:{answer:{status:'pass'}}},solve:{statements:[{target:'ㄱ',truth:true},{target:'ㄴ',truth:true},{target:'ㄷ',truth:false}]}});
  assert.deepEqual(q.authoring.stale,[],'지금 버전의 정답 검토가 통과하면 정답·해설 다시 확인 표시를 지운다');
  validateAuthoring(q.authoring);
});
test('되돌리기는 옛 기록을 지우지 않고 새 버전을 만든다',async()=>{
  const q=mechanics();await syncRevision(q);const original=q.ask;
  q.ask='이에 대한 설명으로 옳지 않은 것만을 <보기>에서 있는 대로 고른 것은?';await syncRevision(q);
  restoreRevision(q,0);const r=await syncRevision(q,{by:'revert',summary:'0번 버전으로 되돌림'});
  assert.equal(q.ask,original);assert.equal(r.revision,2);assert.deepEqual(q.authoring.history.map(h=>h.by),['import','teacher','revert']);
});
test('늦은 응답·중복·삭제·취소는 현재 문항을 덮어쓰지 않는다',async()=>{
  const q=mechanics();await syncRevision(q);const req=makeRequest(q,'chat');
  assert.equal(classifyResponse(q,req),'current');
  q.explanation+=' 보충';await syncRevision(q);
  assert.equal(classifyResponse(q,req),'stale','대기 중 직접 수정하면 지난 응답이 된다');
  assert.equal(classifyResponse(null,req),'gone');
  assert.equal(classifyResponse(q,req,{seen:new Set([req.requestId])}),'duplicate');
  assert.equal(classifyResponse(q,req,{cancelled:new Set([req.requestId])}),'cancelled');
  const p=storeProposal(q,req,{summary:'ㄷ 수정',changes:[{path:'bogi',line:'ㄷ',value:'바뀐 ㄷ'}]},'stale');
  assert.throws(()=>applyProposal(q,p.id),/문항이 바뀌었습니다/);
  assert.equal(q.blocks.find(b=>b.kind==='bogi').lines[2].text.startsWith('0초부터'),true,'막힌 변경안은 문항을 바꾸지 않는다');
  applyProposal(q,storeProposal(q,makeRequest(q,'chat'),{summary:'확인',changes:[{path:'bogi',line:'ㄷ',value:'바뀐 ㄷ'}]}).id);
  assert.equal(q.blocks.find(b=>b.kind==='bogi').lines[2].text,'바뀐 ㄷ');
  assert.equal(rejectProposal(q,p.id),true);assert.equal(q.authoring.proposals.length,0);
});
test('응답 계약: JSON 꺼내기·형식 검사·초안을 실제 칸으로',()=>{
  assert.deepEqual(extractJson('설명입니다.\n```json\n{"reply":"네 {괄호}","x":1}\n```'),{reply:'네 {괄호}',x:1});
  assert.equal(parseAuthoringResponse('그냥 글').ok,false);
  // M24: 형식 검사를 통과한 답이 화면 반영에서 예외를 내면 답 전체가 사라졌다 → 반영에서 터질 모양은 검사에서 막는다.
  for(const bad of ['{"reply":"r","figures":[{"kind":"graph","description":"d","mustNot":"x"}]}','{"reply":"r","review":{"items":[null]}}','{"reply":"r","figures":[{"kind":"image","description":"d","slot":3}]}'])assert.equal(parseAuthoringResponse(bad).ok,false,bad);
  assert.equal(parseAuthoringResponse('{"reply":"r","figures":[{"kind":"graph","description":"d","mustNot":["x"],"slot":"그림1"}],"review":{"items":[{"target":"ask"}]}}').ok,true);
  const bad=parseAuthoringResponse('{"reply":"r","review":{"axes":{"answer":{"status":"maybe"}}}}');assert.equal(bad.ok,false);
  const q=newQuestion('1','합답형','글·수식');
  const changes=draftToChanges(q,{passage:'지문',ask:'옳은 것만을 <보기>에서 있는 대로 고른 것은?',bogi:['ㄱ. 가','ㄴ. 나','ㄷ. 다'],choices:['ㄱ','ㄷ','ㄱㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'],answer:3,explanation:'해설'});
  const {question,errors}=applyChanges(q,changes);assert.deepEqual(errors,[]);
  assert.deepEqual(question.blocks.find(b=>b.kind==='bogi').lines.map(l=>l.text),['가','나','다']);
  assert.equal(question.choices[2].text,'ㄱ, ㄴ');assert.equal(question.answer,2);assert.equal(q.ask,'','원본은 그대로');
  assert.equal(resolveTarget(question,'ㄴ'),'line:'+question.blocks.find(b=>b.kind==='bogi').lines[1].id);
  assert.equal(resolveTarget(question,'③'),'choice:'+question.choices[2].id);
  const l2='line:'+question.blocks.find(b=>b.kind==='bogi').lines[1].id;for(const t of ['초안 ㄴ','보기 ㄴ','(ㄴ)','ㄴ.'])assert.equal(resolveTarget(question,t),l2,t);
  assert.equal(resolveTarget(question,'3번'),'choice:'+question.choices[2].id);assert.equal(resolveTarget(question,'선지 ③'),'choice:'+question.choices[2].id);
  assert.match(applyChanges(q,[{path:'answer',value:7}]).errors[0].message,/1~5/);
  // M22: 순서가 뒤섞인 합답형 선지를 쓰면 관례 순서로 다시 놓이고, 정답은 AI가 고른 그 조합을 따라가야 한다.
  const mixed=applyChanges(q,draftToChanges(q,{choices:['ㄱ, ㄴ','ㄱ','ㄴ','ㄷ','ㄱ, ㄴ, ㄷ'],answer:1}));assert.deepEqual(mixed.errors,[]);
  assert.deepEqual(mixed.question.choices.map(c=>c.text),['ㄱ','ㄴ','ㄷ','ㄱ, ㄴ','ㄱ, ㄴ, ㄷ']);assert.equal(mixed.question.choices[mixed.question.answer].text,'ㄱ, ㄴ');
  const later=applyChanges(q,[{path:'answer',value:1},{path:'choices',value:'ㄱ, ㄴ\nㄱ\nㄴ\nㄷ\nㄱ, ㄴ, ㄷ'}]);assert.equal(later.question.choices[later.question.answer].text,'ㄱ, ㄴ','정답이 먼저 와도 같은 조합');
});
test('정답 구조: 누락·중복 조합, 정답 불일치, 부정 발문',()=>{
  const q=mechanics();assert.equal(checkAnswerStructure(q,solved).ok,true);
  const missing=mechanics();writeField(missing,'choices','ㄱ\nㄷ\nㄱ, ㄷ\nㄴ, ㄷ\nㄱ, ㄴ, ㄷ');assert.ok(checkAnswerStructure(missing,solved).problems.some(p=>p.code==='missing-combo'));
  const dup=mechanics();dup.choices[1].text='ㄱ, ㄴ';assert.ok(checkAnswerStructure(dup,solved).problems.some(p=>p.code==='duplicate-combo'||p.code==='duplicate-choice'));
  const wrong=mechanics();wrong.answer=4;assert.ok(checkAnswerStructure(wrong,solved).problems.some(p=>p.code==='answer-mismatch'));
  const neg=mechanics();neg.ask='이에 대한 설명으로 옳지 않은 것만을 <보기>에서 있는 대로 고른 것은?';neg.answer=1;// 거짓은 ㄷ → ②
  const r=checkAnswerStructure(neg,solved);assert.equal(r.ok,true,JSON.stringify(r.problems));assert.ok(r.notes.some(n=>n.code==='negative-ask'));
  assert.ok(checkAnswerStructure(q,null).notes.some(n=>n.code==='combo-unchecked'),'다시 풀지 않았으면 확인하지 않았다고 말한다');
});
test('검토 기록 직후 문항이 그대로면 변경안은 지난 변경안이 되지 않는다',async()=>{
  const q=mechanics();await syncRevision(q);const req=makeRequest(q,'chat');
  recordReview(q,{reply:'',target:{subject:'물리학Ⅰ',curriculum:'2022'},requirements:{explicit:['수능형'],assumed:[],pending:[]}});
  const p=storeProposal(q,req,{summary:'s',changes:[{path:'ask',value:'x'}]});const r=await syncRevision(q);
  assert.equal(r.changed,false);assert.equal(q.authoring.proposals.find(x=>x.id===p.id).state,'current');
  assert.equal(classifyResponse(q,req,{currentHash:(await reviewVersion(q)).version}),'current');
});
test('검토 기록: 그림 없이 그림 통과 금지, 검색에 없는 근거는 미확보',async()=>{
  const q=mechanics();await syncRevision(q);
  const evidence=new Map([['ev-1',{kind:'curriculum',title:'2022 물리학Ⅰ [12물리01-02]',quote:'속도-시간 그래프',sha256:'a'.repeat(64),page:12}]]);
  recordReview(q,{reply:'',review:{axes:{figure:{status:'pass'},answer:{status:'pass'}}},solve:solved,evidenceUsed:[{ref:'ev-1',target:'ㄱ',judgement:'direct',claim:'가속도는 v-t 기울기'},{ref:'made-up',target:'ㄴ',judgement:'direct',claim:'지어낸 출처'}]},{evidence});
  assert.equal(q.authoring.review.axes.figure.status,'unverified');assert.equal(q.authoring.review.axes.answer.status,'pass');
  const withFig=mechanics();withFig.blocks.find(b=>b.kind==='figure').figure={name:'f.png',data:'data:image/png;base64,AAAA'};await syncRevision(withFig);
  recordReview(withFig,{reply:'',review:{axes:{figure:{status:'pass'}}}});assert.equal(withFig.authoring.review.axes.figure.status,'unverified','그림 칸이 있어도 AI가 그림을 받지 않았으면 통과가 아니다');
  recordReview(withFig,{reply:'',review:{axes:{figure:{status:'pass'}}}},{figuresSeen:true});assert.equal(withFig.authoring.review.axes.figure.status,'pass');
  assert.equal(q.authoring.evidence[0].judgement,'direct');assert.equal(q.authoring.evidence[0].source.page,12);
  assert.equal(q.authoring.evidence[1].judgement,'missing');assert.equal(q.authoring.evidence[1].source,null);
  const wrong=mechanics();await syncRevision(wrong);wrong.answer=0;await syncRevision(wrong);recordReview(wrong,{reply:'',review:{axes:{answer:{status:'pass'}}},solve:solved});
  assert.equal(wrong.authoring.review.axes.answer.status,'issue','코드 검사가 정답 불일치를 찾으면 통과로 두지 않는다');
});
test('저장 검증·엑셀 왕복·복제에서 출제 기록이 남는다',async()=>{
  const q=mechanics();await syncRevision(q);
  recordReview(q,{reply:'',requirements:{explicit:['수능형'],assumed:['2022 개정 물리학Ⅰ'],pending:['실제 시험 범위']},review:{axes:{answer:{status:'pass',note:'다시 풂'}}},solve:solved,
    evidenceUsed:[{ref:'ev-1',target:'ㄱ',judgement:'conditional',claim:'등가속도 구간에서만',condition:'0~2초'}]},{evidence:new Map([['ev-1',{kind:'textbook',title:'교과서 48쪽',page:48,bbox:[1,2,3,4]}]])});
  const data={format:FORMAT,questions:[q],documents:[]};validate(data);
  const back=(await roundtrip(data)).questions[0];
  assert.deepEqual(back.authoring.evidence,q.authoring.evidence,'판정·조건·쪽·좌표가 엑셀 왕복에서 사라지지 않는다');
  assert.deepEqual(back.authoring.requirements,q.authoring.requirements);assert.equal(back.authoring.review.axes.answer.status,'pass');
  const copy=duplicateQuestion(back),line=copy.blocks.find(b=>b.kind==='bogi').lines[0];
  assert.equal(copy.authoring.evidence[0].target,'line:'+line.id,'복제본의 근거는 복제본의 보기에 연결된다');
  assert.equal(copy.authoring.history.length,0);assert.notEqual(copy.authoring.sessionId,q.authoring.sessionId);
  validate({format:FORMAT,questions:[q,copy],documents:[]});
  const bad=structuredClone(q);bad.authoring.evidence[0].judgement='true';assert.throws(()=>validate({format:FORMAT,questions:[bad],documents:[]}),/출제 기록/);
  q.blocks.find(b=>b.kind==='bogi').lines.pop();assert.equal(orphanBindings(q).length,0);
  const removed=mechanics();await syncRevision(removed);removed.authoring.evidence.push({id:'x',target:'line:gone',claim:'c',judgement:'direct',by:'ai',reviewVersion:null,source:null});
  assert.equal(orphanBindings(removed).length,1,'대상이 사라진 근거는 지우지 않고 표시한다');
});
test('그래프·자료 조건이 바뀌면 연결한 그림은 다시 확인 대상이 된다',async()=>{
  const q=mechanics(),fig=q.blocks.find(b=>b.kind==='figure');fig.figure={name:'vt.png',data:'data:image/png;base64,AAAA',editable:{objects:[{type:'coordplane'}]}};
  await syncRevision(q);ensureAuthoring(q).figures.push({blockId:fig.id,kind:'graph',description:'A·B v-t',resultHash:null,editable:true,revision:0});
  writeField(q,'passage','그림은 직선 위에서 운동하는 물체 A, B의 속도를 시간에 따라 나타낸 것이다. B는 2초부터 등속이다.');await syncRevision(q);
  assert.ok(q.authoring.stale.some(s=>s.target==='figure:'+fig.id),'조건만 바꾸고 그래프를 그대로 두면 그래프를 다시 확인하라고 표시한다');
  fig.figure={...fig.figure,editable:{objects:[{type:'coordplane',v:2}]}};await syncRevision(q);
  assert.ok(!q.authoring.stale.some(s=>s.target==='figure:'+fig.id),'그래프를 고치면 표시가 지워진다');
  const pic=block('figure',null,'그림');q.blocks.push(pic);pic.figure={name:'p.png',data:'data:image/png;base64,BBBB'};await syncRevision(q);
  assert.ok(!q.authoring.stale.some(s=>s.target==='figure:'+fig.id),'다른 그림 칸을 더해도 그래프의 조건 변경으로 보지 않는다');
  assert.ok(q.authoring.stale.some(s=>s.target==='answer'),'그림이 더해지면 정답은 다시 확인한다');
  assert.ok(proposalChanges(q,{draft:{ask:'x'},changes:[{path:'answer',value:2}]}).length===2);
});

test('history keeps one copy of a large figure even with editable png/source (H8): 25 edits stay far below the 24 MB limit and revert restores it', async () => {
  const q=newQuestion('1');const fig=block('figure');
  const png='data:image/png;base64,'+'A'.repeat(1_000_000);
  fig.figure={name:'그림',data:png,editable:{png,source:{pages:[{objects:[{type:'image',href:png}]}]}}};
  q.blocks.push(fig);await syncRevision(q,{by:'import'});
  for(let i=0;i<25;i++){q.ask=`발문 ${i}`;await syncRevision(q,{by:'teacher'});}
  const bytes=JSON.stringify(q.authoring).length;
  assert.ok(bytes<4_000_000,`history stays small (${bytes} bytes), not 25 copies of a 1 MB figure`);
  validateAuthoring(q.authoring);
  const first=q.authoring.history[0].revision;q.blocks.find(b=>b.kind==='figure').figure=null;restoreRevision(q,first);
  const back=q.blocks.find(b=>b.kind==='figure').figure;
  assert.equal(back.data,png);assert.equal(back.editable.png,png);assert.equal(back.editable.source.pages[0].objects[0].href,png);
});

test('요청문에 대응표 선지와 그림 선지가 들어간다(M23)', async () => {
  const {describeQuestion} = await import('../assets/exampool/authoring/prompt.js');
  const t = newQuestion('1'); t.style = '대응표'; t.choiceTable.cells[1][1].value = '증가';
  assert.match(describeQuestion(t), /선지\(대응표[^\n]*\n[\s\S]*증가/);
  const f = newQuestion('2'); f.choices[2].figure = {name: 'c.png', data: 'data:image/png;base64,AAAA'};
  assert.match(describeQuestion(f), /③ \[그림 선지 · 첨부 「선지 ③」\]/);
});
