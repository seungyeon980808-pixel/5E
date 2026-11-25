// 1.8.0 출제 하네스 데이터 모듈(assets/harness/model) — 화면 없는 단위 검사.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {newQuestion,validate,block} from '../assets/exampool/sheet/model.js';
import {writeField} from '../assets/exampool/sheet/vertical.js';
import {ensureAuthoring} from '../assets/exampool/authoring/session.js';
import * as M from '../assets/harness/model/examset.js';
import {buildExamsetFile,parseExamsetFile,peekKind} from '../assets/harness/model/file.js';
import {hwpxText,diffAgainst,sectionParagraphs} from '../assets/harness/model/hwpx.js';
import {zipStore,unzipStore} from '../js/backup-zip.js';
import {buildFiveEProject} from '../js/fivee-project.js';

const STAR='/Users/parkseungyeon/Work/2026-11-15_별과우주-재출제/초안/5e/별과우주_기말_5차.exampool';

function combo(no,{ask='이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',passage='그림은 별 A와 B를 나타낸 것이다.',bogi=['A는 B보다 밝다.','A의 표면 온도는 B보다 높다.','A와 B의 거리는 같다.'],answer=3,points=3}={}){
  const q=newQuestion(String(no),'합답형','글·수식');
  writeField(q,'passage',passage);writeField(q,'ask',ask);writeField(q,'bogi',bogi.join('\n'));
  writeField(q,'choices','ㄱ\nㄷ\nㄱ, ㄴ\nㄴ, ㄷ\nㄱ, ㄴ, ㄷ');writeField(q,'answer',String(answer));q.points=points;
  q.explanation='ㄱ. 맞다.\nㄴ. 맞다.\nㄷ. 틀리다.';
  return q;
}
function single(no,{ask='다음 중 옳은 것은?',passage='연주 시차는 별까지의 거리를 재는 방법이다.',choices=['가','나','다','라','마'],answer=1,points=2}={}){
  const q=newQuestion(String(no),'객관식','글·수식');
  writeField(q,'passage',passage);writeField(q,'ask',ask);writeField(q,'choices',choices.join('\n'));writeField(q,'answer',String(answer));q.points=points;return q;
}
// 그림: PNG 머리 + 무작위 바이트(내용이 다르면 해시가 다름).
function png(seed,len=6000){const b=new Uint8Array(len);b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);let x=seed*2654435761>>>0;for(let i=8;i<len;i++){x=(x*1103515245+12345)>>>0;b[i]=x>>>24;}
  return 'data:image/png;base64,'+Buffer.from(b).toString('base64');}
function withFigure(q,data){const b=block('figure');b.figure={name:'그림.png',data};q.blocks.push(b);q.preset='그림';return b;}

test('새 시험지: 빈 칸·막는 칸 4개', ()=>{
  const w=M.newExamset({title:'2학기 기말'});
  assert.equal(w.kind,'examset');assert.equal(w.schema,1);assert.equal(w.meta.title,'2학기 기말');assert.equal(w.meta.stage,'design');
  for(const k of ['plan','items','questions','comments','sessions','chat','jobs','checks','outputs','imports','versions'])assert.deepEqual(w[k],[]);
  assert.deepEqual(w.rules,{exam:[],applied:[]});assert.equal(w.head,null);assert.equal(w.dirty,false);
  assert.deepEqual(M.missingBlocking(w),['subject','range','itemCount','pointsTotal']);
  M.setMeta(w,'subject','별과우주');M.setMeta(w,'itemCount',16);
  M.setMeta(w,'range',{units:[],standards:[]},'ai');
  assert.deepEqual(M.missingBlocking(w),['range','pointsTotal'],'빈 범위는 아직 정하지 않은 것');
  M.setMeta(w,'range',{units:['별의 거리'],standards:[]},'ai');M.setMeta(w,'pointsTotal',50);
  assert.deepEqual(M.missingBlocking(w),[]);assert.equal(w.dirty,true);
});

