import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseStructureSpec,formatStructureContract,buildStructureAnalysisPrompt,createStructureAnalysisController} from '../js/ai-structure-spec.js';
import {buildWhitePngPrompt} from '../js/ai-white-png.js';
import {buildStructuralInventory,buildImageReviewPrompt} from '../js/ai-image-review.js';
const sample=()=>({version:1,sourceCount:1,profiles:['material','stages','nested'],components:[{id:'v',label:'용기',source:1,count:1,stage:'전',evidence:'왼쪽 원형 경계'},{id:'s',label:'고체',source:1,count:null,stage:'전',evidence:'바닥 작은 영역, 개수 불명확'}],relations:[{from:'s',to:'v',kind:'contained_by',evidence:'원호 안쪽에서 접촉'}],marks:[{role:'uncertain',description:'작은 회색',evidence:'경계 일부 가려짐'}],uncertainties:['고체의 개수와 회색 경계 일부를 확인할 수 없음']});
const tick=()=>new Promise(r=>setImmediate(r));
function setup(send=async()=>({turnId:'a1',threadId:'t1'}),timeoutMs=5000){const sent=[];const controller=createStructureAnalysisController({transport:{send:p=>{sent.push(p);return send(p);}},timeoutMs});return {c:controller,sent};}
const args=()=>({request:'원본 구조 보존',attachments:[{name:'원본',data:'data:image/png;base64,AA=='}]});
test('strict structure schema preserves null and zero, rejects mismatch/unknown/dangling evidence',()=>{
 assert.equal(parseStructureSpec(JSON.stringify(sample()),1).ok,true);
 for(const mutate of [s=>s.sourceCount=2,s=>s.components[1].id='v',s=>s.components[0].count='1',s=>s.components[0].count=-1,s=>s.components[0].evidence='',s=>s.relations[0].to='missing',s=>s.profiles=['constructor'],s=>s.uncertainties=[],s=>s.extra='bad',s=>s.components[0].source=2]){const s=sample();mutate(s);assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,false);}
 const s=sample();s.components[1].count=0;assert.equal(parseStructureSpec(JSON.stringify(s),1).spec.components[1].count,0);
 assert.equal(parseStructureSpec('```json\n{}\n```',1).ok,false);
});
test('same validated contract reaches first generation, correction and independent review',()=>{
 const contract=formatStructureContract(sample());
 for(const revision of [false,true])assert.ok(buildWhitePngPrompt({revision,structureContract:contract}).includes(contract));
 assert.ok(buildImageReviewPrompt({structuralInventory:buildStructuralInventory({structureContract:contract})}).includes(contract));
 assert.match(contract,/자동 관찰 가설/);assert.match(contract,/null은 0이 아니/);assert.match(contract,/원본 이미지가 최우선/);
});
test('learned rules never inject case counts into unseen input',()=>{
 const p=buildStructureAnalysisPrompt({referenceNames:['새 사진']});
 assert.doesNotMatch(p,/세포 8|정자 4|화살표 11|나무 15|작은 나무 2/);
 assert.match(p,/각 객체와 관계에.*시각 근거/);assert.match(p,/어떤 도구도 호출하지 않는다/);
 const s=sample();s.profiles=['material'];assert.doesNotMatch(formatStructureContract(s),/도식 아이콘 수/);
});
test('observer is fresh Sol high text turn and requires completed strict JSON',async()=>{
 const {c,sent}=setup();const p=c.analyze(args());await tick();
 assert.equal(sent[0].purpose,'chat');assert.equal(sent[0].model,'gpt-5.6-sol');assert.equal(sent[0].effort,'high');assert.equal(sent[0].conversationId,null);assert.equal(sent[0].resetConversation,true);
 c.handleEvent({kind:'assistant',turnId:'a1',text:JSON.stringify(sample())});c.handleEvent({kind:'done',turnId:'a1',status:'completed'});
 assert.deepEqual(await p,sample());assert.equal(c.isActive(),false);
 assert.equal(c.handleEvent({kind:'done',turnId:'a1',status:'completed'}),true);
});
test('cancel before send acknowledgement and late success cannot authorize generation',async()=>{
 let ack;const {c}=setup(()=>new Promise(r=>ack=r));const p=c.analyze(args());const rejected=assert.rejects(p,/취소/);await tick();c.cancel();ack({turnId:'a1',threadId:'t1'});await rejected;await tick();
 assert.equal(c.handleEvent({kind:'done',turnId:'a1',status:'completed'}),true);assert.equal(c.isActive(),false);
});
test('early events are queued and foreign turn/thread events cannot complete observer',async()=>{
 let ack;const {c}=setup(()=>new Promise(r=>ack=r));const p=c.analyze(args());await tick();
 c.handleEvent({kind:'done',turnId:'foreign',status:'completed'});
 c.handleEvent({kind:'assistant',turnId:'a1',text:JSON.stringify(sample())});
 c.handleEvent({kind:'done',turnId:'a1',threadId:'wrong-thread',status:'completed'});
 ack({turnId:'a1',threadId:'t1'});await tick();assert.equal(c.isActive(),true);
 c.handleEvent({kind:'done',turnId:'a1',status:'completed'});assert.deepEqual(await p,sample());
});
test('malformed, interrupted, image-tool and error outcomes all fail closed',async()=>{
 for(const end of [{kind:'done',status:'completed'},{kind:'done',status:'interrupted'},{kind:'image',src:'bad'},{kind:'progress'},{kind:'error',text:'failure'}]){
 const {c}=setup();const p=c.analyze(args());const rejected=assert.rejects(p);await tick();c.handleEvent({...end,turnId:'a1'});await rejected;assert.equal(c.isActive(),false);
 }
});
test('timeout and missing ids cannot silently continue',async()=>{
 const {c}=setup(undefined,5);await assert.rejects(c.analyze(args()),/시간 초과/);
 const b=setup(async()=>({}));await assert.rejects(b.c.analyze(args()),/식별자/);
});
test('panel wires separate originals, persists observation, and guards cancellation after analysis',async()=>{
 const p=await readFile(new URL('../js/ai-panel.js',import.meta.url),'utf8');
 assert.match(p,/if \(whiteRun\) \{\s*\/\/ Keep originals separate/);
 assert.match(p,/const spec = await structureAnalysis.analyze[\s\S]*?currentCancelRequested\) throw/);
 assert.match(p,/structureContract: formatStructureContract\(runInput.structureSpec\)/);
 assert.match(p,/structureAnalysis.handleEvent\(event\)[\s\S]*?imageReview\?\.handleEvent/);
 assert.match(p,/structureRecord: item\?\.structureRecord/);
});
test('disconnect is an error, not a user cancellation',async()=>{
 const {c}=setup();const p=c.analyze(args());const rejected=assert.rejects(p,e=>{assert.notEqual(e.code,'AI_TURN_CANCELLED');return /연결/.test(e.message)});await tick();c.fail();await rejected;
});
test('unexpected image generation interrupts transport even if interrupt rejects',async()=>{
 let stopped=0;const c=createStructureAnalysisController({transport:{send:async()=>({turnId:'a1'}),interrupt:async()=>{stopped++;throw Error('closed')}}});
 const p=c.analyze(args());const rejected=assert.rejects(p,/이미지 생성/);await tick();c.handleEvent({kind:'progress',turnId:'a1'});await rejected;await tick();assert.equal(stopped,1);
});
test('synchronous cancel prevents a not-yet-started transport send',async()=>{
 const {c,sent}=setup();const p=c.analyze(args());const rejected=assert.rejects(p,/취소/);c.cancel();await rejected;await tick();assert.equal(sent.length,0);
});
test('every attached source needs observation; missing source cannot be silently dropped',()=>{
 const s=sample();s.sourceCount=2;assert.equal(parseStructureSpec(JSON.stringify(s),2).ok,false);
 s.components.push({id:'previous',label:'수정 전 기준',source:2,count:null,stage:'',evidence:'일부가 가려짐'});assert.equal(parseStructureSpec(JSON.stringify(s),2).ok,true);
});
test('unscoped output cannot be attributed to observation by arrival time',async()=>{
 const {c}=setup();const p=c.analyze(args());const rejected=assert.rejects(p,/취소/);await tick();
 assert.equal(c.handleEvent({kind:'assistant',text:JSON.stringify(sample())}),false);assert.equal(c.handleEvent({kind:'done',status:'completed'}),false);assert.equal(c.isActive(),true);c.cancel();await rejected;
});

