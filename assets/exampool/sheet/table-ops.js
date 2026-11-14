// 11-14 결정(시안 review-1114d 35번 A·A·A): 표 구조 바꾸기 — 조판 미리보기의 한글 단축키(M 합치기·S 나누기·줄/칸 넣기·지우기)와
// 문항 카드 표 칸 편집이 같이 쓴다. 표 데이터(rows·cols·cells·merges·headerRows)만 바꾸고 조판은 그 결과로 다시 그린다.
const blank=()=>({value:''});
const norm=([a,b,c,d])=>[Math.min(a,c),Math.min(b,d),Math.max(a,c),Math.max(b,d)];
// 합칠 범위가 다른 합친 칸을 반쯤 걸치면 그 칸까지 넓힌다(한글처럼).
function grow(t,[r1,c1,r2,c2]){for(let again=true;again;){again=false;for(const m of t.merges){const mr2=m.r+m.rs-1,mc2=m.c+m.cs-1;if(m.r<=r2&&mr2>=r1&&m.c<=c2&&mc2>=c1){const n=[Math.min(r1,m.r),Math.min(c1,m.c),Math.max(r2,mr2),Math.max(c2,mc2)];if(n.join()!==[r1,c1,r2,c2].join()){[r1,c1,r2,c2]=n;again=true;}}}}return [r1,c1,r2,c2];}
export function mergeRange(t,range){let [r1,c1,r2,c2]=grow(t,norm(range));if(r1===r2&&c1===c2)throw Error('합칠 칸을 둘 이상 고르세요(F5 뒤 화살표로 넓히기).');
  // 한글처럼 칸 글을 첫 칸으로 모은다(줄을 바꿔 이어 붙임).
  const texts=[];for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){const v=String(t.cells[r][c].value??'').trim();if(v)texts.push(v);if(r!==r1||c!==c1)t.cells[r][c]=blank();}
  t.cells[r1][c1]={...t.cells[r1][c1],value:texts.join('\n')};
  t.merges=t.merges.filter(m=>!(m.r>=r1&&m.r<=r2&&m.c>=c1&&m.c<=c2));t.merges.push({r:r1,c:c1,rs:r2-r1+1,cs:c2-c1+1});}
export function splitAt(t,r,c){const m=t.merges.find(m=>r>=m.r&&r<m.r+m.rs&&c>=m.c&&c<m.c+m.cs);if(!m)throw Error('합친 칸 안에서 S를 누르면 나눕니다.');t.merges=t.merges.filter(x=>x!==m);}
export function insertRow(t,at){if(t.rows>=30)throw Error('표는 30줄까지입니다.');t.cells.splice(at,0,Array.from({length:t.cols},blank));t.rows++;if(Array.isArray(t.minRowPx))t.minRowPx.splice(at,0,null);
  t.merges=t.merges.map(m=>m.r>=at?{...m,r:m.r+1}:m.r+m.rs>at?{...m,rs:m.rs+1}:m);if(at<t.headerRows)t.headerRows++;}
export function insertCol(t,at){if(t.cols>=12)throw Error('표는 12칸까지입니다.');t.cells.forEach(row=>row.splice(at,0,blank()));t.cols++;
  t.merges=t.merges.map(m=>m.c>=at?{...m,c:m.c+1}:m.c+m.cs>at?{...m,cs:m.cs+1}:m);}
export function deleteRow(t,at){if(t.rows<=1)throw Error('줄이 하나뿐입니다.');t.cells.splice(at,1);t.rows--;if(Array.isArray(t.minRowPx))t.minRowPx.splice(at,1);
  t.merges=t.merges.flatMap(m=>at<m.r?[{...m,r:m.r-1}]:at<m.r+m.rs?(m.rs>1?[{...m,rs:m.rs-1}]:[]):[m]).filter(m=>m.rs*m.cs>1);t.headerRows=Math.min(t.headerRows,t.rows);}
export function deleteCol(t,at){if(t.cols<=1)throw Error('칸이 하나뿐입니다.');t.cells.forEach(row=>row.splice(at,1));t.cols--;
  t.merges=t.merges.flatMap(m=>at<m.c?[{...m,c:m.c-1}]:at<m.c+m.cs?(m.cs>1?[{...m,cs:m.cs-1}]:[]):[m]).filter(m=>m.rs*m.cs>1);}
// 미리보기 명령 이름 → 표 바꾸기. range=[r1,c1,r2,c2](고른 칸, 없으면 커서 칸).
export const TABLE_EDIT_COMMANDS=new Set(['table:cell-merge','table:cell-split','table:insert-row-above','table:insert-row-below','table:insert-col-left','table:insert-col-right','table:delete-row','table:delete-col']);
export function applyTableCommand(t,id,range){const [r1,c1,r2,c2]=norm(range);
  switch(id){
    case 'table:cell-merge':mergeRange(t,[r1,c1,r2,c2]);return '칸을 합쳤습니다';
    case 'table:cell-split':splitAt(t,r1,c1);return '칸을 나눴습니다';
    case 'table:insert-row-above':insertRow(t,r1);return '위에 줄을 넣었습니다';
    case 'table:insert-row-below':insertRow(t,r2+1);return '아래에 줄을 넣었습니다';
    case 'table:insert-col-left':insertCol(t,c1);return '왼쪽에 칸을 넣었습니다';
    case 'table:insert-col-right':insertCol(t,c2+1);return '오른쪽에 칸을 넣었습니다';
    case 'table:delete-row':for(let r=r2;r>=r1;r--)deleteRow(t,r);return '줄을 지웠습니다';
    case 'table:delete-col':for(let c=c2;c>=c1;c--)deleteCol(t,c);return '칸을 지웠습니다';
  }
  throw Error('지원하지 않는 표 명령입니다.');}