test('경계 규칙: AI는 자기가 정했고 선생님이 안 본 값만 바꾼다', ()=>{
  const w=M.newExamset();
  assert.equal(M.canAiChange(w.meta.difficulty),true,'빈 칸은 AI가 처음 채울 수 있다');
  assert.equal(M.setMeta(w,'difficulty',{상:4},'ai'),true);assert.equal(M.canAiChange(w.meta.difficulty),true);
  assert.equal(M.setMeta(w,'difficulty',{상:5},'ai'),true);
  M.markSeen(w,['difficulty']);assert.equal(M.canAiChange(w.meta.difficulty),false);
  assert.equal(M.setMeta(w,'difficulty',{상:6},'ai'),false);assert.deepEqual(w.meta.difficulty.value,{상:5});
  M.setMeta(w,'pointKinds',[2,3,4]);assert.equal(w.meta.pointKinds.by,'teacher');
  assert.equal(M.canAiChange(w.meta.pointKinds),false);assert.equal(M.setMeta(w,'pointKinds',[3],'ai'),false);
  assert.equal(M.canAiChange({value:1,by:'ai',seen:false}),true);assert.equal(M.canAiChange({value:1,by:'teacher',seen:false}),false);
});

test('설계표: 안 본 AI 행만 덮어쓰고, 본 행은 제안으로', ()=>{
  const w=M.newExamset();
  let r=M.setPlanRows(w,[{no:1,unit:'연주 시차',figure:'reuse',status:'set'},{no:2,unit:'등급',status:'choosing'}],'ai');
  assert.deepEqual(r,{applied:[1,2],proposals:[]});
  M.markPlanSeen(w,[1]);
  r=M.setPlanRows(w,[{no:1,unit:'연주 시차 계산'},{no:2,unit:'등급과 거리'},{no:3,unit:'허블 법칙'}],'ai');
  assert.deepEqual(r.applied,[2,3]);assert.equal(r.proposals.length,1);
  assert.equal(r.proposals[0].no,1);assert.equal(r.proposals[0].before.unit,'연주 시차');assert.equal(r.proposals[0].after.unit,'연주 시차 계산');
  assert.equal(w.plan.find(x=>x.no===1).unit,'연주 시차','본 행은 그대로');
  r=M.setPlanRows(w,[{no:1,unit:'선생님 단원'}],'teacher');assert.deepEqual(r.applied,[1]);
  assert.equal(w.plan[0].by,'teacher');assert.equal(w.plan[0].seen,true);
  const q=newQuestion('1');M.addQuestion(w,q,{planNo:2});
  assert.equal(w.plan.find(x=>x.no===2).qid,q.id);assert.deepEqual(q.origin,{by:'ai',planNo:2});assert.equal(q.seen,false);assert.deepEqual(q.locks,[]);
  M.setPlanRows(w,[{no:2,unit:'다시'}],'ai');assert.equal(w.plan.find(x=>x.no===2).qid,q.id,'덮어써도 문항 연결은 남는다');
  assert.deepEqual(M.orderedQuestions(w).map(x=>x.id),[q.id]);
});

test('칸 주소와 해설 칸 고정 id', ()=>{
  const q=combo(1),keys=M.cellKeys(q).map(k=>k.key);
  const bogi=q.blocks.find(b=>b.kind==='bogi');
  assert.ok(keys.includes('question')&&keys.includes('ask')&&keys.includes('answer')&&keys.includes('meta'));
  assert.ok(!keys.includes('block:'+bogi.id),'보기 상자는 칸이 아니다(줄이 칸)');
  for(const l of bogi.lines)assert.ok(keys.includes('line:'+l.id));
  for(const c of q.choices)assert.ok(keys.includes('choice:'+c.id));
  const expl=keys.filter(k=>k.startsWith('expl:'));assert.equal(expl.length,3);
  assert.deepEqual(M.cellKeys(q).filter(k=>k.key.startsWith('expl:')).map(k=>k.key),expl,'다시 불러도 같은 id');
  // 해설 글을 통째로 바꿔도 같은 보기 글자의 칸은 id를 이어받는다.
  const before=q.explanationParts.map(p=>p.id);q.explanation='ㄱ. 새 해설.\nㄴ. 새.\nㄷ. 새.';M.resplitExplanation(q);
  assert.deepEqual(q.explanationParts.map(p=>p.id),before);assert.equal(q.explanationParts[0].text,'새 해설.');
});

