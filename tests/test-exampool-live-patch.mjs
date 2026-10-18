// 시트에서 고친 글을 한글 창의 같은 문단에 바로 넣기(다시 그리지 않음)와, 한글에 나오지 않는 칸 구분.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQuestionHtml} from '../assets/exampool/sheet/handoff.js';
import {planPatches,applyPatches,layoutKey} from '../assets/exampool/sheet/live-patch.js';
import {newQuestion} from '../assets/exampool/sheet/model.js';
import {questionFingerprint,typesetMatches} from '../assets/exampool/sheet/typeset-model.js';
import {ROWS} from '../assets/exampool/sheet/vertical.js';
import {labelInDocument} from '../assets/exampool/sheet/handoff.js';

const blank=async f=>({...f,data:'data:image/png;base64,AAAA',width:100,height:100});
const plan=q=>buildQuestionHtml(q,blank,340,{native:true,measureText:t=>String(t).length*11});
// 한글 문서의 문단: 글 조각마다 한 문단(어절 줄바꿈 포함) + 조각이 아닌 제목 문단.
const runsOf=p=>[{para:0,path:null,text:'<보 기>',section:0},...p.textSegments.map((s,i)=>({section:0,para:i+1,path:null,text:s.wrapped}))];

function question(){
  const q=newQuestion('3','합답형','실험'),table=q.blocks.find(b=>b.kind==='table');
  q.ask='실험 결과로 옳은 것만을 <보기>에서 있는 대로 고른 것은?';
  table.table.cells[1][1].value='0.5';table.table.cells[2][1].value='0.5';
  q.choices.forEach((c,i)=>c.text=['ㄱ','ㄴ','ㄱ, ㄴ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'][i]);
  return q;
}

test('a text-only sheet edit becomes one in-place patch of the same paragraph',async()=>{
  const q=question(),before=await plan(q),next=structuredClone(q);next.ask=q.ask.replace('옳은 것만을','옳은 것을');
  const after=await plan(next),runs=runsOf(before);
  const patches=planPatches(before.textSegments,after.textSegments,runs);
  assert.equal(patches.length,1);
  assert.equal(patches[0].run.text,before.textSegments.find(s=>s.owner?.kind==='ask').wrapped);
  assert.match(patches[0].text,/옳은 것을/);
  assert.equal(layoutKey(q),layoutKey(next),'only text changed');
});

test('duplicate cell values are matched by order; a different count of same text refuses',async()=>{
  const q=question(),before=await plan(q),next=structuredClone(q);
  next.blocks.find(b=>b.kind==='table').table.cells[2][1].value='0.7';
  const after=await plan(next),runs=runsOf(before).map(r=>({...r,path:r.text==='0.5'?[{controlIndex:0,cellIndex:0,cellParaIndex:0}]:null,parent:1}));
  const patches=planPatches(before.textSegments,after.textSegments,runs);
  assert.equal(patches.length,1);
  const second=runs.filter(r=>r.text==='0.5')[1];assert.equal(patches[0].run,second,'the second 0.5 is the edited cell');
  // 같은 글이 조각 밖에도 있으면(개수가 다르면) 바로 넣지 않는다.
  assert.equal(planPatches(before.textSegments,after.textSegments,[...runs,{section:0,para:99,path:null,text:'0.5'}]),null);
});

test('structure changes are refused: new segment, owner change, equation, table line count',async()=>{
  const q=question(),before=await plan(q),runs=runsOf(before);
  const filled=structuredClone(q);filled.blocks.find(b=>b.kind==='table').table.cells[1][2].value='새 값';
  assert.equal(planPatches(before.textSegments,(await plan(filled)).textSegments,runs),null,'a first value in an empty cell needs a redraw');
  const math=structuredClone(q);math.ask='속력 $v$ 를 구하시오.';
  assert.equal(planPatches(before.textSegments,(await plan(math)).textSegments,runs),null,'equations need a redraw');
  const cell=structuredClone(q),seg=before.textSegments.findIndex(s=>s.owner?.kind==='cell');
  const after=(await plan(cell)).textSegments.map((s,i)=>i===seg?{...s,value:s.value+' 길게',wrapped:s.wrapped+'\n길게'}:s);
  const cellRuns=runs.map((r,i)=>i===seg+1?{...r,path:[{controlIndex:0,cellIndex:0,cellParaIndex:0}],parent:1}:r);
  assert.equal(planPatches(before.textSegments,after,cellRuns),null,'a table cell may not gain a line (its row height is fixed)');
  const moved=structuredClone(q);moved.blocks.find(b=>b.kind==='group').gap=3;
  assert.notEqual(layoutKey(q),layoutKey(moved),'a placement value is a layout change');
  const renamed=structuredClone(q);renamed.blocks.find(b=>b.kind==='table').label='결과 표';
  assert.equal(layoutKey(q),layoutKey(renamed),'a label that is not printed is not a layout change');
});

