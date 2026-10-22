import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildQuestionHtml,handoffQuestion,verifyNativeQuestion,wrapQuestionText,wrapHangingText,decodeNativeText} from '../assets/exampool/sheet/handoff.js';
import {nativeLayoutIssues,assertNativeLayout} from '../assets/exampool/sheet/native-layout-check.js';
import {FORMAT,newQuestion,block,validate} from '../assets/exampool/sheet/model.js';
const examples=JSON.parse(await fs.readFile(new URL('../assets/exampool/sheet/examples.json',import.meta.url),'utf8'));
const prep=async f=>({...f,width:320,height:200});
test('hanging statements use the full first line and reserve the measured label only on continuation lines',()=>{
 const measure=value=>[...value].length;
 const wrapped=wrapHangingText('ㄱ. abcdef ghijk lmno pqrst uvw',15,'ㄱ. ',measure);
 assert.equal(wrapped,'ㄱ. abcdef ghijk\nlmno pqrst\nuvw');
 assert.equal(wrapHangingText('ㄴ. abc\ndef ghi jkl mno',15,'ㄴ. ',measure),'ㄴ. abc\ndef ghi jkl\nmno');
});
test('experiment hierarchy, multiple result tables and exact header merges survive the native import plan',async()=>{
 const q=structuredClone(examples.questions[0]),g=q.blocks.find(b=>b.kind==='group'),extra=block('table',g.id);extra.table.cells[1][0].value=0;extra.table.cells[1][1].value='㉠';q.blocks.push(extra);
 const before=structuredClone(q),plan=await buildQuestionHtml(q,prep);
 assert.deepEqual(q,before);assert.equal(plan.tables.length,5);
 const result=plan.tables.find(t=>t.rows===4&&t.cols===5);assert.deepEqual(result.merges,['0:0:2:1','0:1:2:1','0:2:1:2','0:4:2:1']);
 assert(plan.texts.includes('0'));assert(plan.texts.includes('㉠'));assert(plan.html.includes('&lt;보 기&gt;'));assert(!plan.html.includes('셀에 바로 입력'));
});
test('short answer combinations share one native row; long sentences retain their number and editable cell',async()=>{
 // 선지는 번호 너비만큼 들어간 본문 폭에 놓인다(평가원 지면). 317px 본문 = 단 폭 343px - 번호 "1. " 26px.
 const compact=await buildQuestionHtml(examples.questions[0],prep,343,{native:true});
 assert(compact.tables.some(t=>t.rows===1&&t.cols===5));
 const q=structuredClone(examples.questions[0]);q.style='문장·수식';q.choices.forEach((c,i)=>c.text=`물체 ${i+1}의 운동량 변화량은 충돌 과정에서 작용한 힘과 시간의 곱으로 구할 수 있다.`);
 const long=await buildQuestionHtml(q,prep,317,{native:true});assert(long.tables.some(t=>t.rows===5&&t.cols===1));
 for(const label of ['①','②','③','④','⑤'])assert(long.texts.some(t=>t.startsWith(label+' ')));
});
test('reference bogi uses an editable centered title cutout, thin rules and dotted labels',async()=>{
 const q=structuredClone(examples.questions[0]),bogi=q.blocks.find(b=>b.kind==='bogi');bogi.lines[1].label='ㄴ.';
 const plan=await buildQuestionHtml(q,prep,317,{native:true});
 assert.deepEqual(plan.tables.find(t=>t.rows===3&&t.cols===3).merges,['0:1:2:1','2:0:1:3']);
 assert(plan.html.includes('border-bottom:0.4pt solid #000'));assert(plan.html.includes('text-align:center;line-height:100%'));
 assert(plan.texts.includes('<보 기>'));assert(plan.texts.some(t=>t.startsWith('ㄱ. ')));assert(plan.texts.some(t=>t.startsWith('ㄴ. ')));assert(!plan.html.includes('ㄴ..'));
 assert(plan.html.includes('line-height:150%'));assert(!plan.html.includes('text-indent:-22px'));
});
test('five graph choices remain separate images in a two-column native table and paired materials stay grouped',async()=>{
 const q=structuredClone(examples.questions[2]),plan=await buildQuestionHtml(q,prep);
 assert.equal(plan.images.length,5);assert.deepEqual(plan.images,q.choices.map(c=>c.figure.data));
 assert(plan.tables.some(t=>t.rows===3&&t.cols===2));assert(plan.tables.some(t=>[1,2].includes(t.rows)&&t.cols===2));
 for(const label of ['①','②','③','④','⑤'])assert(plan.texts.some(v=>v.startsWith(label)));
 const matrix=await buildQuestionHtml(examples.questions[1],prep);assert(matrix.tables.some(t=>t.rows===6&&t.cols===5));
});
test('student handoff excludes teacher metadata and essay answers, escapes content, and preserves the editor',async()=>{
 const q=newQuestion('4','서술형');q.ask='설명하시오 <script>alert(1)</script>';q.intent='PRIVATE INTENT';q.explanation='PRIVATE EXPLANATION';q.modelAnswer='PRIVATE ANSWER';q.source='PRIVATE SOURCE';q.references=[{target:'question',label:'PRIVATE REF',quote:'PRIVATE QUOTE',documentId:'not-sent',page:1}];
 const before=structuredClone(q),plan=await buildQuestionHtml(q);
 assert(!plan.html.includes('PRIVATE'));assert(!plan.html.includes('<script>'));assert(plan.html.includes('&lt;script&gt;'));assert(!plan.html.includes('①'));assert.deepEqual(q,before);
 assert.equal(handoffQuestion(q).references.length,0);
});
test('hidden merged-cell text or pictures reject before loss, and blank prompts cannot be handed off',()=>{
 const q=structuredClone(examples.questions[0]),t=q.blocks.find(b=>b.kind==='table').table;t.cells[1][0].value='HIDDEN';
 assert.throws(()=>validate({format:FORMAT,questions:[q],documents:[]}),/숨은 셀/);
 t.cells[1][0].value='';t.cells[1][0].figure=structuredClone(examples.questions[2].choices[0].figure);assert.throws(()=>handoffQuestion(q),/숨은 셀/);
 const blank=newQuestion();assert.throws(()=>handoffQuestion(blank),/발문/);
});
test('native preflight rejects changed cell spans and missing pictures instead of accepting partial output',()=>{
 const png='data:image/png;base64,AQID',plan={texts:['물체 A'],images:[png],tables:[{rows:2,cols:2,merges:['0:0:1:2']}]};
 const controls=[{type:'table',stableIndex:[0,1,0],rowCount:2,colCount:2,cells:[{row:0,col:0,rowSpan:1,colSpan:2}]},{type:'image',secIdx:0,paraIdx:2,controlIdx:0,cellPath:[]}];
 const doc={getTextFileText:()=>JSON.stringify('물체 A'),pageCount:()=>1,getPageControlLayout:()=>JSON.stringify({controls}),getControlImageData:()=>new Uint8Array([1,2,3])};
 verifyNativeQuestion(doc,plan);controls[0].cells[0].colSpan=1;assert.throws(()=>verifyNativeQuestion(doc,plan),/병합/);controls[0].cells[0].colSpan=2;
 doc.getControlImageData=()=>new Uint8Array([9]);assert.throws(()=>verifyNativeQuestion(doc,plan),/그림/);
});
// 한글 엔진은 완성형 밖 글자를 문서에는 그대로 두고 getTextFileText로 꺼낼 때만 &#십진수; 로 바꾼다(2026-10-19 왕복 검사).
// 평가원 글머리표 ◦, ≳, ⇄ 등이 든 문항이 「일부 글을 읽지 못했습니다」로 통째로 실패하던 회귀.
test('native preflight reads characters the HWP text export writes as numeric references',()=>{
 const outsideKs='◦≳≲⇄⇌․—∙≈･・◯\ue034\ue036\ue037𝑥';
 const engineText=v=>[...v].map(c=>outsideKs.includes(c)?`&#${c.codePointAt(0)};`:c).join('');
 const texts=['〔실험 결과〕 ◦ 가설에 어긋나는 분자','Δx Δp ≳ h','A ⇄ B','2․3','\ue034 표시','𝑥'];
 const plan={texts,images:[],tables:[]},doc=body=>({getTextFileText:()=>JSON.stringify(engineText(body)),pageCount:()=>0});
 verifyNativeQuestion(doc(texts.join('\n')),plan);
 assert.throws(()=>verifyNativeQuestion(doc(texts.join('\n').replace('◦ ','')),plan),/읽지 못했습니다/,'a really missing character still fails');
 assert.equal(decodeNativeText('가&#9702;나 &#8819; &#119909;'),'가◦나 ≳ 𝑥');
 assert.equal(decodeNativeText('&#38; &#39; &#55296; &#9702'),'&#38; &#39; &#55296; &#9702','ASCII, surrogate and unterminated references stay as typed');
});
test('narrow table headers wrap units without changing Korean words or values',async()=>{
 assert.equal(wrapQuestionText('질량 (kg)',43,9),'질량\n(kg)');
 assert.equal(wrapQuestionText('충돌 시간 (s)',43,9),'충돌\n시간\n(s)');
 const plan=await buildQuestionHtml(examples.questions[0],prep,317,{native:true});
 // 평가원 표: 머리칸은 한 단계 작은 돋움체.
 assert(plan.html.includes('font-family:함초롬돋움;font-size:8pt">(kg)</p>'));
 assert(plan.texts.includes('질량 (kg)'));assert(plan.texts.some(v=>v.includes('0, 빈칸, ㉠')));
});
test('native layout preflight detects nested header and note overflow, while tall fractions do not enlarge text glyphs',()=>{
 const path=[{controlIndex:0,cellIndex:0,cellParaIndex:1},{controlIndex:0,cellIndex:1,cellParaIndex:0}];
 let runs=[{text:'kg)',x:149,y:40,w:20,h:12,fontSize:12,secIdx:0,parentParaIdx:1,cellPath:path}];
 const doc={pageCount:()=>1,getPageTextLayout:()=>JSON.stringify({runs}),getPageControlLayout:()=>JSON.stringify({controls:[]}),getTableCellBboxesByPath:(_s,_p,json)=>JSON.stringify(JSON.parse(json).length===1?[{cellIdx:0,pageIndex:0,row:0,col:0,x:10,y:10,w:200,h:100}]:[{cellIdx:1,pageIndex:0,row:0,col:1,x:100,y:30,w:60,h:40}]),getCellPropertiesByPath:()=>JSON.stringify({applyInnerMargin:true,paddingLeft:225,paddingRight:225,paddingTop:225,paddingBottom:225}),getPageDef:()=>JSON.stringify({width:15000,height:22000,marginLeft:0,marginRight:0,marginTop:0,marginBottom:0,marginGutter:0}),getColumnDef:()=>JSON.stringify({columnCount:1,sameWidth:true,spacing:0})};
 assert.throws(()=>assertNativeLayout(doc),/표 1행 2열/);
 runs=[{text:'표 아래 설명',x:20,y:98,w:70,h:12,fontSize:12,secIdx:0,parentParaIdx:1,cellPath:path.slice(0,1)}];
 assert(nativeLayoutIssues(doc).some(v=>v.reason.includes('테두리')));
 runs=[{text:'수식 앞',x:10,y:20,w:30,h:36,fontSize:12},{text:'다음 줄',x:10,y:42,w:30,h:12,fontSize:12}];
 assert.deepEqual(nativeLayoutIssues(doc),[]);
 runs[1].y=26;assert.throws(()=>assertNativeLayout(doc),/겹칩니다/);
});

test('empty bogi lines and choices keep one space after their label (ㄱ. ①) so typing starts after the gap',async()=>{
 const q=structuredClone(examples.questions.find(x=>x.blocks.some(b=>b.kind==='bogi'))),bogi=q.blocks.find(b=>b.kind==='bogi');
 bogi.lines.forEach(l=>{l.text='';});q.choices.forEach(c=>{c.text='';});
 const out=await buildQuestionHtml(q,prep,540,{native:true}),html=typeof out==='string'?out:out.html;
 assert.match(html,/ㄱ\.&nbsp;</);assert.match(html,/①&nbsp;</);
 const full=structuredClone(examples.questions.find(x=>x.blocks.some(b=>b.kind==='bogi'))),fullHtml=(o=>typeof o==='string'?o:o.html)(await buildQuestionHtml(full,prep,540,{native:true}));
 assert.doesNotMatch(fullHtml,/ㄱ\.&nbsp;/,'filled lines keep a normal space');
 assert.doesNotMatch(fullHtml,/카드에서 입력/);
});