test('근거 상태 4가지와 예외', ()=>{
  const q=combo(1),a=ensureAuthoring(q),line=q.blocks.find(b=>b.kind==='bogi').lines;
  const ev=(target,judgement)=>a.evidence.push({id:'e-'+target+judgement,target,claim:'주장',judgement,by:'ai',source:null});
  assert.equal(M.cellEvidence(q,'ask'),'missing');
  ev('ask','missing');assert.equal(M.cellEvidence(q,'ask'),'missing');
  ev('ask','direct');assert.equal(M.cellEvidence(q,'ask'),'ok');
  ev('line:'+line[0].id,'derived');assert.equal(M.cellEvidence(q,'line:'+line[0].id),'ok');
  ev('line:'+line[1].id,'refuted');assert.equal(M.cellEvidence(q,'line:'+line[1].id),'problem');
  ev('line:'+line[1].id,'direct');assert.equal(M.cellEvidence(q,'line:'+line[1].id),'problem','반박이 있으면 지지 근거가 있어도 문제');
  M.addWaiver(q,'line:'+line[2].id,{reason:'수업 시간에 실험으로 다룸'});assert.equal(M.cellEvidence(q,'line:'+line[2].id),'waived');
  ev('answer','missing');M.addWaiver(q,'answer',{reason:'예외'});assert.equal(a.evidence.filter(e=>e.target==='answer').length,1,'있던 근거 미확보 항목에 붙인다');
  assert.equal(M.cellEvidence(q,'answer'),'waived');
  validate({format:'5e-question-sheet-v2',questions:[q],documents:[]});
});

test('코멘트 대장: new → talk → decided → applied, 결정된 것만 반영·잠긴 칸 건너뜀', ()=>{
  const w=M.newExamset({title:'t'}),q1=combo(1),q2=single(2);
  M.addQuestion(w,q1);M.addQuestion(w,q2);M.commitVersion(w,{summary:'첫 판'});
  const bogi=q1.blocks.find(b=>b.kind==='bogi');
  const c1=M.addComment(w,{qid:q1.id,text:'ㄷ 문장을 고쳐 주세요'});
  const c2=M.addComment(w,{qid:q2.id,text:'발문을 바꾸면?'});
  const c3=M.addComment(w,{qid:q1.id,text:'발문 다듬기'});
  assert.equal(w.comments[0].onVersion,'v0.1');assert.deepEqual(M.commentCounts(w),{new:3,talk:0,decided:0,applied:0,dropped:0});
  M.updateComment(w,c1,{status:'talk',split:[{target:'line:'+bogi.lines[2].id,gist:'ㄷ 고침'}]});
  const p1=M.addProposal(w,{qid:q1.id,changes:[{path:'bogi',line:'ㄷ',value:'A와 B의 거리는 다르다.'},{path:'answer',value:4}],summary:'ㄷ 고침',comments:[c1]});
  const p2=M.addProposal(w,{qid:q2.id,changes:[{path:'ask',value:'다음 중 옳지 않은 것은?'}],comments:[c2]});
  const p3=M.addProposal(w,{qid:q1.id,changes:[{path:'ask',value:'고친 발문'},{path:'points',value:4}],comments:[c3]});
  const P=id=>w.proposals.find(p=>p.id===id);
  assert.deepEqual(P(p1).before,['A와 B의 거리는 같다.',3]);assert.deepEqual(w.comments[0].proposals,[p1]);
  // 선생님이 q1 발문을 직접 고쳐 잠갔다.
  M.lockCell(w.questions[0],'ask');
  M.updateComment(w,c1,{status:'decided'});M.setProposalState(w,p1,'agreed');
  M.updateComment(w,c3,{status:'decided'});
  // c2는 의논 중: 반영하지 않는다.
  M.updateComment(w,c2,{status:'talk'});
  assert.deepEqual(M.commentCounts(w),{new:0,talk:1,decided:2,applied:0,dropped:0});
  const r=M.applyDecided(w);
  assert.deepEqual(r.changedQids,[q1.id]);assert.deepEqual(r.errors,[]);
  assert.equal(r.skipped.length,2,'잠긴 발문을 건드리는 변경 두 개(발문·배점)는 건너뜀');
  assert.ok(r.skipped.every(s=>s.proposal===p3&&s.locks.includes('ask')));
  const nq1=M.questionById(w,q1.id);
  assert.equal(nq1.blocks.find(b=>b.kind==='bogi').lines[2].text,'A와 B의 거리는 다르다.');assert.equal(nq1.answer,3);
  assert.equal(nq1.ask,q1.ask);assert.equal(nq1.points,3);assert.deepEqual(nq1.locks.map(l=>l.key),['ask'],'하네스 칸은 남는다');
  assert.equal(M.questionById(w,q2.id).ask,'다음 중 옳은 것은?','의논 중인 코멘트의 제안은 반영 안 함');
  assert.equal(P(p1).state,'applied');assert.equal(P(p2).state,'current');assert.equal(P(p3).state,'current');
  assert.equal(w.comments.find(c=>c.id===c1).status,'applied');assert.equal(w.comments.find(c=>c.id===c3).status,'decided','건너뛴 변경이 있으면 결정됨으로 남김');
  assert.deepEqual(r.applied,{proposals:[p1],comments:[c1]});
  const v=M.commitVersion(w,{summary:'코멘트 반영',applied:r.applied});
  assert.equal(v.label,'v0.2');assert.deepEqual(v.changed,[q1.id]);assert.equal(w.comments.find(c=>c.id===c1).appliedIn,'v0.2');
  assert.deepEqual(M.commentCounts(w),{new:0,talk:1,decided:1,applied:1,dropped:0});
});

