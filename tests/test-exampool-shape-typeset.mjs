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

test('a side material frame floats its picture at the start of the numbered passage (어울림), and the prompt after',async()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const q=shape('combo','small',q=>{q.blocks[0].text='그림과 같이 용수철에 물체를 매달았다.';q.blocks[1].figure={name:'a.png',data:png};});
  const plan=await buildQuestionHtml(q,async f=>({...f,width:200,height:100}),400),values=plan.textSegments.map(s=>s.value);
  assert.equal(values[0],'7. 그림과 같이 용수철에 물체를 매달았다.');assert.deepEqual(plan.textSegments[0].owner,{kind:'block',id:q.blocks[0].id,prefix:3});
  assert.ok(values.indexOf(q.ask)>0);assert.ok(!plan.tables.some(t=>t&&t.rows===1&&t.cols===2),'no side-by-side table');
  // 그림은 첫 문단 맨 앞(번호 글 앞)에 들어가고, 한글로 들여온 뒤 오른쪽 어울림으로 바뀐다.
  // 폭은 크기 40%: 단 폭에서 번호 너비를 뺀 본문 폭의 40%.
  assert.match(plan.html,/<p style="margin:4px 0;text-align:justify"><img [^>]*width="(\d+)"[^>]*>7\. 그림과/);assert.equal(Number(plan.html.match(/<img [^>]*width="(\d+)"/)[1]),Math.round((400-plan.bodyIndent)*.4));
  assert.deepEqual(plan.floats.map(f=>f.align),['Right']);assert.equal(plan.floats[0].data,png);assert.deepEqual(plan.imageOwners,[{kind:'block',id:q.blocks[1].id}]);
  q.blocks[1].align='왼쪽';assert.deepEqual((await buildQuestionHtml(q,async f=>({...f,width:200,height:100}),400)).floats.map(f=>f.align),['Left']);
});

test('cell paragraphs get one line segment per explicit break, tall enough for their equations',async()=>{
  const {cellEquationLines}=await import('../assets/exampool/sheet/typeset-model.js');
  const eq=h=>`<hp:equation id="1"><hp:sz width="10" height="${h}"/><hp:script>a</hp:script></hp:equation>`;
  const cell=body=>`<hp:p id="0"><hp:run><hp:tbl><hp:tc><hp:subList><hp:p id="1">${body}<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="660" horzpos="0" horzsize="21300" flags="393216"/></hp:linesegarray></hp:p></hp:subList></hp:tc></hp:tbl></hp:run></hp:p>`;
  const out=cellEquationLines(cell(`<hp:run><hp:t>ㄴ. </hp:t>${eq(1100)}<hp:t>의 관성&lt;<hp:lineBreak/></hp:t></hp:run><hp:run>${eq(2684)}<hp:t>이다.</hp:t></hp:run>`));
  const segs=[...out.matchAll(/<hp:lineseg [^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/(\w+)="(\d+)"/g)].map(([,k,v])=>[k,Number(v)])));
  assert.equal(segs.length,2);assert.deepEqual([segs[1].textpos,segs[1].vertpos,segs[1].vertsize],[17,1760,2684]);
  const flat=cell(`<hp:run><hp:t>ㄱ. </hp:t>${eq(1100)}<hp:t>뿐</hp:t></hp:run>`);assert.equal(cellEquationLines(flat),flat);
});

test('a picture-only paragraph starts where the previous paragraph ends and keeps a line segment',async()=>{
  const {restackPictureLines}=await import('../assets/exampool/sheet/native-hwpx.js');
  const text='<hp:p id="1"><hp:run><hp:t>글</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="100" vertsize="1100" spacing="660"/></hp:linesegarray></hp:p>';
  const pic='<hp:run><hp:pic id="0"><hp:sz width="13350" height="7200"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic></hp:run>';
  assert.match(restackPictureLines(text+`<hp:p id="2">${pic}<hp:linesegarray><hp:lineseg textpos="0" vertpos="23120" vertsize="7200" spacing="600"/></hp:linesegarray></hp:p>`),/vertpos="1860" vertsize="7200"/);
  assert.match(restackPictureLines(text+`<hp:p id="2">${pic}</hp:p>`),/<hp:linesegarray><hp:lineseg textpos="0" vertpos="1860" vertsize="7200" textheight="7200"[^>]*horzsize="13350"/);
});

