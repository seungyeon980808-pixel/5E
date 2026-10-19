import {newQuestion,block,makeTable,WRAP} from './model.js';
import {RECORDS as RAW} from './shape-stats.js';

// 새 문항 틀: ① 유형 → ② 자료 구조, 클릭 2번. 배치는 고르지 않고 기출에서 가장 많이 쓰인 배치로 정한다.
// 그림·그래프·표는 모두 '자료'다. 무엇을 넣을지는 틀을 만든 뒤 엑셀(구성 편집)에서 칸마다 고른다.
export const SUBJECTS={all:'전체 8과목',p1:'물리학Ⅰ',p2:'물리학Ⅱ',c1:'화학Ⅰ',c2:'화학Ⅱ',b1:'생명과학Ⅰ',b2:'생명과학Ⅱ',e1:'지구과학Ⅰ',e2:'지구과학Ⅱ'};
export const FORMS={
  combo:{name:'합답형',desc:'<보기> ㄱ·ㄴ·ㄷ 중 옳은 것을 모두 고른다'},
  single:{name:'일반 정답형',desc:'값·식·낱말·문장 중 하나를 고른다'},
  pair:{name:'대응·짝 고르기형',desc:'A·B·C에 들어갈 것을 짝지어 고른다'},
  talk:{name:'학생 대화·발표형',desc:'옳게 말한 학생을 고른다'},
  essay:{name:'서술형',desc:'선지 없이 모범 답안을 쓴다'}
};
export const STRUCTS={
  two:{name:'자료 2개 (가)·(나)',desc:'자료 두 칸. 칸마다 그림·그래프·표 중 하나'},
  big:{name:'큰 자료 1개',desc:'글 아래 단 폭. 그림·그래프·표 중 하나'},
  small:{name:'작은 자료 1개',desc:'글 옆. 그림·그래프·표 중 하나'},
  condition:{name:'설명·조건 상자',desc:'제목 없는 상자에 조건·설명, 자료도 넣을 수 있다'},
  many:{name:'자료 3개 이상',desc:'(가)·(나)·(다) 세 칸. 칸 추가·묶기는 만든 뒤에'},
  experiment:{name:'실험 상자',desc:'[실험 과정]·[실험 결과], 장치 그림·결과 자료'},
  none:{name:'자료 없이 글만',desc:'그림·표 없이 글과 발문만'}
};
export const LAYOUTS={below:'글 아래',row:'가로',side:'글 옆',stack:'위아래',mix:'혼합'};

// 조사 기록의 자료 1개(표 하나 포함)는 글 옆이면 작은 자료, 그 밖이면 큰 자료. 자료 3개와 묶음 속 자료는 '자료 3개 이상'.
export const RECORDS=RAW.map(r=>{const s=r[2]==='one'||r[2]==='table'?(r[3]==='side'?'small':'big'):r[2]==='three'||r[2]==='complex'?'many':r[2];return [r[0],r[1],s,...r.slice(3)];});
export const recordsFor=(subject='all')=>subject==='all'?RECORDS:RECORDS.filter(r=>r[0]===subject);
const filter=(rs,{form,struct}={})=>rs.filter(r=>(!form||r[1]===form)&&(!struct||r[2]===struct));
const tally=(rs,i)=>{const m={};for(const r of rs)m[r[i]]=(m[r[i]]||0)+1;return m;};
// 많은 순서. 같으면 정의 순서. 추천은 문항이 있는 위 두 개.
function ranked(keys,counts){return keys.map((k,i)=>({k,i,n:counts[k]||0})).sort((a,b)=>b.n-a.n||a.i-b.i).map(({k,n},i)=>({k,n,rec:i<2&&n>0}));}
export function rankForms(subject){const rs=recordsFor(subject);return {total:rs.length,list:ranked(Object.keys(FORMS),tally(rs,1))};}
export function rankStructs(subject,form){const rs=filter(recordsFor(subject),{form});return {total:rs.length,list:ranked(Object.keys(STRUCTS),tally(rs,2))};}
export const sameShape=(subject,form,struct)=>filter(recordsFor(subject),{form,struct});
// 작은 자료는 글 옆, 큰 자료는 글 아래, 나머지는 같은 과목·유형·구조에서 가장 많이 쓰인 배치.
export function autoLayout(subject,form,struct){
  if(!struct||struct==='none')return null;
  if(struct==='small')return 'side';if(struct==='big')return 'below';
  const counts=tally(sameShape(subject,form,struct),3);delete counts.none;
  const best=Object.keys(LAYOUTS).map(k=>[k,counts[k]||0]).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1])[0];
  return best?best[0]:['two','many'].includes(struct)?'row':'below';
}

