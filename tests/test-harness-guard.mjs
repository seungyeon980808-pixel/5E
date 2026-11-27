// 1.8.0 출제 하네스 새 엔진 — 권한·안전망 판정(assets/harness/guard.js) 단위 검사. 화면·AI 없이.
import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherIntent,checkDirect,checkAccept,normalizeChange,staleReason,DIRECT_CELL_CAP} from '../assets/harness/guard.js';

const base={permission:'direct',number:3,openNumber:null,questionCount:8,cells:1,lockedCells:0,stale:[],appliedThisTurn:0};
const direct=(text,over={})=>checkDirect({...base,...over,intent:teacherIntent(text)});

test('분명히 시킨 말은 바로 고침(권한 direct)', () => {
  for(const t of ['3번 선지 ②를 「오른쪽 2 m/s」로 교체해','3번 발문 좀 더 짧게 바꿔 줘','3번 ㄴ을 고쳐 주세요','@3번 정답을 ④로 바꿔','3번 선지 ② 바꿔 줄래?','3번 보기 ㄷ 빼 줘','3번 해설 다시 써 줘','3번을 합답형으로 만들어'])
    assert.equal(direct(t).direct,true,t+' → '+JSON.stringify(direct(t).reasons));
});
test('묻는 말·상의하자는 말은 제안으로 낮춤', () => {
  for(const t of ['3번 ㄴ 어색하지 않아?','3번은 너무 쉬운 것 같은데 어떻게 하면 좋을까?','3번 선지 ②가 맞나요?','3번 어때?','3번은 아직 고치지는 말고 의견만 말해 줘','3번 바꾸지 말고 의논하자','3번을 어떻게 바꾸면 좋을지 안만 말해 줘','3번 반영하지 마'])
    assert.equal(direct(t).direct,false,t);
  assert.equal(direct('3번 ㄴ 어색하지 않아?').reasons[0].code,'question');
  assert.equal(direct('3번 바꾸지 말고 의논하자').reasons[0].code,'discuss');
});
test('권한이 제안 후 받기면 어떤 말이든 제안', () => {
  const r=direct('3번 선지 ②를 교체해',{permission:'ask'});assert.equal(r.direct,false);assert.equal(r.reasons[0].code,'permission');
});
test('선생님 말에 나온 문항만 바로 고침', () => {
  assert.equal(direct('3번 선지 ② 교체해',{number:5}).direct,false);
  assert.equal(direct('3번 선지 ② 교체해',{number:5}).reasons[0].code,'scope');
  assert.equal(direct('2번이랑 3번 발문 줄여 줘',{number:2}).direct,true);
  // 번호를 안 말했으면: 열려 있는 문항이거나 문항이 하나뿐일 때만
  assert.equal(direct('선지 ② 교체해',{number:3,openNumber:3}).direct,true);
  assert.equal(direct('선지 ② 교체해',{number:3,openNumber:4}).direct,false);
  assert.equal(direct('발문 줄여 줘',{number:1,questionCount:1}).direct,true);
  assert.equal(direct('발문 줄여 줘',{number:1,questionCount:8}).direct,false);
});
test('잠긴 칸·낡은 글·칸 수 상한이면 제안으로 낮춤', () => {
  assert.equal(direct('3번 발문 바꿔',{lockedCells:1}).reasons[0].code,'locked');
  assert.equal(direct('3번 발문 바꿔',{stale:['그사이 글이 바뀌었어요']}).reasons[0].code,'stale');
  assert.equal(direct('3번 전부 고쳐',{cells:3,appliedThisTurn:DIRECT_CELL_CAP-2}).reasons[0].code,'cap');
  assert.equal(direct('3번 전부 고쳐',{cells:2,appliedThisTurn:DIRECT_CELL_CAP-2}).direct,true);
});
test('선생님 말이 없는 차례(앱 알림 등)는 바로 고치지 않음', () => {
  assert.equal(checkDirect({...base,intent:teacherIntent('')}).direct,false);
  assert.equal(checkDirect({...base,intent:null}).direct,false);
});
test('이미 뜬 제안 받기: direct거나 「반영해」가 있을 때만, 방금 만든 제안은 못 받음(ask)', () => {
  const i=teacherIntent('3번 그 제안 반영해');
  assert.equal(checkAccept({permission:'ask',intent:i,wantsApply:true}).ok,true);
  assert.equal(checkAccept({permission:'ask',intent:i,wantsApply:true,createdThisTurn:true}).ok,false);
  assert.equal(checkAccept({permission:'ask',intent:teacherIntent('3번 제안 좋네'),wantsApply:false}).ok,false);
  assert.equal(checkAccept({permission:'direct',intent:teacherIntent('3번 그걸로 해'),wantsApply:false}).ok,true);
  assert.equal(checkAccept({permission:'direct',intent:teacherIntent('3번은 아직 반영하지 마'),wantsApply:false}).ok,false);
});
test('변경 다듬기와 「고치기 전 글」 대조', () => {
  assert.deepEqual(normalizeChange({path:'choice',number:2,value:'오른쪽 2 m/s',before:'오른쪽 3 m/s'}),{path:'choice',index:1,value:'오른쪽 2 m/s',before:'오른쪽 3 m/s'});
  assert.deepEqual(normalizeChange({path:'answer',value:'4'}),{path:'answer',value:4});
  assert.deepEqual(normalizeChange({path:'bogi',line:'ㄴ',value:'새 글',before:'옛 글'}),{path:'bogi',line:'ㄴ',value:'새 글',before:'옛 글'});
  for(const bad of [null,{path:'type',value:'x'},{path:'choice',number:6,value:'x'},{path:'choice',value:'x'},{path:'answer',value:0},{path:'ask',value:'  '},{path:'bogi',value:'x'},{path:'ask',value:'가'.repeat(9000)}])assert.throws(()=>normalizeChange(bad));
  assert.equal(staleReason({path:'choice',before:'오른쪽  3 m/s'},'오른쪽 3 m/s'),null);// 띄어쓰기 차이는 같은 글
  assert.ok(staleReason({path:'choice',before:'오른쪽 3 m/s'},'왼쪽 3 m/s'));
  assert.ok(staleReason({path:'ask'},'지금 발문'));// 글 칸은 before가 꼭 있어야
  assert.equal(staleReason({path:'answer'},2),null);// 숫자 칸은 before 없어도 됨
  assert.ok(staleReason({path:'answer',before:'3'},2));
});
test('선생님 말에서 문항 번호 뽑기', () => {
  assert.deepEqual(teacherIntent('1·3번 그대로, 8번 섭씨로 반영해').numbers,[1,3,8]);
  assert.deepEqual(teacherIntent('2~4번 발문 줄여 줘').numbers,[2,3,4]);
  assert.deepEqual(teacherIntent('5, 7번이랑 10번').numbers,[5,7,10]);
  assert.deepEqual(teacherIntent('@12번 지목').numbers,[12]);
  assert.deepEqual(teacherIntent('번호 없이 말하기').numbers,[]);
});
