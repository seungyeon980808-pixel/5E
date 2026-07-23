/* ===== BATCH EXPORT (페이지 일괄 내보내기 — 폴더 연결 + 페이지 선택) =====
 *
 * "전체 페이지" 버튼이 바로 파일을 쏟아내던 동작을 중간 단계로 바꾼다.
 * 이 모달이 하는 일은 셋뿐이다:
 *
 *   1. 저장 폴더 — File System Access API(showDirectoryPicker)로 한 번 연결하면
 *      핸들을 IndexedDB에 넣어 다음 세션에도 기억한다. 브라우저가 이 API를
 *      지원하지 않으면(Firefox/Safari) 폴더 줄을 감추고 기존 개별 다운로드로
 *      떨어진다 — 기능이 사라지지는 않는다.
 *   2. 페이지 선택 — 탭에 열려 있는 페이지를 체크박스로 고른다.
 *   3. 파일 이름 — 페이지 이름을 사용자가 지정했으면 그 이름 그대로 파일명이
 *      된다. 기본 이름("페이지 3")인 것만 <파일이름>_p3 형태로 떨어진다.
 *
 * 실제 래스터화는 기존 경로(svg-export.js의 rasterizeExportCanvas)를 그대로
 * 쓴다. 페이지별로 그 페이지의 4필드를 담은 스냅샷 상태를 만들어 넘긴다.
 */

import { rasterizeExportCanvas } from "./svg-export.js?v=1.2.0";
import { commitActivePage } from "./pages.js?v=1.2.0";
import { showAlert } from "./ui-dialogs.js?v=1.2.0";
import { idbAvailable, idbGet, idbSet } from "./idb-store.js?v=1.2.0";

const DIR_KEY = "export-dir-handle";
const FS_SUPPORTED = typeof window !== "undefined" && !!window.showDirectoryPicker;

/* ----- 저장 폴더 핸들: 세션 캐시 + IndexedDB 영속 ----- */
let dirHandle = null;

async function loadSavedDir() {
  if (dirHandle || !FS_SUPPORTED || !idbAvailable()) return dirHandle;
  try {
    const h = await idbGet(DIR_KEY);
    // 저장된 핸들은 권한이 만료돼 있을 수 있다. 여기서는 조회만 하고(사용자 제스처가
    // 없으므로 요청은 안 한다) 실제 요청은 내보내기 직전에 한다.
    if (h && typeof h.queryPermission === "function") dirHandle = h;
  } catch (_) { /* 저장된 핸들이 깨졌으면 없는 것으로 본다 */ }
  return dirHandle;
}

async function ensureDirPermission(handle) {
  if (!handle || typeof handle.queryPermission !== "function") return false;
  try {
    if (await handle.queryPermission({ mode: "readwrite" }) === "granted") return true;
    return await handle.requestPermission({ mode: "readwrite" }) === "granted";
  } catch (_) {
    return false;
  }
}

async function pickDir() {
  try {
    const h = await window.showDirectoryPicker({ id: "5e-export", mode: "readwrite" });
    if (!h) return null;
    dirHandle = h;
    if (idbAvailable()) { try { await idbSet(DIR_KEY, h); } catch (_) {} }
    return h;
  } catch (_) {
    return null; // 취소 또는 미지원
  }
}

/* ----- 파일 이름 결정 -----
 * 페이지 이름이 기본값("페이지 3")이면 사용자가 지정한 적이 없다고 보고
 * <파일이름>_p3 을 쓴다. 그 외에는 페이지 이름을 그대로 파일명으로 쓴다.
 * 파일 시스템에서 못 쓰는 문자만 걸러내고, 겹치면 _2, _3 을 붙인다. */
const DEFAULT_PAGE_NAME = /^페이지\s*\d+$/;

function sanitize(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, "_")   // Windows 금지 문자
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
}

export function pageFileBase(page, index, base, pad) {
  const name = (page && page.name ? page.name : "").trim();
  if (name && !DEFAULT_PAGE_NAME.test(name)) {
    const clean = sanitize(name);
    if (clean) return clean;
  }
  const num = (page && page.meta && page.meta.number)
    ? page.meta.number
    : String(index + 1).padStart(pad, "0");
  return `${base}_p${num}`;
}

function uniqueName(used, stem, ext) {
  let candidate = `${stem}${ext}`;
  let n = 2;
  while (used.has(candidate)) candidate = `${stem}_${n++}${ext}`;
  used.add(candidate);
  return candidate;
}

/* ----- 모달 마크업(최초 1회 생성) ----- */
let overlay = null;

