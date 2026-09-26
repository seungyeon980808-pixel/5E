/**
 * touch-drag.js — 캔버스 터치 → 마우스 이벤트 브리지 (모바일 대략 사용 지원)
 *
 * 배경: 도형 생성(tools.js)·선택/이동(transform.js)·자(ruler.js)·팬(viewport.js)은
 * 전부 mousedown + window mousemove/mouseup "마우스 이벤트"로 구현돼 있다. 터치
 * 기기에서 브라우저는 "탭"에만 마우스 이벤트를 합성하고, 드래그는 스크롤/팬으로
 * 소비해 버린다. 그래서 버튼(탭)은 되지만 캔버스에서 그리기·이동이 전혀 안 된다.
 *
 * 이 모듈은 기존 핸들러를 하나도 고치지 않고, #canvas 위의 한 손가락 터치를 같은
 * 좌표의 합성 마우스 이벤트로 바꿔 흘려보낸다. CSS의 `touch-action:none`(#canvas)과
 * 짝을 이뤄, 손가락 드래그가 마우스 드래그와 완전히 동일한 코드 경로를 탄다.
 *
 * 범위는 의도적으로 "대략적 모바일 사용": 한 손가락만 처리(핀치줌·두손가락팬 없음).
 * touchstart에서 preventDefault()를 부르면 브라우저가 뒤늦게 쏘는 합성 마우스
 * 이벤트가 억제돼 핸들러가 두 번 실행되지 않는다. 손 떼는 순간 이동이 거의 없으면
 * (탭) #canvas에 click도 쏴서 노드 배치(node-placement)·자 클릭까지 동작하게 한다.
 */
(function initTouchDrag() {
  const canvas = document.getElementById("canvas");
  if (!canvas || !("ontouchstart" in window)) return; // 터치 없는 기기는 그대로 마우스 경로

  const TAP_SLOP = 6; // px: 이보다 덜 움직이면 탭으로 간주해 click까지 발생
  let dragging = false;
  let startX = 0, startY = 0;

  // --- 네이티브 포인터 간섭 차단 (이동 버그의 핵심) ---------------------------
  // 터치는 touchstart 대상에 "암묵적 포인터 캡처"를 건다. 그런데 오브젝트를 누르면
  // 선택→재렌더(scene.replaceChildren)로 그 노드가 DOM에서 교체·제거되고, 캡처된
  // 노드가 사라지면 브라우저가 pointercancel을 발생시킨다. transform.js의
  // pointercancel 핸들러가 이걸 받아 이동 제스처를 리셋해 버려서, 빈 곳 터치(생성)는
  // 되는데 오브젝트 터치(이동)만 죽었다. 캡처를 즉시 풀어 취소 자체를 예방한다.
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const el = e.target;
    if (el && el.releasePointerCapture && el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  });
  // 그래도 새어나온 터치发 pointercancel은 앱(window 리스너)에 닿기 전에 막는다.
  // capture 단계에서 잡아 stopImmediatePropagation → transform.js 리셋 방지.
  window.addEventListener("pointercancel", (e) => {
    if (dragging && e.pointerType === "touch") e.stopImmediatePropagation();
  }, true);

  function relay(type, clientX, clientY, target) {
    const ev = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX: clientX,
      clientY: clientY,
      detail: 1,
    });
    (target || document).dispatchEvent(ev);
  }

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;      // 한 손가락만
    const t = e.touches[0];
    e.preventDefault();                       // 스크롤 + 브라우저 합성 마우스 억제
    dragging = true;
    startX = t.clientX;
    startY = t.clientY;
    // e.target(손가락 아래 요소)에 mousedown을 쏴야 핸들·마퀴 등 target 기반 판정이 맞는다
    relay("mousedown", t.clientX, t.clientY, e.target);
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (!dragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    relay("mousemove", t.clientX, t.clientY, document);
  }, { passive: false });

  function end(e) {
    if (!dragging) return;
    dragging = false;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    const cx = t ? t.clientX : startX;
    const cy = t ? t.clientY : startY;
    relay("mouseup", cx, cy, document);
    // 거의 안 움직인 터치는 "클릭"이기도 하다 → 위임 바인딩된 click 핸들러
    // (노드 배치·자)까지 살리기 위해 #canvas에 click을 쏜다.
    if (Math.hypot(cx - startX, cy - startY) < TAP_SLOP) {
      relay("click", cx, cy, canvas);
    }
  }
  window.addEventListener("touchend", end, { passive: false });
  window.addEventListener("touchcancel", end, { passive: false });
})();
