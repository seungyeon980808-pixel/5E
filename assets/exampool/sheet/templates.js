import {newQuestion,block,makeTable} from './model.js';

export const TEMPLATES=[
  {id:'plain',name:'지문 + 보기',source:'글·수식 중심',shape:'text',description:'지문과 ㄱ·ㄴ·ㄷ 보기'},
  {id:'compare',name:'그림 두 개 비교',source:'물리 기출의 (가)·(나) 비교',shape:'compare',description:'두 그림을 나란히 배치'},
  {id:'experiment',name:'실험 + 장치 그림',source:'제공 자료 3·16번 구조',shape:'experiment',description:'상자 안에 과정과 장치 그림'},
  {id:'experiment-table',name:'실험 + 결과표',source:'제공 자료 14·23번 구조',shape:'table',description:'과정·결과표를 한 상자에 배치'},
  {id:'mixed',name:'그림 + 자료표',source:'제공 자료 19·24번 구조',shape:'mixed',description:'그림과 병합 가능한 표를 나란히'},
  {id:'graph-choices',name:'실험 + 그림 선지',source:'제공 자료 20번 구조',shape:'graphs',description:'과정·결과 그림과 다섯 그림 선지'}
];
export function questionFromTemplate(id,number,type='합답형',style){
  const template=TEMPLATES.find(t=>t.id===id);if(!template)throw Error('기출 모양을 선택하세요.');
  const q=newQuestion(number,type);q.templateKey=id;q.style=style||(id==='graph-choices'?'그림·그래프':type==='합답형'?'조합':'문장·수식');
  const add=(kind,parent,label)=>{const b=block(kind,parent,label);q.blocks.push(b);return b;};
  if(id==='compare'||id==='mixed'){q.preset=id==='compare'?'그림 비교':'그림·표';const g=add('group',null,'자료 비교');g.layout='나란히';add('figure',g.id,'(가)');add(id==='compare'?'figure':'table',g.id,'(나)');}
  if(['experiment','experiment-table','graph-choices'].includes(id)){
    q.preset='실험';const g=add('group',null,'실험');g.boxed=true;add('text',g.id,'실험 목적');add('steps',g.id,'실험 과정');
    if(id!=='experiment-table')add('figure',g.id,'실험 장치');
    if(id==='experiment-table'){const b=add('table',g.id,'실험 결과');b.table=makeTable(4,3);}
    if(id==='graph-choices')add('figure',g.id,'실험 결과');
  }
  if(type==='합답형'){const b=q.blocks.find(b=>b.kind==='bogi');q.blocks=q.blocks.filter(x=>x!==b);q.blocks.push(b);}
  return q;
}