test('graph profile separates fill boundaries from overlaid curves without fixed geometry',()=>{
 const s=sample();s.profiles=['graph'];const contract=formatStructureContract(s);
 assert.match(contract,/상·하·좌·우 경계를 각각 확인/);
 assert.match(contract,/면 위를 지나는 곡선을 면의 경계로 추정하지 않는다/);
 assert.match(contract,/contact를 확정하지 말고/);
 assert.match(contract,/교점과 끝점의 축 구획 내 상대 위치/);
 assert.ok(buildWhitePngPrompt({structureContract:contract}).includes(contract));
 assert.ok(buildImageReviewPrompt({structuralInventory:buildStructuralInventory({structureContract:contract})}).includes(contract));
 s.profiles.push('material','stages','nested');assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,true);
 s.profiles.push('graph');assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,false);
});
test('decorative is evidence-based and does not authorize uncertain deletion',()=>{
 const s=sample();s.marks.push({role:'decorative',description:'배경 장식',evidence:'좌표 및 자료 구획과 분리된 장식'});
 assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,true);
 s.marks.at(-1).evidence='';assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,false);
 const prompt=buildStructureAnalysisPrompt({referenceNames:['미사용 원본']});
 assert.match(prompt,/단순히 색이 있거나 배경에 있다는 이유로/);
 assert.match(prompt,/불확실한 표식을 삭제 대상으로 단정하지 않는다/);
 assert.doesNotMatch(prompt,/134|174|1000|수평 직사각형 띠/);
});
test('review distinguishes size ordering from ratios and decoration from data regions',()=>{
 const prompt=buildImageReviewPrompt({});
 assert.match(prompt,/크기 순서만 같다고 상대 크기 비율까지 pass로 판정하지 않는다/);
 assert.match(prompt,/전체 그림의 균일 확대·이동/);
 assert.match(prompt,/모델 관찰의 경계 설명을 복사하지 말고/);
 assert.match(prompt,/자동 decorative 분류도 정답이 아니/);
});