test('판 이름', ()=>{
  assert.equal(M.nextLabel(null),'v0.1');assert.equal(M.nextLabel('v0.1'),'v0.2');assert.equal(M.nextLabel('v0.9'),'v0.10');
  assert.equal(M.nextLabel('v0.10'),'v0.11');assert.equal(M.nextLabel('v1.0'),'v1.1');
  const w=M.newExamset();M.addQuestion(w,single(1));for(let i=0;i<9;i++)M.commitVersion(w);
  assert.equal(w.head,'v0.9');M.commitVersion(w);assert.equal(w.head,'v0.10');
  assert.equal(M.declareFinal(w).label,'v1.0');assert.equal(w.meta.stage,'final');
  assert.equal(M.commitVersion(w).label,'v1.1');assert.equal(M.declareFinal(w).label,'v2.0');
});

test('통계: 정답 배열·개수·연속·배점', ()=>{
  const qs=[3,3,4,4,3,2,4,1,2,5,5,1,2,1,2,5].map((a,i)=>single(i+1,{answer:a,points:[3,4,4,3,3,4,4,3,4,4,3,2,2,2,3,2][i]}));
  const s=M.computeStats(qs);
  assert.deepEqual(s.answers,[3,3,4,4,3,2,4,1,2,5,5,1,2,1,2,5]);
  assert.deepEqual(s.countByNumber,{1:3,2:4,3:3,4:3,5:3});assert.equal(s.longestRun,2);
  assert.equal(s.pointsTotal,50);assert.deepEqual(s.pointsByKind,{2:4,3:6,4:6});
  const e=newQuestion('17','서술형');e.points=5;
  const t=M.computeStats([single(1,{answer:2}),single(2,{answer:2}),single(3,{answer:2}),e]);
  assert.deepEqual(t.answers,[2,2,2,null]);assert.equal(t.longestRun,3);assert.equal(t.pointsTotal,11);
});

test('판 스냅숏에는 수정 이력·bank가 없고, 되돌리기는 판을 남긴다', ()=>{
  const w=M.newExamset({title:'t'}),q=combo(1);M.addQuestion(w,q);
  const a=ensureAuthoring(q);a.history.push({revision:0,by:'import',summary:'x',snapshot:{},version:null});a.bank['a'.repeat(64)]={data:'x'};
  M.setMeta(w,'subject','별과우주');
  const v1=M.commitVersion(w,{summary:'첫 판'});
  const sq=v1.snapshot.questions[0];
  assert.equal(sq.authoring.history,undefined);assert.equal(sq.authoring.bank,undefined);
  assert.equal(q.authoring.history.length,1,'작업 상태의 이력은 그대로');
  assert.equal(v1.stats.answers[0],3);assert.equal(v1.from,null);assert.equal(w.dirty,false);
  q.ask='바뀐 발문';M.setMeta(w,'subject','물리');M.commitVersion(w);
  assert.equal(w.versions[1].from,'v0.1');assert.deepEqual(w.versions[1].changed,[q.id]);
  M.restoreVersion(w,'v0.1');
  assert.equal(w.questions[0].ask,'이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?');assert.equal(w.meta.subject.value,'별과우주');
  assert.equal(w.versions.length,2);assert.equal(w.head,'v0.2');assert.equal(w.dirty,true);
  w.questions[0].ask='또';assert.notEqual(w.versions[0].snapshot.questions[0].ask,'또','되돌린 뒤 고쳐도 판은 그대로');
});

