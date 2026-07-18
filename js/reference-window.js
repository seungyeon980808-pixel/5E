/* ===== REFERENCE WINDOW (참고 문항 창) =====
 * 기출 문항을 최대 4개까지 별도 브라우저 창에 띄워 두고 보면서 문제를 만든다.
 *
 * 왜 별도 창(window.open)인가:
 *   목적이 "듀얼 모니터에 문제를 띄워 놓기"다. 페이지 안에 떠 있는 패널은 브라우저
 *   창 밖으로 못 나가서 결국 5E와 같은 화면을 나눠 쓰게 된다. 별도 창이라야 다른
 *   모니터로 끌어다 놓을 수 있다.
 *
 * 저장 정책: 세션 한정. 프로젝트 파일에 남기지 않는다(작업 중 참고용이라는 성격).
 *   새로고침하면 사라진다.
 *
 * 소속(종속): 항목은 아트보드 페이지(하단 탭) 단위로 묶인다. 탭을 바꾸면 그 페이지에
 *   속한 참고 창 칩만 보인다. 창 자체는 OS 창이라 페이지를 바꿔도 닫지 않는다 —
 *   보던 자료가 탭 전환만으로 사라지면 오히려 방해가 되기 때문.
 *
 * 창을 닫는 두 가지:
 *   × (최소화)  → OS 창만 닫고 칩으로 남긴다. 칩을 누르면 같은 내용으로 다시 열린다.
 *   삭제        → 확인을 거쳐 칩까지 없앤다.
 */

import { showConfirm } from "./ui-dialogs.js?v=1.0.2";
import { makeModalDraggable } from "./modal-drag.js?v=1.0.2";

const IMG_BASE = "assets/exam-library/images/";

let _seq = 0;
const _entries = [];          // { id, pageId, items[], memo, win }
let _dock = null;             // 최소화된 참고 창 칩이 쌓이는 막대
let _getPageId = () => "";    // main이 주입 — 현재 아트보드 페이지 id

/* ---------- 최소화 칩 막대 ---------- */
function ensureDock() {
  if (_dock) return _dock;
  _dock = document.createElement("div");
  _dock.className = "refwin-dock";
  _dock.hidden = true;
  document.body.appendChild(_dock);
  // 모달과 같은 손잡이·같은 조작(끌어서 이동, 두 번 눌러 제자리)을 그대로 쓴다.
  // 우하단 고정 위치가 다른 UI를 가릴 수 있어 사용자가 치울 수 있어야 한다.
  makeModalDraggable(_dock);
  return _dock;
}

function renderDock() {
  const dock = ensureDock();
  const page = _getPageId();
  // 이 페이지에 속하면서 창이 닫혀 있는(=최소화된) 것만 칩으로 보인다.
  const mine = _entries.filter((e) => e.pageId === page && (!e.win || e.win.closed));
  // 손잡이는 replaceChildren에 쓸려나가지 않게 보존한다.
  const handle = dock.querySelector(":scope > .modal-drag-handle");
  dock.replaceChildren();
  if (handle) dock.appendChild(handle);
  mine.forEach((entry) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "refwin-chip";
    chip.title = "참고 창 다시 열기";
    chip.textContent = `참고 ${entry.items.length}문항`;
    chip.addEventListener("click", () => openWindow(entry));
    dock.appendChild(chip);
  });
  dock.hidden = mine.length === 0;
}

/* ---------- 창 내용 ---------- */
// 문항 수에 따라 배열을 자동으로 정한다: 1=한 칸, 2=좌우, 3~4=2×2.
function gridTemplate(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  return { cols: 2, rows: 2 };
}

