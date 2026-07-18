/* ===== MODAL DRAG =====
 * 모달(그래프 만들기, 함수 입력, 내보내기 …)을 화면 안에서 자유롭게 옮긴다.
 *
 * 왜 transform인가:
 *   .modal은 .modal-overlay의 flex 중앙정렬로 위치가 정해진다(css/style.css).
 *   left/top을 주려면 그 정렬을 깨고 position:absolute로 바꿔야 하는데, 그러면
 *   모달마다 다른 width/max-width 계산이 전부 틀어진다. 중앙정렬은 그대로 두고
 *   translate만 누적하면 CSS 구조를 하나도 건드리지 않고 이동이 된다.
 *
 * 핸들을 따로 두는 이유:
 *   그래프 모달은 본문에서 점을 끌어 옮기는 자체 드래그가 있다. "헤더 아무 데나
 *   잡으면 이동"으로 만들면 그 조작과 싸운다. 좌상단 전용 손잡이만 드래그를 받는다.
 */

const HANDLE_CLASS = "modal-drag-handle";
const _offsets = new WeakMap(); // modalEl → { x, y }

function _apply(modal, off) {
  modal.style.transform = off.x || off.y ? `translate(${off.x}px, ${off.y}px)` : "";
}

/** 모달이 화면 밖으로 완전히 빠져나가지 않게 이동량을 제한한다.
 *  최소 이만큼은 화면 안에 남겨 둬서 다시 잡을 수 있게 한다. */
function _clamp(modal, x, y) {
  const KEEP = 60;
  const r = modal.getBoundingClientRect();
  const cur = _offsets.get(modal) || { x: 0, y: 0 };
  // 현재 transform을 걷어낸 '원래 위치' 기준으로 한계를 계산한다.
  const baseLeft = r.left - cur.x, baseTop = r.top - cur.y;
  const minX = -(baseLeft + r.width - KEEP);
  const maxX = window.innerWidth - baseLeft - KEEP;
  const minY = -baseTop;                                   // 제목이 화면 위로 넘어가지 않게
  const maxY = window.innerHeight - baseTop - KEEP;
  return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
}

/** 모달 하나에 좌상단 드래그 손잡이를 붙인다. 이미 붙어 있으면 아무것도 하지 않는다. */
function makeModalDraggable(modal) {
  if (!modal || modal.querySelector(`:scope > .${HANDLE_CLASS}`)) return;

  const handle = document.createElement("div");
  handle.className = HANDLE_CLASS;
  handle.title = "끌어서 창 위치 옮기기 (두 번 누르면 가운데로)";
  handle.setAttribute("aria-label", "창 이동 손잡이");
  modal.prepend(handle);

  let start = null;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();   // 텍스트 선택 방지
    e.stopPropagation();  // 배경 클릭=닫기, 모달 여백 클릭=선택해제와 충돌하지 않게
    const cur = _offsets.get(modal) || { x: 0, y: 0 };
    start = { mx: e.clientX, my: e.clientY, ox: cur.x, oy: cur.y };
    handle.classList.add("is-dragging");
  });

  // move/up은 window에서 받는다 — 빠르게 끌어 커서가 손잡이를 벗어나도 계속 따라오게.
  window.addEventListener("mousemove", (e) => {
    if (!start) return;
    const off = _clamp(modal, start.ox + (e.clientX - start.mx), start.oy + (e.clientY - start.my));
    _offsets.set(modal, off);
    _apply(modal, off);
  });

  window.addEventListener("mouseup", () => {
    if (!start) return;
    start = null;
    handle.classList.remove("is-dragging");
  });

  // 창을 어디 뒀는지 잃어버렸을 때의 탈출구.
  handle.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    _offsets.set(modal, { x: 0, y: 0 });
    _apply(modal, { x: 0, y: 0 });
  });
}

/** 지금 문서에 있는 모달 전부에 손잡이를 달고, 이후 새로 생기는 모달도 자동으로 처리한다.
 *  각 모달이 자기 파일에서 따로 호출하지 않아도 되게(빠뜨리면 그 창만 조용히 못 움직인다). */
function initModalDrag(root = document.body) {
  const scan = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches?.(".modal-overlay")) {
      node.querySelectorAll(":scope > .modal").forEach(makeModalDraggable);
    }
    node.querySelectorAll?.(".modal-overlay > .modal").forEach(makeModalDraggable);
  };
  scan(root);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach(scan));
  }).observe(root, { childList: true, subtree: true });
}

export { initModalDrag, makeModalDraggable };