test('규칙 3층과 풀이 검사 판정', ()=>{
  const w=M.newExamset();M.setMeta(w,'subject','별과우주');
  const g=M.addRule(w,{layer:'global',text:'선지는 크게 벌린다'}),s=M.addRule(w,{layer:'subject',text:'연주 시차는 100 pc 이내'}),o=M.addRule(w,{layer:'subject',subject:'물리',text:'x'});
  const e=M.addRule(w,{layer:'exam',text:'켈빈은 쓰지 않는다',from:{comment:'c-1'}});
  assert.deepEqual(w.rules.exam.map(r=>r.id),[e.id]);assert.equal(s.subject,'별과우주');
  assert.deepEqual(M.applyRulesSnapshot(w,[g,s,o]).map(r=>r.id),[g.id,s.id,e.id]);
  assert.equal(M.verdictOf(4,[{answer:4},{answer:4}]),'pass');assert.equal(M.verdictOf(4,[{answer:4},{answer:2}]),'doubt');
  assert.equal(M.verdictOf(4,[{answer:1},{answer:2}]),'fail');assert.equal(M.verdictOf(4,[{answer:4}]),'single');assert.equal(M.verdictOf(4,[]),'skipped');
  const q=single(1,{answer:3});M.addQuestion(w,q);
  const id=M.recordCheck(w,{qid:q.id,contentHash:'h',runs:[{provider:'codex',model:'a',answer:3,note:'정답 유일'}]});
  const c=w.checks.find(x=>x.id===id);assert.equal(c.verdict,'single');assert.equal(c.skipped,'두 번째 모델 없음');
});

test('toSheetBundle: exam이 읽는 묶음(validate 통과, 하네스 칸 없음)', ()=>{
  const w=M.newExamset({title:'2학기 기말'}),q1=combo(1),q2=single(2);withFigure(q2,png(1));
  M.addQuestion(w,q2);M.addQuestion(w,q1);M.lockCell(q1,'ask');M.addWaiver(q1,'ask',{reason:'r'});
  M.setMeta(w,'layout',{formId:'form-1'});
  const b=M.toSheetBundle(w);
  assert.equal(b.format,'5e-question-sheet-v2');assert.equal(b.scope,'exam');
  assert.deepEqual(b.questions.map(q=>q.id),[q2.id,q1.id]);assert.deepEqual(b.exams[0].items,[q2.id,q1.id]);
  assert.equal(b.exams[0].title,'2학기 기말');assert.equal(b.exams[0].formId,'form-1');
  for(const q of b.questions)for(const k of ['origin','seen','locks'])assert.equal(q[k],undefined);
  assert.ok(q1.locks.length,'작업 상태의 문항은 그대로');
  validate(structuredClone(b));
});