function windowMarkup(entry) {
  const g = gridTemplate(entry.items.length);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>참고 문항 · 5E</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; height:100vh; display:flex; flex-direction:column;
         font-family:"IBM Plex Sans KR",system-ui,sans-serif; background:#f6f8fa; color:#0d1117; }
  @media (prefers-color-scheme: dark) { body { background:#0d1117; color:#e6edf3; } }
  header { display:flex; align-items:center; gap:8px; padding:6px 10px;
           border-bottom:1px solid #d0d7de; flex:none; }
  header .title { font-size:13px; font-weight:600; margin-right:auto; }
  header button { font:inherit; font-size:12px; padding:4px 10px; cursor:pointer;
                  border:1px solid #d0d7de; border-radius:6px; background:transparent; color:inherit; }
  header button:hover { background:#0969da; border-color:#0969da; color:#fff; }
  header button.danger:hover { background:#cf222e; border-color:#cf222e; }
  .grid { flex:1; display:grid; gap:6px; padding:6px; min-height:0;
          grid-template-columns:repeat(${g.cols},1fr); grid-template-rows:repeat(${g.rows},1fr); }
  .cell { border:1px solid #d0d7de; border-radius:6px; background:#fff; overflow:hidden;
          display:flex; align-items:center; justify-content:center; }
  .cell img { max-width:100%; max-height:100%; object-fit:contain; }
  .memo { flex:none; border-top:1px solid #d0d7de; padding:6px; }
  .memo textarea { width:100%; height:84px; resize:vertical; font:inherit; font-size:13px;
                   padding:6px 8px; border:1px solid #d0d7de; border-radius:6px;
                   background:transparent; color:inherit; }
</style></head><body>
<header>
  <span class="title">참고 문항 ${entry.items.length}개</span>
  <button type="button" id="btn-min" title="창만 닫고 5E의 칩으로 접어 둡니다">× 접기</button>
  <button type="button" id="btn-del" class="danger" title="이 참고 창을 완전히 없앱니다">삭제</button>
</header>
<div class="grid">
  ${entry.items.map((it) => `<div class="cell"><img alt="" src="${IMG_BASE}${it.file}"></div>`).join("")}
</div>
<div class="memo">
  <textarea id="memo" placeholder="문항 제작 메모 — 이 창에만 남고 저장 파일에는 들어가지 않습니다."></textarea>
</div>
</body></html>`;
}

/* ---------- 창 열기 ---------- */
function openWindow(entry) {
  // 이미 열려 있으면 새로 만들지 말고 앞으로 가져온다.
  if (entry.win && !entry.win.closed) { entry.win.focus(); return entry.win; }

  const w = window.open("", `5e-ref-${entry.id}`, "width=760,height=680,menubar=no,toolbar=no");
  if (!w) {
    // 팝업 차단. 항목은 그대로 두고 칩으로 남긴다 — 칩 클릭은 확실한 사용자 조작이라
    // 그때는 대개 열린다. 여기서 항목을 버리면 창도 칩도 없이 조용히 사라진다.
    renderDock();
    alert("브라우저가 팝업을 막았습니다.\n주소창의 팝업 차단 아이콘에서 이 사이트를 허용한 뒤,\n"
        + "화면 오른쪽 아래의 '참고' 칩을 눌러 다시 열어 주세요.");
    return null;
  }
  entry.win = w;
  w.document.open();
  w.document.write(windowMarkup(entry));
  w.document.close();

  // 같은 출처라 자식 문서를 직접 만질 수 있다 — postMessage 배선이 필요 없다.
  const memo = w.document.getElementById("memo");
  memo.value = entry.memo || "";
  memo.addEventListener("input", () => { entry.memo = memo.value; });

  w.document.getElementById("btn-min").addEventListener("click", () => {
    entry.memo = memo.value;
    w.close();
    renderDock();
  });
  w.document.getElementById("btn-del").addEventListener("click", async () => {
    // 확인 창은 5E 본 창에 띄운다 — 자식 창에 모달 인프라를 복제하지 않기 위해.
    w.blur(); window.focus();
    const ok = await showConfirm("이 참고 창을 삭제할까요? 메모도 함께 사라집니다.",
      { title: "참고 창 삭제", okText: "삭제", cancelText: "취소" });
    if (!ok) { w.focus(); return; }
    removeEntry(entry);
  });

  // 사용자가 OS 창 버튼으로 닫아도 칩으로 남아야 한다.
  const poll = setInterval(() => {
    if (w.closed) { clearInterval(poll); renderDock(); }
  }, 600);

  renderDock();
  return w;
}

function removeEntry(entry) {
  const i = _entries.indexOf(entry);
  if (i >= 0) _entries.splice(i, 1);
  if (entry.win && !entry.win.closed) entry.win.close();
  renderDock();
}

/* ---------- 공개 API ---------- */
/** 선택한 문항들로 참고 창을 새로 띄운다. items = [{ id, file, title }] (최대 4개) */
function openReferenceWindow(items) {
  const list = (items || []).slice(0, 4);
  if (!list.length) return null;
  const entry = { id: ++_seq, pageId: _getPageId(), items: list, memo: "", win: null };
  _entries.push(entry);
  return openWindow(entry);
}

/** main에서 현재 페이지 id를 읽는 방법과, 페이지가 바뀔 때 칩을 다시 그릴 훅을 연결한다. */
function initReferenceWindows(state) {
  _getPageId = () => (state.get().activePageId || "");
  state.subscribe(renderDock);
  ensureDock();
  renderDock();
}

export { initReferenceWindows, openReferenceWindow };
