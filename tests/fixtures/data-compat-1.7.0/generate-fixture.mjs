// 1.7.0 정식판 코드로 「1.7.0이 만든 파일」 고정 자료를 만든다(1.7.1이 그대로 여는지 지키는 검사용).
// 쓰는 법: git archive v1.7.0 js assets/exampool | tar -x -C <폴더>
//          node tests/fixtures/data-compat-1.7.0/generate-fixture.mjs <폴더>
// 결과(이 폴더): drawing-1.7.0.5e(그림) · exam-1.7.0.5e(한글 시험지) · sheet-1.7.0.exampool(5E_exam 「시험지 파일로 저장」) · pool-1.7.0.exampool(옛 ExamPool)
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
const src=path.resolve(process.argv[2]||'.'),out=path.dirname(fileURLToPath(import.meta.url));
const load=p=>import(pathToFileURL(path.join(src,p)).href);
const {buildFiveEProject}=await load('js/fivee-project.js');
const {buildExamProject}=await load('js/rhwp-exam-project.js');
const {zipStore}=await load('js/backup-zip.js');
const model=await load('assets/exampool/sheet/model.js');
const {newExam}=await load('assets/exampool/sheet/exams.js');
const {encodePool}=await load('js/exampool-model.js');
const {copyStandard,KICE_STANDARD,validateStandard}=await load('assets/exampool/sheet/typeset-standard.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const fixed=(o,id)=>{o.id=id;return o;};
const drawing={version:'0.17',activePageId:'p1',pages:[{id:'p1',name:'그림 1',objects:[{id:'img1',type:'image',x:0,y:0,w:20,h:20,src:png},{id:'t1',type:'text',x:5,y:30,text:'1.7.0 그림'}]}]};
const bytes=async b=>new Uint8Array(await b.arrayBuffer());
fs.writeFileSync(path.join(out,'drawing-1.7.0.5e'),await bytes(buildFiveEProject({kind:'drawing',projectId:'fixture-drawing-170',drawing,workspace:{drawing}})));
const hwpx=await bytes(zipStore([{name:'mimetype',data:new TextEncoder().encode('application/hwp+zip')}]));
fs.writeFileSync(path.join(out,'exam-1.7.0.5e'),await bytes(buildExamProject({projectId:'fixture-exam-170',name:'1.7.0 한글 시험지',documentBytes:hwpx,figures:[{id:'fig1',name:'그림',version:1,source:drawing}]})));
// 5E_exam 「시험지 파일로 저장」(app.js saveExamFile, 1.7.0)과 같은 모양
const q1=model.newQuestion('1','객관식');model.applyPreset(q1,'그림');fixed(q1,'q-170-1');q1.ask='1.7.0 문항 하나';q1.blocks.find(b=>b.kind==='figure').figure={name:'그림',data:png,width:1,height:1};q1.createdAt='2026-11-16T00:00:00.000Z';
const q2=fixed(model.newQuestion('2','합답형'),'q-170-2');q2.ask='1.7.0 문항 둘';q2.createdAt='2026-11-16T00:00:00.000Z';
const exam={...newExam('1.7.0 시험지'),id:'exam-170',items:[q1.id,q2.id],formId:'form-170',createdAt:'2026-11-16T00:00:00.000Z',updatedAt:'2026-11-16T00:00:00.000Z'};
const formBytes=hwpx,b64=u=>Buffer.from(u).toString('base64');
const std={...copyStandard(KICE_STANDARD),id:'std-170',name:'1.7.0 기준'};validateStandard(std);
const sheet={format:model.FORMAT,questions:[q1,q2],documents:[],exams:[exam],forms:[{id:'form-170',name:'1.7.0 양식',fileName:'양식.hwpx',encrypted:false,structure:{},standardId:'std-170',createdAt:'2026-11-16T00:00:00.000Z',base64:b64(formBytes)}],standards:[std]};
model.validate(sheet);
fs.writeFileSync(path.join(out,'sheet-1.7.0.exampool'),JSON.stringify(sheet));
// 옛 ExamPool(숨긴 화면) 「문항 파일」
try{const {newQuestion:legacyQuestion}=await load('js/exampool-model.js');const lq=legacyQuestion();lq.id='legacy-170';
  fs.writeFileSync(path.join(out,'pool-1.7.0.exampool'),encodePool([lq],v=>v,[]));}catch(e){console.error('옛 ExamPool 고정 자료는 건너뜀:',e.message);}
console.log('만듦:',fs.readdirSync(out).filter(f=>!f.endsWith('.mjs')).join(', '));