test('파일 왕복: 그림 든 문항 2판 → 저장 → 열기 → 같음, 같은 그림은 덩어리 하나', async()=>{
  const w=M.newExamset({title:'왕복'}),img=png(7),q1=combo(1),q2=single(2);
  withFigure(q1,img);withFigure(q2,img);q2.typeset={bytes:Buffer.from(new Uint8Array(9000).map((_,i)=>i*7)).toString('base64'),fingerprint:'f',baselineText:'',profile:{paper:'B4',columns:2}};
  M.addQuestion(w,q1);M.addQuestion(w,q2);M.setMeta(w,'subject','별과우주');
  M.commitVersion(w,{summary:'첫 판'});
  q1.ask='고친 발문';M.addComment(w,{qid:q1.id,text:'코멘트'});
  w.chat.push({session:'t-exam',role:'me',text:'안녕'},{session:'t-q1',role:'ai',text:'네'},{session:'t-exam',role:'ai',text:'좋아요'});
  M.recordCheck(w,{qid:q2.id,contentHash:'h',runs:[{provider:'codex',model:'a',answer:2,note:'긴 풀이 과정'},{provider:'codex',model:'b',answer:2,note:'또 다른 풀이'}]});
  M.commitVersion(w,{summary:'둘째 판'});q1.ask='판 뒤에 또 고침';w.dirty=true;
  const bytes=await buildExamsetFile(w);
  assert.equal(peekKind(bytes),'examset');
  const files=unzipStore(bytes,{maxEntryBytes:1e9,maxTotalBytes:1e9});
  const man=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
  assert.equal(man.kind,'examset');assert.equal(man.version,1);assert.equal(man.head,'v0.2');assert.equal(man.dirty,true);assert.equal(man.minApp,'1.8.0');
  assert.equal(man.blobs.filter(b=>b.mediaType==='image/png').length,1,'같은 그림은 두 문항·두 판에 있어도 하나');
  assert.equal(man.blobs.length,2,'그림 1 + 조판 덩어리 1');
  assert.ok(files.has('versions/v0.1.json')&&files.has('versions/v0.2.json'));
  assert.ok(!new TextDecoder().decode(files.get('versions/v0.1.json')).includes('base64,'),'판 JSON에 그림 글자가 없다');
  const wj=JSON.parse(new TextDecoder().decode(files.get('work.json')));assert.deepEqual(wj.versions,['v0.1','v0.2']);
  assert.equal(wj.checks[0].runs[0].note,undefined,'work.json에는 풀이 요약만');assert.ok(files.has(`checks/${w.checks[0].id}.json`));
  assert.ok(files.has('chat/t-exam.jsonl')&&files.has('chat/t-q1.jsonl'));
  const back=await parseExamsetFile(bytes);
  assert.deepEqual(back,JSON.parse(JSON.stringify(w)));
  assert.equal(back.versions[0].snapshot.questions[0].blocks.at(-1).figure.data,img);
  const again=await buildExamsetFile(back);assert.deepEqual(again,bytes,'다시 저장한 바이트가 같다');
  // 1.7.x 종류(sheet)는 거절
  const sheet=new Uint8Array(await buildFiveEProject({kind:'sheet',format:'5e-question-sheet-v2',questions:[],documents:[]}).arrayBuffer());
  await assert.rejects(()=>parseExamsetFile(sheet),/시험지\(출제\) 파일이 아닙니다/);
});

test('덩어리가 빠진 판만 못 읽음, 나머지는 열린다', async()=>{
  const w=M.newExamset({title:'빠짐'}),q=single(1);M.addQuestion(w,q);
  M.commitVersion(w,{summary:'그림 없음'});
  const fig=withFigure(q,png(3));M.commitVersion(w,{summary:'그림 넣음'});
  fig.figure.data=png(4);M.commitVersion(w,{summary:'그림 고침'});
  const bytes=await buildExamsetFile(w),files=unzipStore(bytes,{maxEntryBytes:1e9,maxTotalBytes:1e9});
  const man=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));assert.equal(man.blobs.length,2);
  // v0.2에만 쓰인 그림(png 3)의 덩어리를 뺀다.
  const {createHash}=await import('node:crypto');
  const sha=createHash('sha256').update(Buffer.from(png(3).split(',')[1],'base64')).digest('hex');
  const entries=[...files].filter(([n])=>n!==`blob/${sha}`).map(([name,data])=>({name,data}));
  const broken=new Uint8Array(await zipStore(entries).arrayBuffer());
  const back=await parseExamsetFile(broken);
  assert.deepEqual(back.versions.map(v=>[v.label,!!v.missing]),[['v0.1',false],['v0.2',true],['v0.3',false]]);
  assert.equal(back.versions[1].summary,'그림 넣음');assert.equal(back.versions[1].snapshot,null);
  assert.equal(back.questions[0].blocks.at(-1).figure.data,png(4),'지금 작업 상태는 그대로 열림');
  assert.throws(()=>M.restoreVersion(back,'v0.2'),/빠져/);M.restoreVersion(back,'v0.1');
  // 해시가 다른 덩어리도 빠진 것으로 본다.
  const tampered=[...files].map(([name,data])=>({name,data:name===`blob/${sha}`?data.map(x=>x^1):data}));
  const t=await parseExamsetFile(new Uint8Array(await zipStore(tampered).arrayBuffer()));
  assert.equal(t.versions[1].missing,true);assert.deepEqual(t.missingBlobs,[sha]);
});

