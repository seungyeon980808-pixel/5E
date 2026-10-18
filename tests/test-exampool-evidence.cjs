// ExamPool 근거 검색 어댑터: 정해진 인자만 넘기고, DB가 없거나 실패하면 '미확보'로 답한다(가짜 실행기, 실제 DB 아님).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {search,compact}=require('../scripts/exampool-evidence.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exampool-evidence-'));
const db=path.join(dir,'evidence.sqlite'),tool=path.join(dir,'search_evidence.py');fs.writeFileSync(db,'');fs.writeFileSync(tool,'');
const env={FIVE_E_EVIDENCE_DB:db,FIVE_E_EVIDENCE_TOOL:tool,FIVE_E_EVIDENCE_PYTHON:'python3'};
test('정해진 인자만 넘긴다',async()=>{
  let seen;const run=(cmd,args,opts,cb)=>{seen={cmd,args,opts};cb(null,JSON.stringify({results:[{item_id:'p1_2024_09_08',document_sha256:'a'.repeat(64),page_no:2,text:'8. 그림은…',judgement:'evidence_missing',reviewed_claims:[]}],availability:'available',warning:'후보'}));};
  const r=await search({kind:'past',terms:['속도-시간 그래프','가속도'],limit:99,sentence:'s'},{env,run});
  assert.equal(seen.cmd,'python3');assert.deepEqual(seen.args.slice(0,5),['-E','-s',tool,'--db',db]);
  assert.ok(seen.args.includes('items')&&seen.args.includes('8'),'종류는 items, 한도는 8로 묶인다');
  assert.equal(seen.opts.cwd,os.tmpdir());assert.equal(r.available,true);assert.equal(r.results[0].kind,'past');assert.equal(r.results[0].judgement,'missing','검색 결과는 후보라 미확보에서 시작한다');
  assert.match(r.results[0].ref,/^ev-[a-f0-9]{12}$/);
});
test('허용하지 않은 종류·검색어는 실행하지 않는다',async()=>{
  const run=()=>assert.fail('실행하면 안 된다');
  await assert.rejects(search({kind:'sql',terms:['x']},{env,run}),/종류/);
  await assert.rejects(search({kind:'past',terms:['a\nDROP']},{env,run}),/검색어/);
  await assert.rejects(search({kind:'past',terms:['x'.repeat(81)]},{env,run}),/검색어/);
});
test('DB가 없거나 실행이 실패하면 미확보로 답한다',async()=>{
  const missing=await search({kind:'curriculum',terms:['운동']},{env:{FIVE_E_EVIDENCE_DB:path.join(dir,'none.sqlite'),FIVE_E_EVIDENCE_TOOL:tool},run:()=>assert.fail()});
  assert.equal(missing.available,false);assert.match(missing.warning,/거짓의 증거가 아니며/);
  const broken=await search({kind:'claim',terms:['운동']},{env,run:(c,a,o,cb)=>cb(new Error('boom'),'')});
  assert.equal(broken.available,false);assert.deepEqual(broken.results,[]);
});
test('교육과정 결과는 판본·학교급·코드·쪽을 보존한다',()=>{
  const [r]=compact('curriculum',{results:[{document_sha256:'b'.repeat(64),revision:'r',edition:'2022',school_band:'중학교 1~3학년',unit:{title:'물질의 상태 변화',standards:[{code:'9과04-01',display_text:'[9과04-01] 확산…',segments:[{page_no:49,bbox:[1,2,3,4]}]}],contexts:{explanation:[{raw_text:'해설'}]}}}]});
  assert.equal(r.edition,'2022');assert.deepEqual(r.codes,['9과04-01']);assert.equal(r.page,49);assert.deepEqual(r.bbox,[1,2,3,4]);assert.match(r.quote,/해설: 해설/);
});
