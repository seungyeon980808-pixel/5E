// 성취기준 자료(standards.json, 약 280KB)는 출제 칸 안 세 곳(app·카드·보관함)이 함께 쓴다.
// 한 번만 받아 읽고 같은 결과를 나눠 쓴다 — 전에는 세 곳이 따로 받아 열 때마다 3번 내려받았다. 읽기 전용으로만 쓸 것.
let pending = null;
export function loadStandards() {
  if (!pending) pending = fetch(new URL('../standards.json', import.meta.url)).then(response => {
    if (!response.ok) throw new Error('성취기준 자료를 받지 못했습니다.');
    return response.json();
  });
  return pending;
}