test('routing profile separates functional connectivity from physical routes and local aspect ratios',()=>{
 const s=sample();s.profiles=['routing'];
 assert.equal(parseStructureSpec(JSON.stringify(s),1).ok,true);
 const c=formatStructureContract(s);
 assert.match(c,/기능적 연결망과 실제 그려진 경로/);
 assert.match(c,/중간 연결 구간/);assert.match(c,/실제 실선 외곽/);
 assert.match(c,/같은 전기적 노드/);assert.match(c,/uncertainties/);
});
test('route preservation reaches first generation and correction without specimen numbers',()=>{
 for(const revision of [false,true]){
  const p=buildWhitePngPrompt({revision});
  assert.match(p,/명시적 변경 요청이 없으면/);
  assert.match(p,/동등한 다른 배선으로 재설계하지 않는다/);
  assert.match(p,/balanced spacing/);
  assert.doesNotMatch(p,/Fig21|저항 17|1\.43|1\.98|186,44/);
 }
});
test('review separates electrical pass from route geometry and requires normalized direct comparison',()=>{
 const p=buildImageReviewPrompt();
 assert.match(p,/connections가 pass여도 실제 경로와 비율은 따로/);
 assert.match(p,/같은 폭 또는 같은 외곽 범위로 정규화/);
 assert.match(p,/명시 요청 없이 별도 연결선/);
 assert.match(p,/정밀 수치를 발명하지 않는다/);
 assert.match(p,/원본 이미지가 우선/);
 assert.doesNotMatch(p,/Fig21|저항 17|1\.43|1\.98|186,44/);
});
