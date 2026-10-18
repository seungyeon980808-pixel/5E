import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FORMAT,newQuestion,block,validate} from '../assets/exampool/sheet/model.js';
import {ROWS,fieldValue,writeField,applyVerticalValues} from '../assets/exampool/sheet/vertical.js';
import {FORMS,STRUCTS,questionFromShape,rankForms,rankStructs,autoLayout} from '../assets/exampool/sheet/templates.js';
import {columnName,address,parseClipboard} from '../assets/exampool/sheet/grid-model.js';
import {questionFingerprint,pageProfile,mathParts} from '../assets/exampool/sheet/typeset-model.js';
import {project,exportExcel,importExcel,enhanceZip} from '../assets/exampool/sheet/excel.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const row=key=>ROWS.findIndex(r=>r.key===key);
test('vertical fields preserve the requested order and Excel addresses past Z',()=>{
 assert.deepEqual(ROWS.slice(0,10).map(r=>r.label),['문항유형','발문','자료','지문','실험 과정','대화','보기','선지','정답','배점'],'required fields come first, in exam order');
 assert.deepEqual(ROWS.filter(r=>r.optional).map(r=>r.key),['steps','dialogue'],'older Excel files without these rows still open');
 assert.equal(columnName(26),'AA');assert.equal(address(7,1),'B8');assert.equal(parseClipboard('a\tb\tc',{maxRows:21,maxCols:500})[0].length,3);
});
test('a filtered vertical paste edits question columns by ID, retains pictures and preserves multiple concepts',()=>{
 const a=newQuestion('001'),b=newQuestion('002'),c=newQuestion('003'),data={format:FORMAT,questions:[a,b,c],documents:[]};
 applyVerticalValues(data,[c.id,a.id],[{r:row('unitLarge'),c:0,value:'운동과 에너지'},{r:row('concepts'),c:1,value:'힘, 운동량, 힘\n충격량'}]);
 assert.equal(c.unitLarge,'운동과 에너지');assert.equal(b.unitLarge,undefined);assert.deepEqual(a.concepts,['힘','운동량','충격량']);
 const figure=block('figure');figure.figure={name:'사진',data:'data:image/png;base64,AAAA'};a.blocks.push(figure);
 applyVerticalValues(data,[a.id],[{r:row('materials'),c:0,value:''}],{clear:true});assert.equal(a.blocks.at(-1).figure.name,'사진');assert.match(fieldValue(a,'materials'),/그림 ✓/,'the 자료 cell shows which slots hold a picture');
 assert.throws(()=>applyVerticalValues(data,[a.id],[{r:row('materials'),c:0,value:'그림 없음'}]),/더블클릭/);
});
test('text choices and statements keep identities and evidence, while table/graph choices require their own editor',()=>{
 const q=newQuestion('1','합답형'),b=q.blocks.find(b=>b.kind==='bogi'),id=b.lines[0].id;
 q.references=[{target:id,label:'근거',quote:'내용'}];writeField(q,'bogi','ㄱ. 질량 보존\nㄴ. 운동량 보존');assert.equal(b.lines[0].id,id);assert.equal(b.lines[0].text,'질량 보존');assert.equal(q.references.length,1);
 const cid=q.choices[0].id;writeField(q,'choices','① 0\n② 1.0\n③ ㉠\n④ 001\n⑤ $v_0$');assert.equal(q.choices[0].id,cid);assert.equal(q.choices[1].text,'1.0');
 q.style='대응표';assert.match(fieldValue(q,'choices'),/대응표/);assert.throws(()=>writeField(q,'choices','new'),/구성 편집/);
});
test('new question frames: 4 forms x 7 material structures, ranked by past exams, layout chosen automatically',()=>{
 for(const form of Object.keys(FORMS))for(const struct of Object.keys(STRUCTS))validate({format:FORMAT,questions:[questionFromShape({form,struct},'1')],documents:[]});
 const forms=rankForms('all');assert.equal(forms.total,1440);assert.deepEqual(forms.list.map(o=>o.k),['combo','single','pair','talk']);assert.deepEqual(forms.list.map(o=>o.rec),[true,true,false,false]);
 const combo=rankStructs('all','combo');assert.equal(combo.total,1089);assert.equal(combo.list.filter(o=>o.rec).length,2);assert.equal(combo.list.reduce((n,o)=>n+o.n,0),1089);
 assert.equal(autoLayout('all','combo','small'),'side');assert.equal(autoLayout('all','combo','big'),'below');assert.equal(autoLayout('all','combo','none'),null);assert.equal(autoLayout('all','combo','two'),'row');
 const exp=questionFromShape({form:'combo',struct:'experiment'},'2'),box=exp.blocks.find(b=>b.kind==='group');
 assert.equal(exp.type,'합답형');assert.equal(exp.style,'조합');assert.ok(box.boxed);assert.ok(exp.blocks.find(b=>b.kind==='table'&&b.parent===box.id));assert.equal(exp.blocks.at(-1).kind,'bogi');assert.equal(exp.points,2);
 const pair=questionFromShape({form:'pair',struct:'none'},'3');assert.equal(pair.style,'대응표');assert.deepEqual(pair.choiceTable.cells[0].map(c=>c.value),['A','B','C']);assert.ok(!pair.blocks.some(b=>b.kind==='bogi'));
 const talk=questionFromShape({form:'talk',struct:'big'},'4');assert.deepEqual(talk.blocks.find(b=>b.kind==='dialogue').lines.map(l=>l.label),['학생 A','학생 B','학생 C']);assert.ok(talk.blocks.some(b=>b.kind==='figure'&&!b.parent));
 const cond=questionFromShape({form:'single',struct:'condition'},'5'),cbox=cond.blocks.find(b=>b.kind==='group');assert.equal(cbox.label,'');assert.ok(cbox.boxed);
 // 글 옆 작은 자료: 첫 지문 문단에 붙은 어울림 그림(오른쪽), 시트의 지문 칸은 그 글이다.
 const small=questionFromShape({form:'combo',struct:'small'},'6'),side=small.blocks[1];assert.equal(side.kind,'figure');assert.equal(side.layout,'어울림');assert.equal(side.size,40);assert.equal(side.parent,null);
 writeField(small,'passage','그림과 같이 물체가 운동한다.');assert.equal(small.blocks[0].text,'그림과 같이 물체가 운동한다.');assert.equal(fieldValue(small,'passage'),'그림과 같이 물체가 운동한다.');
 const two=questionFromShape({form:'combo',struct:'two'},'7');assert.deepEqual(two.blocks.filter(b=>b.kind==='figure').map(b=>b.label),['(가)','(나)']);
 assert.throws(()=>questionFromShape({form:'combo'},'8'),/자료 구조/);
});
test('vertical Excel edits metadata, passage, choices and bogi without being overwritten by the composition projection',async()=>{
 const q=newQuestion('001','합답형'),data={format:FORMAT,questions:[q],documents:[]},{wb,pack,images}=project(XLSX,data),ws=wb.Sheets['문항'];
 assert.equal(ws.A1.v,'항목');assert.equal(ws.A2.v,'문항유형');
 const set=(key,value)=>ws[XLSX.utils.encode_cell({r:ROWS.findIndex(row=>row.key===key)+1,c:1})]={t:'s',v:value};
 set('unitLarge','역학');set('concepts','힘, 운동량');set('managementId','PHY-001');set('passage','바뀐 지문 $\\frac{1}{2}mv^2$');set('choices','① 가\n② 나\n③ 다\n④ 라\n⑤ 마');set('bogi','ㄱ. 실험 결과\nㄴ. 결론');
 const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));await enhanceZip(zip,wb.SheetNames,images,pack.excel.indices);
 const got=await importExcel(XLSX,JSZip,await zip.generateAsync({type:'arraybuffer'}));assert.equal(got.questions[0].managementId,'PHY-001');assert.deepEqual(got.questions[0].concepts,['힘','운동량']);assert.match(fieldValue(got.questions[0],'passage'),/바뀐 지문/);assert.equal(got.questions[0].choices[4].text,'마');assert.equal(got.questions[0].blocks.find(b=>b.kind==='bogi').lines[1].text,'결론');
});
test('old horizontal structural workbooks remain readable',async()=>{
 const q=newQuestion('007'),data={format:FORMAT,questions:[q],documents:[]},{wb,pack,images}=project(XLSX,data);
 wb.Sheets['문항']=XLSX.utils.aoa_to_sheet([['번호','답안형','자료 구성','선지 표현','성취기준','발문','정답','배점','출처','해설','출제 의도','문항 ID'],[q.number,q.type,q.preset,q.style,q.standardCode,q.ask,'',q.points,q.source,q.explanation,q.intent,q.id]]);
 const zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array'}));await enhanceZip(zip,wb.SheetNames,images,pack.excel.indices);
 const got=await importExcel(XLSX,JSZip,await zip.generateAsync({type:'arraybuffer'}));assert.deepEqual(got.questions,[q]);
});
test('stored typesetting survives Excel, and changed question content invalidates its approval',async()=>{
 const q=newQuestion('01'),hash=await questionFingerprint(q);q.typeset={bytes:'AAAA',fingerprint:hash,baselineText:'',profile:{paper:'A4',columns:2},pageMode:'question-column',pageDef:{width:26078,height:60094,marginLeft:850,marginRight:850},columnDef:{columnCount:1,sameWidth:true,spacing:0},layoutVersion:10,metrics:{usedHeightMm:199,targetHeightMm:267,exceeded:false},verified:true};
 const data={format:FORMAT,questions:[q],documents:[]},bytes=await exportExcel(XLSX,JSZip,data),got=await importExcel(XLSX,JSZip,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));assert.deepEqual(got.questions,[q]);
 q.references.push({target:'question',label:'성취기준',quote:'근거'});assert.equal(await questionFingerprint(q),hash);q.ask='새 발문';assert.notEqual(await questionFingerprint(q),hash);
});
test('A4 two columns and mixed LaTeX/Hancom math keep native placement tokens',()=>{
 const p=pageProfile();assert.equal(p.page.width,59528);assert.ok(p.width>300&&p.width<330);assert.throws(()=>pageProfile({paper:'A5',columns:3}),/용지/);
 const parts=mathParts('에너지 $\\frac{1}{2}mv^2$, 속력 \\(v_0\\), {{수식:1 over 2}}');assert.deepEqual(parts.filter(p=>p.math).map(p=>p.text),['\\frac{1}{2}mv^2','v_0','1 over 2']);
});
test('choice and bogi cells carry no ①·ㄱ. numbers; combinations are normalized and put in the usual order',()=>{
 const q=newQuestion('1','합답형');writeField(q,'bogi','ㄱ. 질량 보존\nㄱ과 ㄴ의 비는 같다');
 assert.deepEqual(q.blocks.find(b=>b.kind==='bogi').lines.map(l=>l.text),['질량 보존','ㄱ과 ㄴ의 비는 같다']);assert.equal(fieldValue(q,'bogi'),'질량 보존\nㄱ과 ㄴ의 비는 같다');
 q.answer=0;const ids=q.choices.map(c=>c.id);
 writeField(q,'choices','ㄴㄷ\n① ㄱ\nㄷ ㄱ\nㄴ\nㄱ,ㄴ,ㄷ');
 assert.deepEqual(q.choices.map(c=>c.text),['ㄱ','ㄴ','ㄱ, ㄷ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ']);assert.equal(q.answer,3,'정답은 고른 선지(ㄴ, ㄷ)를 따라간다');assert.equal(q.choices[3].id,ids[0]);
 assert.equal(fieldValue(q,'choices'),'ㄱ\nㄴ\nㄱ, ㄷ\nㄴ, ㄷ\nㄱ, ㄴ, ㄷ');
 const t=newQuestion('2','객관식');t.style='조합';writeField(t,'choices','A\nC\nAB\nBC\nABC');assert.deepEqual(t.choices.map(c=>c.text),['A','C','A, B','B, C','A, B, C']);
 const s=newQuestion('3','객관식');writeField(s,'choices','AB\n2v\nㄱㄴ\n4\n5');assert.deepEqual(s.choices.map(c=>c.text),['AB','2v','ㄱㄴ','4','5'],'일반 정답형은 그대로');
});
test('experiment steps and student dialogue are edited as sheet lines',()=>{
 const q=newQuestion('1','합답형','실험');q.blocks.push(block('dialogue'));
 writeField(q,'steps','(가) 공을 굴린다.\n속력을 잰다.');
 assert.deepEqual(q.blocks.find(b=>b.kind==='steps').lines.map(l=>[l.label,l.text]),[['(가)','공을 굴린다.'],['(나)','속력을 잰다.']]);
 writeField(q,'dialogue','민수: 속력은 일정해.\n지아: 아니야, 증가해.');
 assert.deepEqual(q.blocks.find(b=>b.kind==='dialogue').lines.map(l=>[l.label,l.text]),[['민수','속력은 일정해.'],['지아','아니야, 증가해.']]);
 assert.equal(fieldValue(q,'dialogue'),'민수: 속력은 일정해.\n지아: 아니야, 증가해.');
 const plain=newQuestion('2','객관식','글·수식');assert.throws(()=>writeField(plain,'steps','과정'),/실험 과정 자리가 없습니다/);writeField(plain,'steps','');
});
