// 시트·엑셀의 선지·보기 칸에는 ①·ㄱ. 같은 번호를 적지 않는다(한글 조판이 붙인다). 예전 파일의 번호는 읽을 때 뗀다.
export const stripChoiceLabel=v=>String(v).replace(/^[①②③④⑤]\s*/,'');
export const stripBogiLabel=v=>String(v).replace(/^[ㄱ-ㅎ][.．)]\s*/,'');
const JAMO='ㄱㄴㄷㄹㅁㅂㅅ',STUDENTS='ABCDE';
// 합답형 'ㄱㄴ'·'ㄴ ㄱ'·'ㄱ,ㄴ' → 'ㄱ, ㄴ', 대화형 'AB' → 'A, B'. 기호만 있는 칸만 바꾸고 순서는 ㄱ·ㄴ·ㄷ(A·B·C) 순서로 맞춘다.
export function comboParts(v){
  const chars=[...String(v).replace(/[\s,·]/g,'')];if(!chars.length||new Set(chars).size!==chars.length)return null;
  const set=[JAMO,STUDENTS].find(set=>chars.every(c=>set.includes(c)));
  return set?{set,index:chars.map(c=>set.indexOf(c)).sort((a,b)=>a-b)}:null;
}
export function normalizeCombo(v){const p=comboParts(v);return p?p.index.map(i=>p.set[i]).join(', '):String(v);}
// 기호 조합 다섯 개는 관례 순서(하나 → 둘 → 셋, 같은 개수면 ㄱ·ㄴ·ㄷ 순서)로 놓는다. 정답은 선지를 따라간다.
const compare=(a,b)=>{if(a.length!==b.length)return a.length-b.length;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
export function orderCombos(choices,answer){
  const keys=choices.map(c=>comboParts(c.text)?.index);
  if(keys.some(k=>!k))return {choices,answer};
  const order=choices.map((_,i)=>i).sort((i,j)=>compare(keys[i],keys[j])||i-j);
  return {choices:order.map(i=>choices[i]),answer:answer===null||answer===undefined?answer:order.indexOf(answer)};
}
