// 기출 정답(평가원·학력평가 고3 과학탐구) — 라이브러리·exam 기출 미리보기의 정답 형광펜에 쓴다(화면 표시만, 잘라 넣기·보내기에는 안 들어감).
// 자료: science-answers.json (드라이브 「과학탐구_통합정답_2007-2026.json」을 줄인 것). 파일명 → 문항 순서대로 정답 배열([]=전원 정답, null=없음).
// 「정답 표시」 켜기/끄기는 라이브러리와 exam이 같은 값을 쓴다(localStorage, 기본 켜짐).
const KEY = '5e.answers.show';
let book = null;
export function loadAnswerBook() {
  book ||= fetch(new URL('./science-answers.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return book;
}
export function answersShown() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setAnswersShown(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  for (const w of new Set([window, window.top, ...[...document.querySelectorAll('iframe')].map(f => f.contentWindow)])) {
    try { w?.dispatchEvent(new CustomEvent('5e:answers-shown', { detail: { on } })); } catch { /* 다른 출처 창 */ }
  }
}
export function onAnswersShown(fn) {
  const h = () => fn(answersShown());
  window.addEventListener('5e:answers-shown', h); window.addEventListener('storage', e => { if (e.key === KEY) h(); });
}
// 시험지 파일명(p1_2017_10.pdf)과 문항 번호로 정답 배열. 없으면 null.
export function acceptedAnswers(keys, fileName, number) {
  const n = Number(number), list = keys?.papers?.[String(fileName || '').split('/').pop()];
  return list && Number.isInteger(n) && n > 0 ? list[n - 1] ?? null : null;
}
export const CIRCLED = ['①', '②', '③', '④', '⑤'];
export const ANSWER_COLOR = '#ffd400';
