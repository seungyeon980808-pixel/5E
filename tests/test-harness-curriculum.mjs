// 1.8.0 출제 하네스 성취기준 원문 묶음(assets/harness/curriculum.js) — 화면 없는 단위 검사.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {loadCurriculum,findStandards,quoteCheck,standardLabel} from '../assets/harness/curriculum.js';

const FILE=new URL('../assets/harness/data/curriculum-2022.json',import.meta.url);
const data=JSON.parse(readFileSync(FILE,'utf8'));
const codes=rows=>rows.map(r=>r.code);

test('묶음 파일: 있고, meta.count가 성취기준 수와 같다', async ()=>{
  assert.ok(existsSync(FILE));
  assert.equal(data.meta.edition,'2022');
  assert.equal(data.meta.count,data.items.length);
  assert.ok(data.items.length>=3800,'중·고 전 과목');
  assert.equal(data.meta.middle+data.meta.high,data.meta.count);
  assert.ok(data.meta.middle>0&&data.meta.high>0);
  for(const k of ['source','license','attribution','builtFrom','note'])assert.ok(data.meta[k],k);
  for(const it of data.items){assert.ok(data.subjects[it.s],it.c);if(it.a!=null)assert.ok(data.areas[it.a],it.c);}
  const loaded=await loadCurriculum(async()=>data);
  assert.equal(loaded,data,'주입한 읽기 함수를 쓴다');
});

test('코드로 찾기: 대괄호·빈칸이 있든 없든', ()=>{
  const [a]=findStandards(data,{code:'[10통과1-03-04]'});
  assert.ok(a.text.includes('충격량과 운동량의 관계'));
  assert.equal(a.school,'high');assert.equal(a.subject,'통합과학1');
  assert.equal(a.ref,'kr-2022:[10통과1-03-04]');
  assert.ok(a.area);
  assert.equal(standardLabel(a),'2022 개정 · 고등학교 통합과학1 · [10통과1-03-04]');
  assert.deepEqual(codes(findStandards(data,{code:'10통과1-03-04'})),['[10통과1-03-04]']);
  assert.deepEqual(codes(findStandards(data,{code:' [ 10통과1 - 03 - 04 ] '})),['[10통과1-03-04]']);
  assert.deepEqual(codes(findStandards(data,{query:'10통과1-03-04'})),['[10통과1-03-04]'],'질의가 코드 하나면 코드로');
  assert.deepEqual(findStandards(data,{code:'[99없음01-01]'}),[]);
});

test('같은 코드를 쓰는 두 과목은 ref로 나뉜다', ()=>{
  const rows=findStandards(data,{code:'[12스문01-01]'});
  assert.equal(rows.length,2);
  assert.notEqual(rows[0].ref,rows[1].ref);
  assert.deepEqual(findStandards(data,{code:rows[1].ref}).map(r=>r.subject),[rows[1].subject]);
  assert.equal(findStandards(data,{code:'[12스문01-01]',subject:'스포츠 문화'}).length,1);
});

test('낱말로 찾기: 「충격량 운동량」은 3위 안', ()=>{
  const top=codes(findStandards(data,{query:'충격량 운동량',limit:3}));
  assert.ok(top.includes('[10통과1-03-04]'),top.join());
});

test('중학교 질의와 과학 밖 질의', ()=>{
  const mid=findStandards(data,{query:'중학교 광합성',limit:3});
  assert.equal(mid[0].code,'[9과12-01]');assert.equal(mid[0].school,'middle');
  const math=findStandards(data,{query:'이차방정식의 근과 계수',limit:3});
  assert.equal(math[0].code,'[10공수1-02-03]');
  const kor=findStandards(data,{query:'논증 타당성',subject:'국어',limit:5});
  assert.ok(kor.length>0);
  for(const r of kor)assert.ok(r.subject.includes('국어'),r.subject);
  assert.ok(kor.some(r=>r.code==='[9국02-05]'));
  const hist=findStandards(data,{query:'국민 국가 형성',school:'중학교',limit:3});
  assert.equal(hist[0].code,'[9역05-01]');
});

test('과목·학교급 칸으로 거르기', ()=>{
  const phys=findStandards(data,{query:'운동량',subject:'물리학',limit:20});
  assert.ok(phys.length>0);for(const r of phys)assert.ok(r.subject.includes('물리학'),r.subject);
  const high=findStandards(data,{query:'광합성',school:'high',limit:20});
  assert.ok(high.length>0);for(const r of high)assert.equal(r.school,'high');
  assert.deepEqual(findStandards(data,{query:'광합성',subject:'없는과목'}),[]);
  assert.deepEqual(findStandards(data,{query:'광합성',school:'대학교'}),[]);
});

test('과학을 앞세우지 않는다: 수학 낱말에 과학 과목이 끼지 않음', ()=>{
  const rows=findStandards(data,{query:'인수분해',limit:5});
  assert.ok(rows.length>0);
  for(const r of rows)assert.match(r.subject,/수학/);
});

test('quoteCheck: 빈칸이 이상해도 그대로면 참, 고치면 거짓', ()=>{
  const code='[10통과1-03-04]';
  assert.deepEqual(quoteCheck(data,code,'충격량과   운동량의\n관계를'),{ok:true,found:true,exact:true});
  assert.equal(quoteCheck(data,'10통과1-03-04','충격량과 운동량의 관계를').ok,true);
  assert.equal(quoteCheck(data,code,'충격량과 운동량의 차이를').ok,false);
  assert.equal(quoteCheck(data,code,'충격량과 운동에너지의 관계를').ok,false);
  assert.deepEqual(quoteCheck(data,'[99없음01-01]','아무 글'),{ok:false,found:false,exact:false});
  assert.equal(quoteCheck(data,code,'').ok,false);
  // 원본에 낱말 가운데 빈칸이 낀 글: 띄어쓰기만 다르면 ok, exact는 거짓
  const r=quoteCheck(data,'[9과14-04]','일상생활에서 활용한 예');
  assert.equal(r.ok,true);assert.equal(r.exact,false);
});

test('이상한 입력: 던지지 않고 []', ()=>{
  const odd=[undefined,null,{},{query:''},{query:'   '},{query:'가'},{query:123},{query:12345678},{query:'가'.repeat(5000)},
    {query:'ㅋ'.repeat(100000)},{code:''},{code:null},{code:42},{query:{}},{query:[]},{query:'충격량',limit:'x'},{query:'!!!@@@'}];
  for(const o of odd){
    let rows;assert.doesNotThrow(()=>{rows=findStandards(data,o);},JSON.stringify(o)?.slice(0,40));
    assert.ok(Array.isArray(rows));
  }
  for(const o of [undefined,null,{},{query:''},{query:'가'},{query:123},{query:'ㅋ'.repeat(5000)},{code:42}])
    assert.deepEqual(findStandards(data,o),[],JSON.stringify(o)?.slice(0,40));
  assert.equal(findStandards(data,{query:'운동량',limit:'x'}).length,5,'limit이 이상하면 5');
  assert.deepEqual(findStandards(null,{query:'충격량'}),[]);
  assert.deepEqual(findStandards({items:'x'},{query:'충격량'}),[]);
  assert.deepEqual(quoteCheck(null,'[10통과1-03-04]','충격량'),{ok:false,found:false,exact:false});
  assert.equal(quoteCheck(data,{},{}).ok,false);
  assert.equal(standardLabel(null),'');
});
