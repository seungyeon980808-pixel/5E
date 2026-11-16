// 1.7.1 확장자 통일: 5E_exam의 파일 저장·열기를 한 곳에 모은다(화면 없음 — 단위 검사로 지킴).
// 저장: 문항·시험지 묶음(5e-question-sheet-v2)을 .5e(kind 'sheet')로. 그림은 assets/로, 학교 양식은 forms/<i>로 빠진다.
// 열기: 확장자가 아니라 안쪽 바이트로 가른다 — .5e(sheet), 1.7.0 .exampool(시험지 파일·옛 ExamPool), 엑셀(.xlsx).
//   그림(drawing)·한글 시험지(exam) .5e나 1.6.x 그림 JSON이면 {kind:'project'}를 돌려주어 맞는 프로그램으로 넘기게 한다.
import {FORMAT,validate,fromLegacy,STORE_LIMIT_MB} from './model.js';
import {buildFiveEProject,parseFiveEProject} from '../../../js/fivee-project.js?v=1.7.0-four-session-integration';
import {isZip,unzipStore} from '../../../js/backup-zip.js?v=1.7.0-four-session-integration';
import {MAX_PROJECT_FILE_BYTES} from '../../../js/project-file-policy.js?v=1.7.0-four-session-integration';

export const SHEET_FILE_ACCEPT='.5e,.xlsx,.exampool,.json';
const u8=v=>v instanceof Uint8Array?v:ArrayBuffer.isView(v)?new Uint8Array(v.buffer,v.byteOffset,v.byteLength):new Uint8Array(v);
const fromBase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const projectFileName=title=>`${String(title||'5E_exam').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^\.+/,'').trim().slice(0,120)||'5E_exam'}.5e`;

// 시험지 하나(scope 'exam')를 담을 묶음: 그 시험지의 문항·참고 자료·학교 양식·조판 기준.
export function examBundle(data,exam,{forms=[],standards=[]}={}){
  const qs=exam.items.map(id=>data.questions.find(q=>q.id===id)).filter(Boolean),docIds=new Set(qs.flatMap(q=>(q.references||[]).map(r=>r.documentId)));
  const form=exam.formId?forms.find(f=>f.id===exam.formId):null,std=form?.standardId?standards.find(s=>s.id===form.standardId):null;
  return {format:FORMAT,scope:'exam',questions:qs,documents:data.documents.filter(d=>docIds.has(d.id)),exams:[exam],...(form?{forms:[form]}:{}),...(std?{standards:[std]}:{})};
}
// 묶음 → .5e(Blob). forms의 bytes는 Uint8Array여야 한다(1.7.0 .exampool처럼 base64로 JSON 안에 넣지 않음).
export function buildSheetProject(bundle,{name=''}={}){
  const forms=bundle.forms?.map(f=>({...f,bytes:u8(f.bytes)}));
  return buildFiveEProject({kind:'sheet',name:String(name).slice(0,200),...bundle,...(forms?{forms}:{})});
}

function peekKind(bytes){
  try{const files=unzipStore(bytes,{maxEntryBytes:MAX_PROJECT_FILE_BYTES,maxTotalBytes:MAX_PROJECT_FILE_BYTES}),raw=files.get('manifest.json');
    if(!raw)return null;const m=JSON.parse(new TextDecoder().decode(raw));
    return m?.format==='5e-project'?String(m.kind):m?.format==='5e-exam'?'exam':null;}
  catch{return null;}
}
// 불러올 내용(pending): {questions,documents,exams,backedIds,warnings,forms:[{…,bytes}],standards,fileName}
function fromSheetBundle(v){
  const pending={...validate(v),exams:Array.isArray(v.exams)?v.exams.map(e=>({...e,items:(e.items||[]).filter(id=>v.questions.some(q=>q.id===id))})):[],backedIds:v.questions.map(q=>q.id),warnings:[]};
  pending.forms=Array.isArray(v.forms)?v.forms.filter(f=>f&&typeof f.id==='string'&&(f.bytes instanceof Uint8Array||typeof f.base64==='string')).map(({base64,...f})=>({...f,bytes:f.bytes instanceof Uint8Array?f.bytes:fromBase64(base64)})):[];
  pending.standards=Array.isArray(v.standards)?v.standards.filter(x=>x&&typeof x.id==='string'):[];
  return pending;
}
async function fromLegacyPool(v){
  const {decodePoolBundle}=await import('../../../js/exampool-model.js?v=1.7.0-four-session-integration');
  const pack=decodePoolBundle(JSON.stringify(v));
  const pending=validate({format:FORMAT,questions:pack.items.map(fromLegacy),documents:pack.resources.map(d=>({id:d.id,name:d.title,kind:d.kind==='교과서'?'textbooks':'references',mime:d.mime,data:`data:${d.mime};base64,${d.base64}`,pages:d.pages}))});
  return {...pending,backedIds:pack.items.map(q=>q.id),warnings:[],forms:[],standards:[]};
}

// 돌려줌: {kind:'sheet', pending} 또는 {kind:'project', projectKind} (다른 프로그램 파일 — 넘겨 열기)
export async function readSheetFile(name,input,{importExcel}={}){
  const bytes=u8(input),excel=async()=>{if(!importExcel)throw Error('엑셀을 읽을 준비가 되지 않았습니다.');const p=await importExcel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));return {...p,forms:[],standards:[]};};
  let result;
  if(/\.xlsx$/i.test(name))result={kind:'sheet',pending:await excel()};
  else if(isZip(bytes)){
    const kind=peekKind(bytes);
    if(kind==='sheet'){const {kind:_,name:__,projectId,scope,...v}=parseFiveEProject(bytes);result={kind:'sheet',pending:fromSheetBundle(v)};}
    else if(kind)result={kind:'project',projectKind:kind};
    else result={kind:'sheet',pending:await excel()};// 이름이 바뀐 엑셀
  }else{
    if(bytes.length>STORE_LIMIT_MB*1024*1024)throw Error(`${STORE_LIMIT_MB} MB 이하의 문항 파일을 선택하세요.`);
    let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('지원하는 문항 파일이 아닙니다.');}
    if(v?.format===FORMAT)result={kind:'sheet',pending:fromSheetBundle(v)};
    else if(v&&!v.format&&Array.isArray(v.pages))result={kind:'project',projectKind:'drawing'};// 1.6.x 그림(.5e JSON·.json)
    else result={kind:'sheet',pending:await fromLegacyPool(v)};
  }
  if(result.kind==='sheet')result.pending.fileName=String(name||'불러온 파일');
  return result;
}