/* ---------- HWPX ---------- */
async function deflateRaw(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());}
async function makeHwpx(sections){
  const enc=new TextEncoder(),parts=[],central=[];let off=0;
  const files=[['mimetype',enc.encode('application/hwp+zip'),0],...sections.map((x,i)=>[`Contents/section${i}.xml`,enc.encode(x),8])];
  for(const [name,data,method] of files){
    const body=method?await deflateRaw(data):data,nb=enc.encode(name);
    const lh=new Uint8Array(30+nb.length),lv=new DataView(lh.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(8,method,true);lv.setUint32(18,body.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nb.length,true);lh.set(nb,30);
    const ch=new Uint8Array(46+nb.length),cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(10,method,true);cv.setUint32(20,body.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,nb.length,true);cv.setUint32(42,off,true);ch.set(nb,46);
    parts.push(lh,body);central.push(ch);off+=lh.length+body.length;
  }
  const size=central.reduce((n,c)=>n+c.length,0),eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,size,true);ev.setUint32(16,off,true);
  return new Uint8Array(await new Blob([...parts,...central,eocd]).arrayBuffer());
}
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const P=t=>`<hp:p id="0" paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${esc(t)}</hp:t></hp:run></hp:p>`;
function paperParas(q,no,{ask=q.ask,points=`[${q.points}점]`,bogi,choices}={}){
  const out=[`${no}. ${q.blocks.find(b=>b.kind==='text').text}`,`${ask} ${points}`.trim()];
  const b=q.blocks.find(b=>b.kind==='bogi');if(b)(bogi||b.lines.map(l=>l.text)).forEach((t,i)=>out.push(`${'ㄱㄴㄷ'[i]}. ${t}`));
  const cs=choices||q.choices.map(c=>c.text);out.push(cs.map((t,i)=>'①②③④⑤'[i]+' '+t).join('\t'));
  return out;
}

test('HWPX 글 읽기: deflate 풀기·문단 단위·표 안 문단', async()=>{
  const xml=`<?xml version="1.0"?><hs:sec>${P('머리글')}<hp:p><hp:run><hp:t>바깥 </hp:t><hp:tbl><hp:tr><hp:tc><hp:subList>${P('칸 & 글')}</hp:subList></hp:tc></hp:tr></hp:tbl><hp:t>뒤<hp:tab/>글</hp:t></hp:run></hp:p></hs:sec>`;
  assert.deepEqual(sectionParagraphs(xml),['머리글','바깥 뒤 글','칸 & 글']);
  const bytes=await makeHwpx([xml,`<hs:sec>${P('둘째 구역')}</hs:sec>`]);
  assert.deepEqual(await hwpxText(bytes),['머리글','바깥 뒤 글','칸 & 글','둘째 구역']);
});