test('patches delete and insert only the changed span, in body paragraphs and cells',()=>{
  const calls=[],wasm={deleteText:(...a)=>{calls.push(['del',...a]);return '{"ok":true}';},insertText:(...a)=>{calls.push(['ins',...a]);return '{"ok":true}';},
    deleteTextInCellByPath:(...a)=>{calls.push(['cdel',...a]);return '{"ok":true}';},insertTextInCellByPath:(...a)=>{calls.push(['cins',...a]);return '{"ok":true}';}};
  applyPatches(wasm,[{run:{section:0,para:1,path:null,text:'1. 옳은 것만을\n고른 것은?'},text:'1. 옳은 것을\n고른 것은?'},
    {run:{section:0,parent:2,path:[{controlIndex:0,cellIndex:4,cellParaIndex:0}],text:'0.5'},text:'0.75'}]);
  // '것만을'→'것을': '만' 한 글자만 지운다. '0.5'→'0.75': '7'만 넣는다.
  assert.deepEqual(calls,[['del',0,1,7,1],['cins',0,2,'[{"controlIndex":0,"cellIndex":4,"cellParaIndex":0}]',2,'7']]);
  assert.throws(()=>applyPatches({insertText:()=>'{"ok":false}',deleteText:()=>'{"ok":true}'},[{run:{section:0,para:1,path:null,text:'가'},text:'가나'}]),/넣지 못했습니다/);
});

test('only printed fields change the fingerprint; typesets saved with the old fingerprint still match',async()=>{
  const q=question();q.points=2;const hash=await questionFingerprint(q);
  // 배점은 3점일 때만 [3점]으로 찍힌다.
  const three=structuredClone(q);three.points=3;assert.notEqual(await questionFingerprint(three),hash);
  for(const [k,v] of [['unitLarge','역학'],['standardCode','[12물리01-01]'],['explanation','해설'],['points',4],['answer',2],['source','기출'],['managementId','PHY-1'],['intent','의도']]){
    const c=structuredClone(q);c[k]=v;assert.equal(await questionFingerprint(c),hash,k+' is not printed');
  }
  const asked=structuredClone(q);asked.ask='다른 발문';assert.notEqual(await questionFingerprint(asked),hash);
  const {typeset,references,workflow,...rest}=q;
  const legacy=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rest))))].map(v=>v.toString(16).padStart(2,'0')).join('');
  assert.equal(await typesetMatches({fingerprint:legacy},q),true,'a typeset approved before this change stays approved');
  assert.equal(await typesetMatches({fingerprint:hash},q),true);
  assert.equal(await typesetMatches({fingerprint:legacy},asked),false);
});

test('white cells are exactly the fields printed as text in the HWP document',()=>{
  assert.deepEqual(ROWS.filter(r=>r.text).map(r=>r.key),['ask','materials','passage','choices','bogi','number']);
  const q=newQuestion('1','객관식','실험'),kind=k=>q.blocks.find(b=>b.kind===k);
  assert.equal(labelInDocument(kind('group')),true,'the boxed 실험 title is printed');
  assert.equal(labelInDocument(kind('steps')),true,'the steps title is printed');
  assert.equal(labelInDocument(kind('table')),false,'a table name is not printed');
  assert.equal(labelInDocument({kind:'figure',label:'(가)',figure:{data:'x'}}),true);
  assert.equal(labelInDocument({kind:'figure',label:'실험 장치',figure:{data:'x'}}),false);
});