test('every frame (5 forms x 7 structures) survives an Excel round trip and still builds the same HWP plan',async()=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url);
  const XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
  const {exportExcel,importExcel}=await import('../assets/exampool/sheet/excel.js');
  const {FORMS,STRUCTS}=await import('../assets/exampool/sheet/templates.js');
  const {writeField}=await import('../assets/exampool/sheet/vertical.js');
  const questions=[];let n=0;
  for(const form of Object.keys(FORMS))for(const struct of Object.keys(STRUCTS)){
    const q=questionFromShape({form,struct},String(++n));q.ask='옳은 것은?';q.points=n%2?3:2;
    writeField(q,'passage','질량이 m인 물체가 속력 v로 운동한다.');
    if(form==='combo'){writeField(q,'bogi','ㄱ. 운동량은 보존된다.\n에너지는 보존된다.\nㄷ. 충격량은 같다.');writeField(q,'choices','ㄱ\nㄴ\nㄱㄷ\nㄴㄷ\nㄱㄴㄷ');}
    if(form==='talk')writeField(q,'choices','A\nC\nAB\nBC\nABC');
    q.blocks.filter(b=>b.kind==='steps'||b.kind==='dialogue').forEach(b=>b.lines.forEach((l,i)=>l.text='말 '+i));
    questions.push(q);
  }
  const data={format:'5e-question-sheet-v2',questions,documents:[]};
  const bytes=await exportExcel(XLSX,JSZip,data),got=await importExcel(XLSX,JSZip,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.deepEqual(got.questions,questions);
  for(const [i,q] of got.questions.entries()){const a=await buildQuestionHtml(q),b=await buildQuestionHtml(questions[i]);assert.deepEqual(a.tables,b.tables);assert.deepEqual(a.texts,b.texts);}
  assert.equal(got.questions[0].form,'combo');assert.equal(got.questions[0].structure,'two');
});

test('changing the form on the card keeps form, type, style and the bogi/dialogue blocks in step',async()=>{
  const {formOf,formLosses,applyForm,syncForm}=await import('../assets/exampool/sheet/model.js');
  const q=shape('combo','two');assert.equal(formOf(q),'combo');assert.match(docOf(await buildQuestionHtml(q)),/<보 기>/);
  assert.deepEqual(formLosses(q,'single'),[],'an empty bogi is dropped without asking');
  applyForm(q,'single');assert.deepEqual([q.form,q.type,q.style],['single','객관식','문장·수식']);
  assert.equal(q.blocks.some(b=>b.kind==='bogi'),false,'a dropped bogi no longer prints in the HWP plan');
  assert.doesNotMatch(docOf(await buildQuestionHtml(q)),/<보 기>/);
  applyForm(q,'combo');q.blocks.find(b=>b.kind==='bogi').lines[0].text='운동량은 보존된다.';
  assert.equal(formLosses(q,'pair').length,1,'a bogi with text needs confirmation');
  applyForm(q,'pair');assert.deepEqual([q.form,q.type,q.style],['pair','객관식','대응표']);assert.deepEqual(q.choiceTable.cells[0].map(c=>c.value),['A','B','C']);
  applyForm(q,'talk');assert.equal(q.style,'조합');assert.ok(q.blocks.some(b=>b.kind==='dialogue'));assert.equal(formOf(q),'talk');
  applyForm(q,'essay');assert.deepEqual([q.form,q.type],['essay','서술형']);assert.equal(q.blocks.some(b=>b.kind==='dialogue'),false);
  assert.equal(q.blocks.filter(b=>b.kind==='figure').length,2,'material slots stay');
  // 저장된 form이 없는 예전·엑셀 문항은 type·style로 짐작하고 데이터는 건드리지 않는다.
  const old=shape('pair','none');delete old.form;assert.equal(formOf(old),'pair');syncForm(old);assert.equal(old.form,undefined);
  // 엑셀(세로 시트)에서 유형을 바꿔 들여오면 form도 같은 규칙으로 맞춘다.
  const {writeField}=await import('../assets/exampool/sheet/vertical.js');
  const e=shape('single','big');writeField(e,'type','서술형');assert.equal(e.form,'essay');writeField(e,'type','합답형');assert.equal(e.form,'combo');
});

test('an Excel file whose 문항유형 was changed comes back with a matching form',async()=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url);
  const XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
  const {exportExcel,importExcel}=await import('../assets/exampool/sheet/excel.js');
  const q=shape('single','none');const data={format:'5e-question-sheet-v2',questions:[q],documents:[]};
  const bytes=await exportExcel(XLSX,JSZip,data),wb=XLSX.read(bytes,{type:'array',cellStyles:true}),ws=wb.Sheets['문항'];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1});const r=rows.findIndex(x=>x[0]==='문항유형');assert.ok(r>=0);
  ws[XLSX.utils.encode_cell({r,c:1})]={t:'s',v:'서술형'};
  const out=XLSX.write(wb,{type:'array',bookType:'xlsx'}),got=await importExcel(XLSX,JSZip,out);
  assert.equal(got.questions[0].type,'서술형');assert.equal(got.questions[0].form,'essay');
});