test('HWPX 차이: 순서 바뀜·글 바뀜·배점 빠짐·빠진 글', async()=>{
  const q1=combo(1,{passage:'그림은 별 A와 B의 연주 시차를 나타낸 것이다.',points:3});
  const q2=single(2,{passage:'허블 법칙은 은하의 후퇴 속도와 거리의 관계이다.',ask:'허블 법칙에 대한 설명으로 옳은 것은?',choices:['은하는 멀수록 빨리 멀어진다.','은하는 가까울수록 빨리 멀어진다.','우주는 수축한다.','후퇴 속도는 일정하다.','거리는 변하지 않는다.'],points:2});
  const q3=single(3,{passage:'별의 등급은 밝기를 나타내는 값이다.',ask:'등급에 대한 설명으로 옳은 것은?',choices:['1등급이 6등급보다 밝다.','등급이 클수록 밝다.','절대 등급은 거리에 따라 다르다.','겉보기 등급은 늘 같다.','등급은 온도와 같다.'],points:4});
  const qs=[q1,q2,q3];
  // 그대로 옮긴 지면은 차이가 없다.
  const same=[P('2026학년도 2학기 기말고사'),...qs.flatMap((q,i)=>paperParas(q,i+1)).map(P)].join('');
  const none=diffAgainst(await hwpxText(await makeHwpx([`<hs:sec>${same}</hs:sec>`])),qs);
  assert.deepEqual(none,{order:[],text:[],missing:[],points:[]});
  // 한글에서: 2번과 3번 순서를 바꾸고, 1번 보기 ㄷ과 2번 선지 ③을 고치고, 3번 배점을 지우고, 2번 지문을 지웠다.
  const p1=paperParas(q1,1,{bogi:['A는 B보다 밝다.','A의 표면 온도는 B보다 높다.','A와 B의 거리는 다르다.']});
  const p3=paperParas(q3,2,{points:''});
  const p2=paperParas(q2,3,{choices:['은하는 멀수록 빨리 멀어진다.','은하는 가까울수록 빨리 멀어진다.','우주는 팽창한다.','후퇴 속도는 일정하다.','거리는 변하지 않는다.']});
  p2[0]='3.';
  const edited=[P('2026학년도 2학기 기말고사'),...[...p1,...p3,...p2].map(P)].join('');
  const d=diffAgainst(await hwpxText(await makeHwpx([`<hs:sec>${edited}</hs:sec>`])),qs);
  assert.deepEqual(d.order,[{no:2,from:2,to:3},{no:3,from:3,to:2}]);
  assert.ok(d.text.some(t=>t.no===1&&t.what==='보기 ㄷ'&&t.after==='A와 B의 거리는 다르다.'),JSON.stringify(d.text));
  assert.ok(d.text.some(t=>t.no===2&&t.what==='선지 ③'&&t.before==='우주는 수축한다.'&&t.after==='우주는 팽창한다.'));
  assert.deepEqual(d.points,[{no:3,before:4,after:null}]);
  assert.ok(d.missing.some(m=>m.no===2&&m.what.startsWith('자료 설명')),JSON.stringify(d.missing));
  assert.equal(d.text.length,2);assert.equal(d.missing.length,1);
});

test('별과우주 실제 16문항: 통계·묶음·파일 왕복', {skip:!existsSync(STAR)&&'별과우주 파일 없음'}, async()=>{
  const src=JSON.parse(readFileSync(STAR,'utf8'));
  const w=M.newExamset({title:src.exams[0].title});
  for(const id of src.exams[0].items)M.addQuestion(w,structuredClone(src.questions.find(q=>q.id===id)),{by:'import'});
  const s=M.computeStats(M.orderedQuestions(w));
  assert.deepEqual(s.answers,[3,3,4,4,3,2,4,1,2,5,5,1,2,1,2,5]);
  assert.deepEqual(s.countByNumber,{1:3,2:4,3:3,4:3,5:3});assert.equal(s.longestRun,2);assert.equal(s.pointsTotal,50);assert.deepEqual(s.pointsByKind,{2:4,3:6,4:6});
  for(const q of w.questions)assert.ok(M.cellKeys(q).length>5);
  assert.equal(M.toSheetBundle(w).questions.length,16);
  M.commitVersion(w,{summary:'가져옴'});w.questions[0].ask+=' ';M.commitVersion(w,{summary:'발문 고침'});
  const bytes=await buildExamsetFile(w);
  const man=JSON.parse(new TextDecoder().decode(unzipStore(bytes,{maxEntryBytes:1e9,maxTotalBytes:1e9}).get('manifest.json')));
  const imgs=new Set(JSON.stringify(src.questions).match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g));
  assert.equal(man.blobs.length,imgs.size,'판 2개여도 그림 덩어리는 원본 그림 수만큼');
  assert.ok(bytes.length<readFileSync(STAR).length,'base64를 바이트로 담아 원본 JSON보다 작다');
  const back=await parseExamsetFile(bytes);assert.deepEqual(back,JSON.parse(JSON.stringify(w)));
});
