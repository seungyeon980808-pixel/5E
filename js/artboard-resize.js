/* ===== ARTBOARD RESIZE — 캔버스에서 모서리를 잡고 아트보드 크기를 드래그로 조절 =====
 *
 * 왜 독립 모듈인가: 객체 선택 리사이즈(transform.js)의 핸들 기계는 selectedIds·그룹·
 * 스냅과 깊게 얽혀 있어 거기 끼워넣으면 회귀 위험이 크다. 아트보드 리사이즈는 그와
 * 완전히 분리해, 자기만의 핸들 요소 + 문서 레벨 드래그로 처리한다.
 *
 * 동작:
 *   1) 인스펙터 아트보드 섹션의 "드래그로 조절" 버튼이 state.artboardResizeMode 를 토글.
 *   2) 켜지면 scene.js가 아트보드 우하단 모서리(w/2, h/2)에 파란 사각 핸들을 그린다
 *      (data-artboard-handle). 아트보드는 원점 중앙이라 이 한 점만으로 w,h가 정해진다.
 *   3) 그 핸들에서 mousedown → 문서 레벨 pointermove/up 으로 드래그. 이동 중 world 좌표의
 *      2배(중앙 대칭)를 새 w/h로 삼아 실시간 반영.
 *
 * 렌더가 드래그 도중 여러 번 다시 그려 핸들 DOM이 교체돼도, 이동 로직은 핸들 요소에
 * 의존하지 않고 문서 리스너로만 도므로 끊기지 않는다.
 *
 * undo: 아트보드 크기는 기존 숫자 입력 경로(section-artboard.js)도 undo 대상이 아니다
 * (undo 엔진은 objects[]만 스냅샷한다). 여기서 objects 스냅샷을 남기면 Ctrl+Z가 아트보드가
 * 아니라 객체를 되돌려 오히려 혼란스럽다. 그래서 일관되게 undo에 넣지 않는다.
 */

import { screenToWorld } from "./viewport.js?v=1.2.0";

const AB_MIN = 10, AB_MAX = 200;   // section-artboard.js와 같은 한계
const clamp = (v) => Math.max(AB_MIN, Math.min(AB_MAX, Math.round(v)));

export function initArtboardResize(svg, state) {
  let dragging = false;

  function onMove(e) {
    if (!dragging) return;
    const vb = state.get().viewBox;
    const p = screenToWorld(svg, vb, e.clientX, e.clientY);
    // 우하단 모서리 = (w/2, h/2). 절댓값의 2배가 크기. (원점 중앙 유지)
    const w = clamp(Math.abs(p.x) * 2);
    const h = clamp(Math.abs(p.y) * 2);
    state.update((s) => { s.artboard = { w, h }; });
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  }

  // 핸들에서 시작하는 mousedown만 가로챈다(위임). 다른 캔버스 조작은 건드리지 않는다.
  svg.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (!t || !t.dataset || t.dataset.artboardHandle === undefined) return;
    e.preventDefault();
    e.stopPropagation();   // tools/transform의 캔버스 핸들러로 내려가지 않게
    dragging = true;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }, true);   // capture 단계 — 다른 리스너보다 먼저 잡는다
}
