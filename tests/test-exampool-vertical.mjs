import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FORMAT,newQuestion,block,validate} from '../assets/exampool/sheet/model.js';
import {ROWS,fieldValue,writeField,applyVerticalValues} from '../assets/exampool/sheet/vertical.js';
import {TEMPLATES,questionFromTemplate} from '../assets/exampool/sheet/templates.js';
import {columnName,address,parseClipboard} from '../assets/exampool/sheet/grid-model.js';
import {questionFingerprint,pageProfile,mathParts} from '../assets/exampool/sheet/typeset-model.js';
import {project,exportExcel,importExcel,enhanceZip} from '../assets/exampool/sheet/excel.js';
const require=createRequire(import.meta.url),XLSX=require('../assets/exampool/sheet/vendor/xlsx.full.min.js'),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
test('vertical fields preserve the requested order and Excel addresses past Z',()=>{
 assert.deepEqual(ROWS.slice(0,13).map(r=>r.label),['문항유형','대단원','중단원','소단원','성취기준','핵심개념','문항관리번호','발문','자료','사진','지문','선지','보기']);
 assert.equal(columnName(26),'AA');assert.equal(address(7,1),'B8');assert.equal(parseClipboard('a\tb\tc',{maxRows:21,maxCols:500})[0].length,3);
});
test('a filtered vertical paste edits question columns by ID, retains pictures and preserves multiple concepts',()=>{
 const a=newQuestion('001'),b=newQuestion('002'),c=newQuestion('003'),data={format:FORMAT,questions:[a,b,c],documents:[]};
 applyVerticalValues(data,[c.id,a.id],[{r:1,c:0,value:'운동과 에너지'},{r:5,c:1,value:'힘, 운동량, 힘\n충격량'}]);
 assert.equal(c.unitLarge,'운동과 에너지');assert.equal(b.unitLarge,undefined);assert.deepEqual(a.concepts,['힘','운동량','충격량']);
 const figure=block('figure');figure.figure={name:'사진',data:'data:image/png;base64,AAAA'};a.blocks.push(figure);
 applyVerticalValues(data,[a.id],[{r:9,c:0,value:''}],{clear:true});assert.equal(a.blocks.at(-1).figure.name,'사진');
 assert.throws(()=>applyVerticalValues(data,[a.id],[{r:9,c:0,value:'그림 없음'}]),/편집/);
});
test('text choices and statements keep identities and evidence, while table/graph choices require their own editor',()=>{
 const q=newQuestion('1','합답형'),b=q.blocks.find(b=>b.kind==='bogi'),id=b.lines[0].id;
 q.references=[{target:id,label:'근거',quote:'내용'}];writeField(q,'bogi','ㄱ. 질량 보존\nㄴ. 운동량 보존');assert.equal(b.lines[0].id,id);assert.equal(b.lines[0].text,'질량 보존');assert.equal(q.references.length,1);
 const cid=q.choices[0].id;writeField(q,'choices','① 0\n② 1.0\n③ ㉠\n④ 001\n⑤ $v_0$');assert.equal(q.choices[0].id,cid);assert.equal(q.choices[1].text,'1.0');
 q.style='대응표';assert.match(fieldValue(q,'choices'),/대응표/);assert.throws(()=>writeField(q,'choices','new'),/구성 편집/);
});
test('past-question templates separate answer mode, material hierarchy and choice presentation',()=>{
 for(const t of TEMPLATES)validate({format:FORMAT,questions:[questionFromTemplate(t.id,'1')],documents:[]});
 const q=questionFromTemplate('experiment-table','2','객관식','대응표'),group=q.blocks.find(b=>b.kind==='group');assert.ok(group.boxed);assert.ok(q.blocks.find(b=>b.kind==='table'&&b.parent===group.id));assert.equal(q.style,'대응표');assert.equal(q.blocks.filter(b=>b.kind==='bogi').length,0);
 assert.equal(questionFromTemplate('graph-choices','3','객관식','문장·수식').style,'문장·수식');
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
