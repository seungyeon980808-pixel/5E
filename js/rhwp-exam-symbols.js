// 5E_hwp 특수기호 창 자료(10-21). 첫 줄 16칸·묶음 탭은 최근 3년 기출 1,440문항의 본문 기호 빈도(report-kice-symbols-3y.md) 순서.
// 묶음 안 「|」 뒤쪽은 3년 기출엔 드물거나 없지만 수업 자료용으로 둔 후보(흐리게 보임).
export const SYMBOL_ROW = ['①', '②', '③', '④', '⑤', '㉠', '㉡', '㉢', 'ⓐ', 'ⓑ', 'Ⅰ', 'Ⅱ', 'Ⅲ', '◦', '～', '‘’'];
export const SYMBOL_TABS = {
  '선지·표지': '①②③④⑤|⑥⑦⑧⑨⑩|㉠㉡㉢㉣㉤㉥|㉦㉧㉨|ⓐⓑⓒⓓⓔⓕ|ⓖⓗ|㉮㉯㉰|㉱㉲|ⅠⅡⅢⅣⅤⅥ|ⅦⅧⅨⅩ',
  '문장 부호': '◦～∼‘’′∙․･…⋮※—|“”″·「」『』〈〉',
  '과학·단위': '→⇄|⇌↑↓←|℃°㎛Ω|㎚㎜㎝㎖㎎Åμ‰|＋－＝×≳≤≥%＞|±÷≒≈≠∝',
  '그리스': 'λΔθρεπχδΦβαφωℓ√',
  '도형': '○◯|●◎□■△▲☆★◇◆',
};
// 조각: 시험지에 자주 쓰는 짧은 글. 「위첨자 ＋/－」는 위 첨자 모양까지 넣는다.
export const SYMBOL_CHUNKS = ['(가)', '(나)', '(다)', '(라)', '(마)', '<보기>', '[3점]', '(단, )', '[실험 과정]', '[실험 결과]', '[탐구 과정]', '[가설]', '[결론]', '[자료]', '위첨자 ＋', '위첨자 －'];

// 묶음 문자열을 [{s, rare}] 칸으로. 홀수 번째 조각(| 뒤)이 드문 기호.
export function symbolCells(group) {
  return String(group).split('|').flatMap((part, i) => [...part].map(s => ({ s, rare: i % 2 === 1 })));
}

// 최근 쓴 기호(최대 8개)는 이 브라우저에만 남긴다.
const RECENT_KEY = '5e.hwp.recentSymbols';
export function recentSymbols() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 8) : []; }
  catch { return []; }
}
export function rememberSymbol(s) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([s, ...recentSymbols().filter(x => x !== s)].slice(0, 8))); } catch {}
}
