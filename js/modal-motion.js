/* ===== MODAL MOTION =====
 * 창이 열릴 때의 "어디서 생겼는지"를 알려주는 보조 장치.
 *
 * 기본 동작(css/style.css의 modal-pop)은 창 가운데에서 자란다. 하지만 툴바 버튼처럼
 * 누른 자리가 분명한 경우엔 그 자리에서 자라나야 인과가 읽힌다 — 버튼을 눌렀더니
 * 화면 한복판에 무언가 나타나는 것보다, 누른 곳에서 펼쳐지는 편이 덜 놀랍다.
 *
 * 방법은 transform-origin 하나만 바꾸는 것이다. 애니메이션 자체는 CSS가 그대로 쓰고,
 * 기준점만 버튼 쪽으로 옮긴다.
 */

/** 모달이 trigger 위치에서 자라나도록 기준점을 잡는다.
 *  overlay.hidden = false 로 창을 띄운 "직후"에 부른다 — 그 전에는 크기가 0이라 계산이 안 된다.
 *  trigger가 없거나 화면에 없으면 아무것도 하지 않는다(기본 = 가운데에서 자람). */
function setOpenOrigin(modal, trigger) {
  if (!modal) return;
  if (!trigger || !trigger.getBoundingClientRect) { modal.style.transformOrigin = ""; return; }
  // getBoundingClientRect가 배치를 강제로 끝내므로 이 자리에서 바로 재도 된다.
  // 단, 목록을 비동기로 채우는 창은 "첫" 열람에서만 이 시점의 높이가 최종보다 짧다.
  // 그 경우 기준점이 조금 어긋나지만 방향(버튼 쪽 아래)은 맞고, 260ms짜리 신호라 그걸로 충분하다.
  // requestAnimationFrame으로 미루는 방법은 쓰지 않는다 — 탭이 가려져 있으면 아예 실행되지 않는다.
  const t = trigger.getBoundingClientRect();
  const m = modal.getBoundingClientRect();
  if (!m.width || !m.height) { modal.style.transformOrigin = ""; return; }

  // 버튼 중심을 모달 기준 좌표로 옮긴다. 자르지 않는다 —
  // 확대율이 6%뿐이라 기준점이 멀어도 실제 이동은 그 6%(예: 655px → 약 39px)에 그친다.
  // 잘라 두면 화면 아래쪽 버튼에서 연 창이 엉뚱하게 창 한가운데서 자라난다.
  const ox = t.left + t.width / 2 - m.left;
  const oy = t.top + t.height / 2 - m.top;

  modal.style.transformOrigin = `${ox}px ${oy}px`;
}

export { setOpenOrigin };
