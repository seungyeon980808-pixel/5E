/* ===== REFERENCE WINDOW (참고 문항 창) =====
 * 기출 문항을 최대 4개까지 별도 브라우저 창에 띄워 두고 보면서 문제를 만든다.
 *
 * 왜 별도 창(window.open)인가:
 *   목적이 "듀얼 모니터에 문제를 띄워 놓기"다. 페이지 안에 떠 있는 패널은 브라우저
 *   창 밖으로 못 나가서 결국 5E와 같은 화면을 나눠 쓰게 된다. 별도 창이라야 다른
 *   모니터로 끌어다 놓을 수 있다.
 *
 * 저장 정책: 창(어떤 문항을 띄웠는지)은 세션 한정 — 새로고침하면 사라진다.
 *   반면 메모는 문항별로 localStorage에 영구 보관한다. 같은 기출을 다음에 다시 열면
 *   적어 둔 메모가 그대로 나온다. 프로젝트 파일에는 넣지 않는다(개인 메모라서).
 *
 * 소속(종속): 항목은 아트보드 페이지(하단 탭) 단위로 묶인다. 탭을 바꾸면 그 페이지에
 *   속한 참고 창 칩만 보인다. 창 자체는 OS 창이라 페이지를 바꿔도 닫지 않는다 —
 *   보던 자료가 탭 전환만으로 사라지면 오히려 방해가 되기 때문.
 *
 * 창을 닫는 두 가지:
 *   × (최소화)  → OS 창만 닫고 칩으로 남긴다. 칩을 누르면 같은 내용으로 다시 열린다.
 *   삭제        → 확인을 거쳐 칩까지 없앤다.
 */

import { showConfirm } from "./ui-dialogs.js?v=1.1.0";
import { makeModalDraggable } from "./modal-drag.js?v=1.1.0";

const IMG_BASE = "assets/exam-library/images/";

/* 문항별 메모는 창이 아니라 "문항"에 딸린다 — 같은 기출을 다음에 다시 열어도 남아야
   하기 때문. 기출 문항은 manifest의 item.id(예: b1_2027_06_01)가 안정적인 열쇠다.
   저장 위치는 localStorage: 프로젝트 파일과 무관한 개인 메모라 저장 형식을 건드리지
   않고, 브라우저에 남아 새로고침·창 닫기를 견딘다. */
const MEMO_KEY = "5e.refmemo";

function loadMemos() {
  try { return JSON.parse(localStorage.getItem(MEMO_KEY)) || {}; } catch { return {}; }
}
function getMemo(itemKey) { return loadMemos()[itemKey] || ""; }
function setMemo(itemKey, text) {
  const all = loadMemos();
  if (text && text.trim()) all[itemKey] = text; else delete all[itemKey];
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(all)); } catch { /* 용량 초과는 무시 */ }
}

let _seq = 0;
const _entries = [];          // { id, pageId, items[], win }
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
  // dragWholeElement: 칩 사이 빈 여백을 잡아도 끌리게 — 14px 손잡이 점만으로는
  // 잡기 힘들다는 피드백 반영.
  makeModalDraggable(_dock, { dragWholeElement: true });
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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* 창의 겉모습은 5E 본 화면과 같아야 한다(사용자 요구). 색·글꼴 토큰을 손으로 베끼면
   본 화면 테마가 바뀔 때마다 어긋나므로, 앱 스타일시트를 그대로 링크해 토큰을
   물려받고 창 전용 레이아웃만 그 뒤에 덧붙인다. about:blank는 opener와 같은 출처라
   상대경로가 5E 기준으로 풀린다(이미지 경로가 이미 그렇게 동작 중). */