const TYPE={combo:'합답형',single:'객관식',pair:'객관식',talk:'객관식',essay:'서술형'};
const STYLE={combo:'조합',single:'문장·수식',pair:'대응표',talk:'조합',essay:'문장·수식'};
const PRESET={none:'글·수식',condition:'글·수식',big:'그림',small:'그림',two:'그림 비교',many:'그림 비교',experiment:'실험'};
const CAPS=['(가)','(나)','(다)'];
// 유형·자료 구조 → 문항 틀. 블록 순서가 한글 문서의 순서다(보기는 발문 뒤에 찍힌다).
export function questionFromShape({form,struct,subject='all'},number){
  if(!FORMS[form])throw Error('유형을 고르세요.');if(!STRUCTS[struct])throw Error('자료 구조를 고르세요.');
  const layout=autoLayout(subject,form,struct);
  const q=newQuestion(number,TYPE[form]);
  q.preset=form==='talk'?'대화':PRESET[struct];q.style=STYLE[form];q.form=form;q.structure=struct;q.templateKey=`${form}/${struct}`;
  // 평가원 문항은 대부분 2점이다. 3점이면 발문 끝에 [3점]이 찍힌다.
  q.points=2;q.blocks=[];
  const add=(kind,parent,label)=>{const b=block(kind,parent?.id||null,label);q.blocks.push(b);return b;};
  const group=(parent,label,side)=>{const g=add('group',parent,label);g.layout=side?'나란히':'세로';g.boxed=false;return g;};
  add('text',null,'지문');
  // 글 옆 작은 자료: 평가원처럼 첫 지문 문단에 붙은 어울림 그림(오른쪽, 글이 왼쪽·아래로 흐름). 폭은 단의 40%.
  if(struct==='small'){const f=add('figure',null,'자료');f.layout=WRAP;f.size=40;}
  if(struct==='big')add('figure',null,'자료');
  if(struct==='two'||struct==='many'){
    const n=struct==='two'?2:3;
    if(layout==='mix'){const g=group(null,'자료',false);add('figure',g,CAPS[0]);const row=group(g,'자료 묶음',true);for(let i=1;i<n;i++)add('figure',row,CAPS[i]);}
    else{const g=group(null,'자료',layout!=='stack');for(let i=0;i<n;i++)add('figure',g,CAPS[i]);}
  }
  if(struct==='condition'){const g=add('group',null,'');g.boxed=true;add('text',g,'조건');}
  if(struct==='experiment'){
    // 평가원 실험 상자: 제목 없이 〔실험 과정〕·〔실험 결과〕 머리로 나눈다.
    const g=add('group',null,'');g.boxed=true;
    const s=add('steps',g,'실험 과정');s.lines=['(가)','(나)','(다)'].map(label=>({id:crypto.randomUUID(),label,text:''}));
    add('figure',g,'실험 장치');const r=add('table',g,'실험 결과');r.heading=true;r.table=makeTable(3,4);
  }
  if(form==='talk'){const d=add('dialogue',null,'대화');d.lines.forEach(l=>l.label='학생 '+l.label);}
  if(form==='combo')add('bogi',null,'보기');
  if(form==='pair'){q.choiceTable=makeTable(6,3,'선지표');['A','B','C'].forEach((v,c)=>q.choiceTable.cells[0][c].value=v);}
  return q;
}
// 엑셀에서 채울 칸(창 오른쪽 안내). group: 어느 단계와 연결되는지.
export function sheetCells(form,struct){
  const c=[['발문','묻는 문장 ([3점] 자동)','type']];
  const m={small:[['자료','그림·그래프·표 중 하나']],big:[['자료','그림·그래프·표 중 하나']],many:[['자료','(가)·(나)·(다) 칸마다 하나']],two:[['자료 (가)','그림·그래프·표 중 하나'],['자료 (나)','그림·그래프·표 중 하나']],condition:[['상자','조건·설명 한 줄씩, 자료 선택']],experiment:[['실험 과정','(가)(나)(다) 한 줄씩'],['실험 결과','표·그래프·그림 중 하나']],none:[['지문','글']]}[struct]||[];
  c.push(...m.map(r=>[...r,'struct']));
  if(form==='combo')c.push(['보기','ㄱ·ㄴ·ㄷ 진술 한 줄씩','type'],['선지','ㄱㄴ처럼 입력 → ㄱ, ㄴ','type']);
  if(form==='single')c.push(['선지','값 다섯 개','type']);
  if(form==='pair')c.push(['선지 표','A·B·C 열 + 다섯 줄','type']);
  if(form==='talk')c.push(['학생 말','A·B·C 한 줄씩','type'],['선지','AB처럼 입력 → A, B','type']);
  if(form==='essay')c.push(['모범 답안','채점 기준이 되는 답','type']);else c.push(['정답','번호 하나','type']);return c;
}
