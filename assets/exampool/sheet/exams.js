// 시험지와 문항 보관함. 문항은 시험지 하나에 속하거나(시험지 순서 = 시험지 구성) 어디에도 속하지 않는다(보관함).
// 출제 완료한 시험지도 고칠 수 있다. 상태는 목록을 나누는 데만 쓴다.
import {validFrame} from './exam-flow.js';
export const EXAM_STATUS={drafting:'출제 중',done:'출제 완료'};
const now=()=>new Date().toISOString();
export function newExam(title='새 시험지'){return {id:crypto.randomUUID(),title,status:'drafting',items:[],createdAt:now(),updatedAt:now()};}
// 예전 데이터: 시험지 구성 하나(examSet)를 '출제 중인 시험지 1'로 옮긴다.
export function normalizeExams(data){
  if(!Array.isArray(data.exams)){data.exams=[];if(data.examSet?.items){data.exams.push({...newExam(data.examSet.title||'출제 중인 시험지 1'),items:[...data.examSet.items]});}}
  delete data.examSet;return data;
}
export function validateExams(data){
  const qids=new Set(data.questions.map(q=>q.id)),seen=new Set(),ids=new Set();
  if(!Array.isArray(data.exams)||data.exams.length>200)throw Error('시험지 목록을 확인하세요.');
  for(const e of data.exams){
    if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.title!=='string'||e.title.length>200||!Object.hasOwn(EXAM_STATUS,e.status)||!Array.isArray(e.items)||e.items.length>200)throw Error('시험지 정보를 확인하세요.');
    if(e.formId!==undefined&&(typeof e.formId!=='string'||e.formId.length>80))throw Error('시험지 양식 표시를 확인하세요.');
    // 문항 아래 여백(mm)·다음 단에서 시작(10-23 지적 9): 여백 0~200mm. 시험지에서 뺀 문항의 값은 남아도 쓰이지 않는다.
    if(e.after!==undefined&&(typeof e.after!=='object'||Object.values(e.after).some(v=>!(Number(v)>=0&&Number(v)<=200))))throw Error('시험지 문항 여백을 확인하세요.');
    if(e.breaks!==undefined&&(typeof e.breaks!=='object'||Object.values(e.breaks).some(v=>v!==true)))throw Error('시험지 단 나누기 표시를 확인하세요.');
    // 틀 · 시험지 속성(10-24 시험지 만들기 세 단계): exam.frame(basic·kice·sheet·form) · exam.goal(목표).
    if(!validFrame(e))throw Error('시험지 틀·속성을 확인하세요.');
    ids.add(e.id);
    for(const id of e.items){if(!qids.has(id)||seen.has(id))throw Error('시험지 구성의 문항 목록을 확인하세요.');seen.add(id);}
  }
}
export const examById=(data,id)=>data.exams.find(e=>e.id===id)||null;
export const examOf=(data,qid)=>data.exams.find(e=>e.items.includes(qid))||null;
export function libraryQuestions(data){const used=new Set(data.exams.flatMap(e=>e.items));return data.questions.filter(q=>!used.has(q.id));}
const touch=e=>{e.updatedAt=now();};
// 문항을 시험지에 넣는다(다른 시험지에 있으면 옮긴다). at이 없으면 맨 뒤.
export function addToExam(data,examId,qid,at){
  const exam=examById(data,examId);if(!exam)throw Error('시험지를 찾지 못했습니다.');
  for(const e of data.exams){const i=e.items.indexOf(qid);if(i>=0){e.items.splice(i,1);touch(e);}}
  exam.items.splice(at===undefined?exam.items.length:Math.max(0,Math.min(at,exam.items.length)),0,qid);touch(exam);
}
export function removeFromExam(data,qid){for(const e of data.exams){const i=e.items.indexOf(qid);if(i>=0){e.items.splice(i,1);touch(e);}}}
export function moveInExam(data,examId,qid,to){
  const exam=examById(data,examId),at=exam?.items.indexOf(qid);if(!exam||at<0)return false;
  to=Math.max(0,Math.min(to,exam.items.length-1));if(to===at)return false;exam.items.splice(at,1);exam.items.splice(to,0,qid);touch(exam);return true;
}
// 끌어 놓기의 파란 선은 「이 문항 앞」이다. 아래로 끌면 자기 자리가 빠지며 한 칸 당겨지므로 그만큼 뺀다(M17).
export function dropBeforeIndex(items,qid,beforeId){
  const at=items.indexOf(qid),target=items.indexOf(beforeId);if(at<0||target<0)return -1;
  return at<target?target-1:target;
}
// 시험지 순서대로 문항 번호(1, 2, …)를 매긴다.
export function renumberExam(data,examId){const exam=examById(data,examId);if(!exam)return;exam.items.forEach((id,i)=>{const q=data.questions.find(x=>x.id===id);if(q)q.number=String(i+1);});}