function windowMarkup(entry) {
  const g = gridTemplate(entry.items.length);
  const cells = entry.items.map((it) => {
    const key = esc(it.id || it.file);
    const cap = esc(it.title || "");
    return `<figure class="refcell" data-item="${key}">
      <div class="refshot"><img alt="" src="${IMG_BASE}${esc(it.file)}"></div>
      <figcaption class="refcap" title="${cap}">${cap}</figcaption>
      <textarea class="refmemo" data-item="${key}" rows="2"
                placeholder="이 문항 메모 — 문항별로 저장되어 다음에 다시 열어도 남습니다."></textarea>
    </figure>`;
  }).join("");

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>참고 문항 · 5E</title>
<link rel="stylesheet" href="css/style.css?v=1.1.0">
<style>
  /* 앱 스타일시트 뒤에 와서 본문 레이아웃만 덮어쓴다. */
  * { box-sizing: border-box; }
  html, body { height:100%; }
  body { margin:0; display:flex; flex-direction:column; overflow:hidden;
         font-family:"IBM Plex Sans KR",system-ui,sans-serif;
         background:var(--bg-app,#f6f8fa); color:var(--text-primary,#0d1117); }
  .refhead { display:flex; align-items:center; gap:6px; flex:none;
             padding:7px 10px; border-bottom:1px solid var(--c-border,#d0d7de);
             background:var(--bg-panel,#fff); }
  .refhead .title { font-size: 13px; font-weight:600; margin-right:auto;
                    color:var(--text-primary,#0d1117); }
  .refgrid { flex:1; display:grid; gap:8px; padding:8px; min-height:0;
             grid-template-columns:repeat(${g.cols},1fr); grid-template-rows:repeat(${g.rows},1fr); }
  .refcell { margin:0; min-height:0; display:flex; flex-direction:column; gap:5px;
             padding:7px; border:1px solid var(--c-border,#d0d7de); border-radius:8px;
             background:var(--bg-panel,#fff); }
  .refshot { flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
             background:#fff; border-radius:5px; overflow:hidden; }
  .refshot img { max-width:100%; max-height:100%; object-fit:contain; }
  .refcap { flex:none; font-size: 11px; color:var(--text-secondary,#57606a);
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .refmemo { flex:none; width:100%; resize:vertical; font:inherit; font-size: 12.5px;
             padding:5px 7px; border:1px solid var(--c-border,#d0d7de); border-radius:6px;
             background:var(--bg-input,transparent); color:inherit; }
  .refmemo:focus { outline:none; border-color:var(--accent,#0969da); }
  .refmemo.is-saved { border-color:var(--accent,#0969da); }
</style></head><body>
<header class="refhead">
  <span class="title">참고 문항 ${entry.items.length}개</span>
  <button type="button" id="btn-min" class="modal-btn"
          title="창만 닫고 5E의 칩으로 접어 둡니다">× 접기</button>
  <button type="button" id="btn-del" class="modal-btn"
          title="이 참고 창을 완전히 없앱니다">삭제</button>
</header>
<div class="refgrid">${cells}</div>
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

  // 본 화면의 테마·과목 속성을 자식 문서에 복사한다 — 링크한 style.css의 색 토큰이
  // :root의 data-* 로 갈리기 때문. 이게 없으면 스타일시트를 링크해도 색이 안 맞는다.
  const root = document.documentElement;
  for (const a of root.attributes) {
    if (a.name.startsWith("data-")) w.document.documentElement.setAttribute(a.name, a.value);
  }

  // 같은 출처라 자식 문서를 직접 만질 수 있다 — postMessage 배선이 필요 없다.
  w.document.querySelectorAll(".refmemo").forEach((ta) => {
    const key = ta.dataset.item;
    ta.value = getMemo(key);
    ta.addEventListener("input", () => setMemo(key, ta.value));
  });

  w.document.getElementById("btn-min").addEventListener("click", () => {
    w.close();
    renderDock();
  });
  w.document.getElementById("btn-del").addEventListener("click", async () => {
    // 확인 창은 5E 본 창에 띄운다 — 자식 창에 모달 인프라를 복제하지 않기 위해.
    w.blur(); window.focus();
    // 메모는 문항에 딸려 있으므로 창을 지워도 남는다 — 문구를 그에 맞게 고쳤다.
    const ok = await showConfirm("이 참고 창을 삭제할까요? 문항별 메모는 그대로 남습니다.",
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
  const entry = { id: ++_seq, pageId: _getPageId(), items: list, win: null };
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