test('validate(data,{only}) checks the edited question fully and the rest only for duplicate IDs',async()=>{
  const {validate}=await import('../assets/exampool/sheet/model.js');
  const a=shape('combo','two'),b=shape('single','none'),data={format:'5e-question-sheet-v2',questions:[a,b],documents:[]};
  assert.doesNotThrow(()=>validate(data,{only:a}));
  b.blocks[0].text=42;// 다른 문항의 잘못은 이 범위에서는 보지 않는다(전체 검사에서는 잡힌다)
  assert.doesNotThrow(()=>validate(data,{only:a}));assert.throws(()=>validate(data),/구성/);b.blocks[0].text='';
  a.ask='x'.repeat(40000);assert.throws(()=>validate(data,{only:a}),/너무 길거나/);a.ask='';
  b.id=a.id;assert.throws(()=>validate(data,{only:a}),/ID/);
});

test('copyTree snapshots for undo copy every object but share immutable strings',async()=>{
  const {copyTree}=await import('../assets/exampool/sheet/model.js');
  const q=shape('combo','two');q.blocks.find(b=>b.kind==='figure').figure={name:'f.png',data:'data:image/png;base64,'+'A'.repeat(1000),width:1,height:1};
  const data={format:'5e-question-sheet-v2',questions:[q],documents:[],exams:[]},copy=copyTree(data);
  assert.deepEqual(copy,data);assert.notEqual(copy.questions[0],q);assert.notEqual(copy.questions[0].blocks,q.blocks);
  copy.questions[0].ask='바뀜';copy.questions[0].blocks[0].text='바뀜';assert.notEqual(q.ask,'바뀜');assert.notEqual(q.blocks[0].text,'바뀜');
  const u8=new Uint8Array([1,2]),c2=copyTree({u8});assert.notEqual(c2.u8,u8);assert.deepEqual([...c2.u8],[1,2]);
});

test('an Excel download over the 20 MB re-upload limit says so instead of asking to pick a file',async()=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),fs=await import('node:fs');
  const XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
  const {exportExcel}=await import('../assets/exampool/sheet/excel.js');
  const png='data:image/png;base64,'+fs.readFileSync(new URL('../assets/exam-library/images/b1_2007_11_05.png',import.meta.url)).toString('base64');
  const questions=[];for(let i=0;i<110;i++){const q=shape('combo','two');q.number=String(i+1);q.blocks.filter(b=>b.kind==='figure').forEach(b=>b.figure={name:'f.png',data:png,width:600,height:300});questions.push(q);}
  await assert.rejects(exportExcel(XLSX,JSZip,{format:'5e-question-sheet-v2',questions,documents:[]}),/내려받을 엑셀이 [\d.]+ MB라 다시 올릴 수 있는 20 MB를 넘습니다/);
});

test('a space after a sub/superscript group keeps the native engine from extending the subscript',async()=>{
  const {normalizeEquationScript:n}=await import('../assets/exampool/sheet/typeset-model.js');
  assert.equal(n('T_{1}=\\frac{t_{1}}{10}'),'T_{1} =\\frac{t_{1}}{10}');assert.equal(n('T_{1}>T_{2}'),'T_{1} >T_{2}');
  assert.equal(n('x^{2}'),'x^{2}');assert.equal(n('a_{b_{c}}d'),'a_{b_{c}} d');assert.equal(n('A_{0} '),'A_{0} ');
});

test('picture choices keep their original KICE width (widthPt, 387pt column = typeset column)',async()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const q=shape('single','none',q=>{q.style='그림·그래프';q.choices.forEach((c,i)=>{c.text='';c.figure={name:`c${i}.png`,data:png,...(i===0?{widthPt:77.4}:{})};});});
  const plan=await buildQuestionHtml(q,async f=>({...f,width:2000,height:1000}),414);
  const widths=[...plan.html.matchAll(/<img [^>]*width="(\d+)"/g)].map(m=>Number(m[1]));
  assert.equal(widths[0],Math.round(77.4*414/387));assert.ok(widths[1]>widths[0],'pictures without widthPt fill their cell as before');
});
