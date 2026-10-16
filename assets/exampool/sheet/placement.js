// 배치 값: 좌표 대신 순서·묶음·폭 비율·크기·간격·정렬로 조판을 기록한다.
// 끌어서 바꿔도 엑셀에는 "60%", "2mm" 같은 눈금 값만 남아 여러 문항의 모양이 일정하다.
// 값이 없으면(undefined) 예전처럼 자동 배치한다. 저장된 문항의 모양은 바뀌지 않는다.
export const SIZE_STEP=5,SIZE_MIN=10,SIZE_MAX=100;     // 단 폭 대비 %
export const GAP_STEP=.5,GAP_MAX=20;                   // mm
export const RATIO_MAX=12;                             // 가로 묶음 안 폭 비율(정수)
export const ALIGNS=['왼쪽','가운데','오른쪽'];
export const CHOICE_LAYOUTS=['한 줄','3+2','세로'];      // 비우면 자동
export const PX_PER_MM=96/25.4;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const num=v=>{if(typeof v==='number')return v;const m=String(v).trim().match(/^(-?\d+(?:\.\d+)?)\s*(%|mm)?$/);return m?Number(m[1]):NaN;};

export function snapSize(v){const n=num(v);if(!Number.isFinite(n))throw Error('크기는 단 폭 대비 %로 입력하세요. 예: 60%');return clamp(Math.round(n/SIZE_STEP)*SIZE_STEP,SIZE_MIN,SIZE_MAX);}
export function snapGap(v){const n=num(v);if(!Number.isFinite(n))throw Error('간격은 mm로 입력하세요. 예: 2mm');return clamp(Math.round(n/GAP_STEP)*GAP_STEP,0,GAP_MAX);}
export function snapRatio(v){const n=num(v);if(!Number.isFinite(n))throw Error('폭 비율은 1~12 사이 정수로 입력하세요.');return clamp(Math.round(n),1,RATIO_MAX);}

// 엑셀 칸에 보이는 글. 빈칸은 자동이다.
export const formatSize=v=>v===undefined?'':`${v}%`;
export const formatGap=v=>v===undefined?'':`${v}mm`;
export const formatRatio=v=>v===undefined?'':String(v);

// 엑셀·구성 시트에서 읽은 글을 값으로 바꾼다. 빈칸은 undefined(자동).
export function parseSize(v){return String(v??'').trim()===''?undefined:snapSize(v);}
export function parseGap(v){return String(v??'').trim()===''?undefined:snapGap(v);}
export function parseRatio(v){return String(v??'').trim()===''?undefined:snapRatio(v);}
export function parseAlign(v){const s=String(v??'').trim();if(!s)return undefined;if(!ALIGNS.includes(s))throw Error('정렬은 왼쪽·가운데·오른쪽 중에서 고르세요.');return s;}
export function parseChoiceLayout(v){const s=String(v??'').trim().replace(/\s+/g,' ');if(!s||s==='자동')return undefined;const k={'한 줄 5개':'한 줄','한줄':'한 줄','3 + 2':'3+2','세로 5줄':'세로'}[s]||s;if(!CHOICE_LAYOUTS.includes(k))throw Error('선지 배열은 한 줄·3+2·세로 중에서 고르세요.');return k;}

// 저장 형식 검사: 값이 있으면 눈금 위에 있어야 한다.
export function validPlacement(b){
  if(b.size!==undefined&&!(Number.isInteger(b.size)&&b.size%SIZE_STEP===0&&b.size>=SIZE_MIN&&b.size<=SIZE_MAX))return false;
  if(b.gap!==undefined&&!(Number.isFinite(b.gap)&&Math.round(b.gap/GAP_STEP)*GAP_STEP===b.gap&&b.gap>=0&&b.gap<=GAP_MAX))return false;
  if(b.ratio!==undefined&&!(Number.isInteger(b.ratio)&&b.ratio>=1&&b.ratio<=RATIO_MAX))return false;
  if(b.align!==undefined&&!ALIGNS.includes(b.align))return false;
  return true;
}
export const validChoiceLayout=v=>v===undefined||CHOICE_LAYOUTS.includes(v);

// 가로 묶음 안 자식들의 폭(px). 비율이 없으면 1로 본다.
export function splitWidths(children,width){
  const ratios=children.map(c=>c.ratio||1),total=ratios.reduce((a,b)=>a+b,0);
  return ratios.map(r=>width*r/total);
}
// 그림·표가 차지할 폭(px). size가 없으면 주어진 폭을 그대로 쓴다.
export const sizedWidth=(b,width)=>b.size===undefined?width:width*b.size/100;
export const gapPx=b=>b.gap===undefined?0:b.gap*PX_PER_MM;

// 선지 배열 → 열 수. undefined면 호출한 쪽의 자동 계산을 쓴다.
export function choiceColumns(layout,count=5){
  if(layout==='한 줄')return count;
  if(layout==='3+2')return Math.min(3,count);
  if(layout==='세로')return 1;
  return undefined;
}
