/* ===== STEPPER =====
 * .gm-step 안의 ▲▼ 버튼을 동작시킨다.
 *
 * 왜 전역인가: 종전엔 그래프 모달의 "좌표 탭"에만 걸려 있어서, 같은 마크업을 다른
 * 화면에 쓰면 버튼이 조용히 죽어 있었다. 컨트롤이 어디에 놓이든 동작해야 재사용된다.
 *
 * 값은 input의 step만큼 올리고 내린 뒤 "input" 이벤트를 흘려보낸다 —
 * 기존 리스너들이 그 이벤트를 듣고 있으므로 배선을 새로 하지 않아도 된다.
 */

function initSteppers(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".gm-step button[data-step]");
    if (!btn) return;
    const box = btn.closest(".gm-step");
    const inp = box && box.querySelector("input");
    if (!inp || inp.disabled) return;
    if (Number(btn.dataset.step) > 0) inp.stepUp(); else inp.stepDown();
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export { initSteppers };