function buildModal() {
  overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "batch-export-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal batch-modal" role="dialog" aria-modal="true" aria-labelledby="batch-title">
      <h2 class="modal-title" id="batch-title">페이지 일괄 내보내기</h2>

      <div class="modal-field" id="batch-dir-field">
        <span class="modal-label">저장 폴더</span>
        <div class="batch-dir">
          <span class="batch-dir-path" id="batch-dir-path">폴더가 지정되지 않았습니다</span>
          <button type="button" class="modal-btn" id="batch-dir-pick">폴더 연결</button>
        </div>
      </div>

      <div class="modal-field">
        <span class="modal-label">내보낼 페이지
          <button type="button" class="batch-select-all" id="batch-select-all">전체 선택 / 해제</button>
        </span>
        <div class="batch-list" id="batch-list"></div>
      </div>

      <p class="batch-note" id="batch-note"></p>

      <div class="modal-actions">
        <button type="button" class="modal-btn" id="batch-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="batch-confirm">내보내기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/* ----- openBatchExport: 모달을 열고 사용자가 확정하면 내보낸다 ----- */
export async function openBatchExport({ state, dpi, options, baseName }) {
  if (!overlay) buildModal();

  commitActivePage(state);          // 활성 페이지의 미저장 편집을 page 기록에 반영
  const s = state.get();
  const pages = s.pages || [];
  if (pages.length === 0) return;

  const listEl = overlay.querySelector("#batch-list");
  const pathEl = overlay.querySelector("#batch-dir-path");
  const dirField = overlay.querySelector("#batch-dir-field");
  const noteEl = overlay.querySelector("#batch-note");
  const confirmBtn = overlay.querySelector("#batch-confirm");
  const cancelBtn = overlay.querySelector("#batch-cancel");
  const pickBtn = overlay.querySelector("#batch-dir-pick");
  const allBtn = overlay.querySelector("#batch-select-all");

  const pad = String(pages.length).length;

  // 파일 이름은 전체 페이지 기준으로 한 번만 정한다 — 목록에 보여준 이름과 실제로
  // 저장되는 이름이 어긋나지 않게(선택분만으로 다시 계산하면 중복 접미사가 달라진다).
  const usedNames = new Set();
  const fileNames = pages.map((p, i) => uniqueName(usedNames, pageFileBase(p, i, baseName, pad), ".png"));

  // 페이지 목록: 활성 페이지를 표시해 주고, 기본값은 전부 선택.
  function renderList() {
    listEl.innerHTML = pages.map((p, i) => {
      const file = fileNames[i];
      const active = p.id === s.activePageId;
      return `
        <label class="batch-row">
          <input type="checkbox" data-idx="${i}" checked />
          <span class="batch-row-name">${escapeHtml(p.name || `페이지 ${i + 1}`)}${active ? " <span class=\"batch-row-tag\">현재</span>" : ""}</span>
          <span class="batch-row-file">${escapeHtml(file)}</span>
        </label>`;
    }).join("");
  }
  renderList();

  // 폴더 줄: API 미지원이면 감추고 개별 다운로드로 떨어진다고 알린다.
  await loadSavedDir();
  function syncDir() {
    if (!FS_SUPPORTED) {
      dirField.hidden = true;
      noteEl.textContent = "이 브라우저는 폴더 저장을 지원하지 않아 파일이 하나씩 다운로드됩니다.";
      confirmBtn.disabled = false;
      return;
    }
    dirField.hidden = false;
    pathEl.textContent = dirHandle ? dirHandle.name : "폴더가 지정되지 않았습니다";
    pathEl.classList.toggle("is-empty", !dirHandle);
    pickBtn.textContent = dirHandle ? "폴더 변경" : "폴더 연결";
    noteEl.textContent = dirHandle
      ? `PNG · ${dpi}dpi · 같은 이름의 파일은 덮어씁니다.`
      : "저장할 폴더를 먼저 연결하십시오.";
    confirmBtn.disabled = !dirHandle;
  }
  syncDir();

  function selected() {
    return [...listEl.querySelectorAll("input[type=checkbox]")]
      .filter((c) => c.checked)
      .map((c) => pages[parseInt(c.dataset.idx, 10)]);
  }

  overlay.hidden = false;

  // 한 번 열릴 때마다 핸들러를 새로 걸고 닫을 때 모두 뗀다(상태가 매번 다르다).
  const off = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); off.push(() => el.removeEventListener(ev, fn)); };

  function close() {
    overlay.hidden = true;
    off.forEach((f) => f());
    off.length = 0;
  }

  on(pickBtn, "click", async () => {
    await pickDir();
    syncDir();
  });

  on(allBtn, "click", () => {
    const boxes = [...listEl.querySelectorAll("input[type=checkbox]")];
    const turnOn = boxes.some((c) => !c.checked);
    boxes.forEach((c) => { c.checked = turnOn; });
  });

  on(cancelBtn, "click", close);
  on(overlay, "click", (e) => { if (e.target === overlay) close(); });
  on(document, "keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

  on(confirmBtn, "click", async () => {
    const targets = selected();
    if (targets.length === 0) {
      noteEl.textContent = "내보낼 페이지를 하나 이상 선택하십시오.";
      return;
    }
    if (FS_SUPPORTED && dirHandle && !(await ensureDirPermission(dirHandle))) {
      noteEl.textContent = "폴더 접근 권한이 없습니다. 폴더를 다시 연결하십시오.";
      dirHandle = null;
      syncDir();
      return;
    }

    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    const origLabel = confirmBtn.textContent;
    try {
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const idx = pages.indexOf(p);
        confirmBtn.textContent = `${i + 1}/${targets.length}…`;
        // 렌더가 읽는 필드만 갈아끼운 스냅샷 상태(라이브 상태는 건드리지 않음).
        const snap = { ...s, objects: p.objects, guides: p.guides, layers: p.layers, artboard: p.artboard };
        const name = fileNames[idx];
        const result = await rasterizeExportCanvas(snap, { dpi, bounds: null, options });
        const blob = await new Promise((res) => result.canvas.toBlob(res, "image/png"));
        if (!blob) continue;
        if (FS_SUPPORTED && dirHandle) {
          const fh = await dirHandle.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          downloadBlob(blob, name);
          // 연속 다운로드가 브라우저에 막히지 않도록 살짝 간격을 둔다.
          await new Promise((res) => setTimeout(res, 150));
        }
      }
      close();
      showAlert(
        dirHandle
          ? `${targets.length}개 페이지를 '${dirHandle.name}' 폴더에 저장했습니다.`
          : `${targets.length}개 페이지를 내보냈습니다.`,
        { title: "일괄 내보내기" },
      );
    } catch (_) {
      showAlert("일괄 내보내기 중 오류가 발생했습니다.", { title: "일괄 내보내기" });
    }
    confirmBtn.textContent = origLabel;
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
