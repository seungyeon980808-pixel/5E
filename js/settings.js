/* ===== SETTINGS (설정 dropdown + 기본값 설정 modal) ===== */
//
// Step 1 of the defaults feature. Owns the "설정 ▾" top-bar dropdown and the
// "기본값 설정" modal, mirroring export-dialog.js (initFileMenu + buildModal):
//
//   1. "설정 ▾" dropdown — opens on click, closes on outside-click / Escape.
//      Items: 기본값 설정 (opens the modal) + 단축키 설정 (disabled, 준비 중).
//
//   2. 기본값 설정 modal — stroke/fill/text/grid defaults, persisted to
//      localStorage under DEFAULTS_KEY. 취소 / 저장; only 저장 persists.
//
// NOTE: This step only *stores* the values. Wiring them into shape creation is
// step 2 — nothing here reads back into the drawing pipeline yet.

import {
  TEXT_FONTS,
  TEXT_STYLES,
  DEFAULT_TEXT_FONT,
  DEFAULT_TEXT_SIZE_MM,
} from "./state.js?v=0.56.0";
import { registerTopMenu } from "./top-menu.js?v=0.56.0";
import { showAlert, showConfirm } from "./ui-dialogs.js?v=0.56.0";
import {
  PREVIEW_BG_KEY,
  loadPreviewBackgrounds,
  addPreviewBackground,
  removePreviewBackground,
} from "./preview-backgrounds.js?v=0.56.0";

/* ----- defaults schema + localStorage load/save ----- */
const DEFAULTS_KEY = "phyDraw.defaults";
const FACTORY_DEFAULTS = {
  strokeWidth: 0.2,      // mm
  strokeLevel: 0,        // 0 = black
  fillLevel: 255,        // opaque white default for new shapes
  textSizeMm: DEFAULT_TEXT_SIZE_MM,  // matches DEFAULT_TEXT_SIZE_MM
  textFont: DEFAULT_TEXT_FONT,       // css font-family string
  textWeight: "normal",
  textStyle: "normal",
  gridVisible: false,
  gridOpacity: 3,
  gridInterval: 10,
  rulerTickMm: 10,        // 자 눈금 간격(mm) — 새 자 생성 시 초깃값
  protractorTickDeg: 10,  // 각도기 눈금 간격(°)
};

export function loadDefaults() {
  try {
    return { ...FACTORY_DEFAULTS, ...JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}") };
  } catch {
    return { ...FACTORY_DEFAULTS };
  }
}
function saveDefaults(d) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
}

/* ----- settings file I/O (백업/복원) ----- */
//
// 비설치형 웹앱이라 브라우저 캐시(localStorage)를 지우면 개인 설정이 사라진다.
// 여기서 개인 설정 키들을 JSON 파일로 내보내고(다운로드) 다시 불러온다(복원).
// 다운로드/파일입력 관습은 project-io.js와 동일(Blob + <a download>, <input type=file>).
//
// PERSONAL_KEYS: settings.js와 앱이 관리하는 "개인 설정" localStorage 키 목록.
//   - DEFAULTS_KEY("phyDraw.defaults") : 기본값 설정 모달이 관리
//   - "theme"                          : 흑백/라이트 모드(main.js가 관리)
// 존재하는 키만 내보낸다(값이 없는 키는 파일에 포함하지 않는다).
const THEME_KEY = "theme";
const PERSONAL_OBJECTS_KEY = "5e.personalObjects"; // 퍼스널 오브젝트 라이브러리
const SUBJECT_KEY = "5e.subject";                   // 선택 과목(테마)
const PERSONAL_KEYS = [DEFAULTS_KEY, THEME_KEY, PERSONAL_OBJECTS_KEY, SUBJECT_KEY, PREVIEW_BG_KEY];

// 파일 안의 마커/버전 — 불러오기 시 프로젝트 파일 등 다른 JSON과 구분하고
// 스키마 검증에 쓴다. 앱 UI 버전과는 별개다.
const SETTINGS_FILE_KIND = "5E-settings";
const SETTINGS_FILE_VERSION = "1";

// 파일명: 5E-settings-YYYYMMDD.json
function settingsFilename() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  return `5E-settings-${stamp}.json`;
}

// 현재 개인 설정을 모아 파일 페이로드로 만든다(존재하는 키만 포함).
// keys를 넘기면 그 키만 포함(설정 저장 위젯의 항목 선택).
function collectSettings(keys = PERSONAL_KEYS) {
  const data = {};
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    data[key] = raw;   // 원본 문자열 그대로 보존(정확한 왕복 보장)
  }
  return {
    app: "5E",
    kind: SETTINGS_FILE_KIND,
    version: SETTINGS_FILE_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
}

/* 저장 위치 지정: 브라우저가 지원하면(크롬/엣지) 폴더·파일명을 고르는 저장
 * 대화상자를 띄우고, 아니면 기존처럼 다운로드 폴더로 내려받는다. */
async function saveJsonWithPicker(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "5E 설정 파일", accept: { "application/json": [".json"] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (err) {
      if (err && err.name === "AbortError") return false; // 사용자가 취소
      // 실패 시 다운로드 폴백
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/* 설정 저장 위젯: 무엇을 저장할지 고르고 → 저장 위치 지정 */
const EXPORT_CHOICES = [
  { key: DEFAULTS_KEY,          label: "기본값 설정 (선 굵기·글꼴 등)" },
  { key: THEME_KEY,             label: "화면 테마 (다크/화이트)" },
  { key: SUBJECT_KEY,           label: "과목 선택" },
  { key: PERSONAL_OBJECTS_KEY,  label: "퍼스널 오브젝트 라이브러리" },
  { key: PREVIEW_BG_KEY,        label: "인쇄 비교 배경 이미지" },
];
function openExportDialog() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="width:min(340px, calc(100vw - 32px))">
      <h2 class="modal-title">설정 저장하기</h2>
      <p class="objectify-description" style="margin:0 0 8px;">
        저장할 항목을 고르고 [저장]을 누르면 위치를 지정해 파일로 내려받습니다.
        '설정 불러오기'로 언제든 복원할 수 있습니다.</p>
      ${EXPORT_CHOICES.map((c, i) => `
        <label class="modal-field modal-field-row" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" data-i="${i}" ${localStorage.getItem(c.key) !== null ? "checked" : "disabled title=\"저장할 내용이 없습니다\""} />
          <span class="modal-label" style="margin:0;">${c.label}</span>
        </label>`).join("")}
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="sx-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="sx-ok">저장</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("#sx-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  overlay.querySelector("#sx-ok").addEventListener("click", async () => {
    const keys = [...overlay.querySelectorAll("input[type=checkbox]")]
      .filter((cb) => cb.checked)
      .map((cb) => EXPORT_CHOICES[Number(cb.dataset.i)].key);
    if (!keys.length) { showAlert("저장할 항목을 하나 이상 선택하세요.", { title: "설정 저장하기" }); return; }
    const json = JSON.stringify(collectSettings(keys), null, 2);
    close();
    await saveJsonWithPicker(json, settingsFilename());
  });
}

// 불러온 페이로드가 우리 설정 파일 스키마인지 검증한다(깨진/다른 파일 방어).
// 통과하면 { data } 를, 아니면 null 을 돌려준다.
function validateSettingsPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== SETTINGS_FILE_KIND) return null;
  if (!raw.data || typeof raw.data !== "object") return null;
  // data 안의 값은 localStorage에 넣을 문자열이어야 한다.
  for (const key of Object.keys(raw.data)) {
    if (typeof raw.data[key] !== "string") return null;
  }
  return { data: raw.data };
}

// 파일에서 읽어들인 설정을 localStorage에 반영하고, 가능한 것은 즉시 적용한다.
// 우리가 아는 개인 설정 키(PERSONAL_KEYS)만 반영한다(임의 키 주입 방지).
// 반환: 반영된 키 배열.
function applyImportedSettings(data) {
  const applied = [];
  const failed = [];
  for (const key of PERSONAL_KEYS) {
    if (!(key in data)) continue;
    const value = data[key];

    if (key === DEFAULTS_KEY) {
      // 값이 유효한 JSON 객체일 때만 반영(깨진 값이 defaults를 오염시키지 않게).
      try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== "object") continue;
      } catch {
        continue;
      }
    }
    if (key === THEME_KEY && value !== "light" && value !== "dark") continue;

    // 키별 try/catch — 한 항목이 용량 초과 등으로 실패해도 나머지 항목은 계속 반영하고,
    // 실패한 키는 모아 호출부가 사용자에게 안내할 수 있게 한다(예전엔 예외가 던져져 이후
    // 항목이 침묵 중단됐음).
    try {
      localStorage.setItem(key, value);
      applied.push(key);
    } catch (_) {
      failed.push(key);
    }
  }

  // theme는 즉시 적용 가능 — main.js initTheme과 동일하게 <html> 속성 + 토글 버튼 반영.
  if (applied.includes(THEME_KEY)) applyThemeLive(data[THEME_KEY]);

  return { applied, failed };
}

// theme를 리로드 없이 즉시 반영(main.js initTheme의 동작을 그대로 재현).
function applyThemeLive(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const dark = theme === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "흑백 모드 끄기" : "흑백 모드 켜기");
    btn.title = dark ? "흑백 모드 끄기" : "흑백 모드 켜기";
  }
}

// 설정 불러오기: 파일 파싱 → 검증 → 반영. 실패 시 한국어로 알리고 아무것도 바꾸지 않는다.
function importSettingsFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let raw;
    try {
      raw = JSON.parse(reader.result);
    } catch {
      alert("설정 파일을 읽을 수 없습니다. 올바른 5E 설정 파일인지 확인해 주세요.");
      return;
    }
    const valid = validateSettingsPayload(raw);
    if (!valid) {
      alert("올바른 5E 설정 파일이 아닙니다. 설정은 변경되지 않았습니다.");
      return;
    }
    const { applied, failed } = applyImportedSettings(valid.data);
    if (applied.length === 0) {
      alert(
        failed.length
          ? "저장 공간이 부족해 설정을 반영하지 못했습니다. 설정은 변경되지 않았습니다."
          : "불러올 수 있는 설정 항목이 없습니다. 설정은 변경되지 않았습니다."
      );
      return;
    }
    // 기본값 설정(phyDraw.defaults)은 새 도형 생성 시 참조되므로 즉시 반영되지만,
    // 이미 그려 둔 도형이나 열려 있는 모달에는 재열기 전까지 보이지 않을 수 있다.
    const needsReopenNote = applied.includes(DEFAULTS_KEY);
    alert(
      "설정을 불러왔습니다." +
      (needsReopenNote ? "\n기본값 설정은 다음에 '기본값 설정'을 열 때 반영된 값으로 표시됩니다." : "") +
      (failed.length ? `\n일부 항목(${failed.length}개)은 저장 공간 부족으로 반영되지 못했습니다.` : "")
    );
  };
  reader.onerror = () => alert("파일을 읽는 중 오류가 발생했습니다.");
  reader.readAsText(file);
}

/* ----- dropdown: registered with the shared top-menu (exclusive with 파일) -----
 * 하단 설명 영역(#settings-menu-desc): 파일 메뉴와 동일 패턴 — hover/focus한
 * 항목의 data-desc를 보여주고, 벗어나면 기본 안내로 되돌린다. */
const DEFAULT_SETTINGS_DESC = "설정 작업을 선택하세요.";
function initSettingsMenu() {
  const btn = document.getElementById("settings-menu-btn");
  const list = document.getElementById("settings-menu-list");
  const desc = document.getElementById("settings-menu-desc");
  const reset = () => { if (desc) desc.textContent = DEFAULT_SETTINGS_DESC; };
  if (desc && list) {
    list.querySelectorAll(".file-menu-item").forEach((item) => {
      const text = item.getAttribute("data-desc");
      const show = () => { if (text) desc.textContent = text; };
      item.addEventListener("mouseenter", show);
      item.addEventListener("focus", show);
      item.addEventListener("mouseleave", reset);
      item.addEventListener("blur", reset);
    });
  }
  registerTopMenu("settings", btn, list, { onOpen: reset });
}

/* ----- modal markup, built once and appended to <body> ----- */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "defaults-overlay";
  overlay.hidden = true;
  // f.css can contain double quotes (e.g. '"신명중명조", ...'); escaping keeps the
  // value attribute intact so the option value matches the stored default exactly
  // (otherwise the default font option breaks and the preview can't resolve it).
  const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const fontOptions = TEXT_FONTS
    .map((f) => `<option value="${escAttr(f.css)}">${f.label}</option>`)
    .join("");
  const styleOptions = TEXT_STYLES
    .map((s, i) => `<option value="${i}">${s.label}</option>`)
    .join("");

  overlay.innerHTML = `
    <div class="modal modal-defaults" role="dialog" aria-modal="true" aria-labelledby="defaults-title">
      <h2 class="modal-title" id="defaults-title">기본값 설정</h2>
      <p class="defaults-notice">이 값들은 저장은 되지만 아직 새 도형 생성·격자 표시에는
        반영되지 않습니다(다음 업데이트에서 적용 예정).</p>

      <div class="defaults-body">
        <div class="defaults-fields">
          <label class="modal-field" for="defaults-stroke-width">
            <span class="modal-label">기본 선 굵기 (mm)</span>
            <input type="number" id="defaults-stroke-width" class="modal-input"
                   step="0.1" min="0.1" max="0.5" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-stroke-level">
            <span class="modal-label">기본 선 명도 (0-255)</span>
            <input type="number" id="defaults-stroke-level" class="modal-input"
                   min="0" max="255" step="1" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-fill-level">
            <span class="modal-label">기본 채우기 명도 (0-255)</span>
            <input type="number" id="defaults-fill-level" class="modal-input"
                   min="0" max="255" step="1" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-text-size">
            <span class="modal-label">기본 글자 크기 (mm)</span>
            <input type="number" id="defaults-text-size" class="modal-input"
                   step="0.1" min="0" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-text-font">
            <span class="modal-label">기본 글씨체</span>
            <select id="defaults-text-font" class="modal-input">${fontOptions}</select>
          </label>

          <label class="modal-field" for="defaults-text-style">
            <span class="modal-label">기본 글자 스타일 (굵기)</span>
            <select id="defaults-text-style" class="modal-input">${styleOptions}</select>
          </label>

          <label class="modal-field modal-field-row" for="defaults-grid-visible">
            <input type="checkbox" id="defaults-grid-visible" />
            <span class="modal-label">앱 시작 시 격자 표시</span>
          </label>

          <label class="modal-field" for="defaults-grid-opacity">
            <span class="modal-label">격자 진하기 (1-10)</span>
            <input type="number" id="defaults-grid-opacity" class="modal-input"
                   min="1" max="10" step="1" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-grid-interval">
            <span class="modal-label">격자 간격 (mm)</span>
            <input type="number" id="defaults-grid-interval" class="modal-input"
                   min="5" max="50" step="5" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-ruler-tick">
            <span class="modal-label">자 눈금 간격 (mm)</span>
            <input type="number" id="defaults-ruler-tick" class="modal-input"
                   min="1" max="50" step="1" autocomplete="off" />
          </label>

          <label class="modal-field" for="defaults-protractor-tick">
            <span class="modal-label">각도기 눈금 간격 (°)</span>
            <input type="number" id="defaults-protractor-tick" class="modal-input"
                   min="1" max="45" step="1" autocomplete="off" />
          </label>

          <div class="defaults-pbg">
            <span class="modal-label">인쇄 비교 이미지</span>
            <p class="defaults-pbg-desc">실제 인쇄해 본 시험지 이미지를 등록하면,
              '이미지로 내보내기 → 미리보기'에서 배경으로 골라 크기를 비교할 수 있습니다.</p>
            <div id="defaults-pbg-list" class="defaults-pbg-list"></div>
            <div class="defaults-pbg-form">
              <input type="file" id="defaults-pbg-file" accept="image/png,image/jpeg,image/webp" />
              <div class="defaults-pbg-row">
                <input type="text" id="defaults-pbg-name" class="modal-input"
                       placeholder="이름(선택)" maxlength="40" autocomplete="off" />
                <input type="number" id="defaults-pbg-w" class="modal-input"
                       placeholder="가로 mm" min="1" step="1" autocomplete="off" />
                <input type="number" id="defaults-pbg-h" class="modal-input"
                       placeholder="세로 mm" min="1" step="1" autocomplete="off" />
                <button type="button" id="defaults-pbg-add" class="modal-btn">추가</button>
              </div>
            </div>
          </div>
        </div>

        <div class="defaults-preview">
          <span class="modal-label">미리보기</span>
          <svg id="defaults-preview-svg" class="defaults-preview-svg"
               viewBox="0 0 320 240"
               xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-btn" id="defaults-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="defaults-save">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/* ----- initSettings: wire dropdown + 기본값 설정 modal ----- */
export function initSettings(state) {
  initSettingsMenu();

  const overlay = buildModal();
  const fields = {
    strokeWidth:  overlay.querySelector("#defaults-stroke-width"),
    strokeLevel:  overlay.querySelector("#defaults-stroke-level"),
    fillLevel:    overlay.querySelector("#defaults-fill-level"),
    textSizeMm:   overlay.querySelector("#defaults-text-size"),
    textFont:     overlay.querySelector("#defaults-text-font"),
    textStyle:    overlay.querySelector("#defaults-text-style"),
    gridVisible:  overlay.querySelector("#defaults-grid-visible"),
    gridOpacity:  overlay.querySelector("#defaults-grid-opacity"),
    gridInterval: overlay.querySelector("#defaults-grid-interval"),
    rulerTickMm:      overlay.querySelector("#defaults-ruler-tick"),
    protractorTickDeg: overlay.querySelector("#defaults-protractor-tick"),
  };
  const previewSvg = overlay.querySelector("#defaults-preview-svg");

  function populate() {
    const d = loadDefaults();
    fields.strokeWidth.value  = d.strokeWidth;
    fields.strokeLevel.value  = d.strokeLevel;
    fields.fillLevel.value    = d.fillLevel;
    fields.textSizeMm.value   = d.textSizeMm;
    fields.textFont.value     = d.textFont;
    // Find the style preset matching the stored weight/style (fallback: 0 = Regular).
    const styleIdx = TEXT_STYLES.findIndex(
      (s) => s.fontWeight === d.textWeight && s.fontStyle === d.textStyle
    );
    fields.textStyle.value    = String(styleIdx < 0 ? 0 : styleIdx);
    fields.gridVisible.checked = !!d.gridVisible;
    fields.gridOpacity.value  = d.gridOpacity;
    fields.gridInterval.value = d.gridInterval;
    fields.rulerTickMm.value       = d.rulerTickMm;
    fields.protractorTickDeg.value = d.protractorTickDeg;
  }

  // Read the chosen TEXT_STYLES preset (weight + font-style) from the select.
  function currentStyle() {
    return TEXT_STYLES[Number(fields.textStyle.value)] || TEXT_STYLES[0];
  }

  // Live integrated preview: a simple MECHANICS exam diagram (grid + incline +
  // a box resting on the slope + a small force arrow + sample label). mm → px
  // via a fixed scale, treating the preview as ~48mm wide so the scene fits the
  // larger 320×240 viewBox without clipping.
  function renderPreview() {
    const PREVIEW_W = 320, PREVIEW_H = 240;
    const scale = PREVIEW_W / 48;  // px per mm

    const gray = (g) => `rgb(${g},${g},${g})`;
    const strokeColor = gray(Number(fields.strokeLevel.value) || 0);
    const fillColor   = gray(Number(fields.fillLevel.value) || 0);
    const strokePx    = Math.max(0.4, Number(fields.strokeWidth.value) * scale);

    // grid: interval (mm) → px spacing; opacity 1-10 → 0.05-1.0.
    const interval = Math.max(1, Number(fields.gridInterval.value) || 10);
    const stepPx   = interval * scale;
    const opLevel  = Math.min(10, Math.max(1, Number(fields.gridOpacity.value) || 1));
    const gridOpacity = 0.05 + ((opLevel - 1) / 9) * 0.95;

    let gridLines = "";
    for (let x = stepPx; x < PREVIEW_W; x += stepPx) {
      gridLines += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${PREVIEW_H}" />`;
    }
    for (let y = stepPx; y < PREVIEW_H; y += stepPx) {
      gridLines += `<line x1="0" y1="${y.toFixed(1)}" x2="${PREVIEW_W}" y2="${y.toFixed(1)}" />`;
    }

    // --- incline (right-triangle ramp): bottom edge + hypotenuse rising L→R ---
    const BL = { x: 40,  y: 200 };  // bottom-left
    const BR = { x: 290, y: 200 };  // bottom-right (ground end)
    const AP = { x: 290, y: 90  };  // apex (top-right)
    const ramp =
      `<polygon points="${BL.x},${BL.y} ${BR.x},${BR.y} ${AP.x},${AP.y}"
                fill="none" stroke="${strokeColor}" stroke-width="${strokePx.toFixed(2)}"
                stroke-linejoin="round" />`;

    // --- box seated on the hypotenuse (BL → AP), rotated to match the slope ---
    const dx = AP.x - BL.x, dy = AP.y - BL.y;        // slope vector (dy < 0: rises)
    const angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const t = 0.45;                                  // fraction up the slope
    const seat = { x: BL.x + dx * t, y: BL.y + dy * t };
    const BW = 26, BH = 20;
    const box =
      `<g transform="translate(${seat.x.toFixed(1)},${seat.y.toFixed(1)}) rotate(${angDeg.toFixed(2)})">
         <rect x="${(-BW / 2).toFixed(1)}" y="${(-BH).toFixed(1)}" width="${BW}" height="${BH}"
               fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokePx.toFixed(2)}"
               stroke-linejoin="round" />
       </g>`;

    // --- small force arrow from the box, pointing down-slope (살짝) ---
    const len = Math.hypot(dx, dy);
    const ds = { x: -dx / len, y: -dy / len };       // down-slope unit (toward BL)
    // start a touch above the slope at the box, then go a short way down-slope
    const aStart = { x: seat.x + ds.y * 10, y: seat.y - ds.x * 10 };
    const aEnd   = { x: aStart.x + ds.x * 30, y: aStart.y + ds.y * 30 };
    const aAng   = Math.atan2(aEnd.y - aStart.y, aEnd.x - aStart.x);
    const HEAD = 8;
    const h1 = { x: aEnd.x - HEAD * Math.cos(aAng - Math.PI / 7),
                 y: aEnd.y - HEAD * Math.sin(aAng - Math.PI / 7) };
    const h2 = { x: aEnd.x - HEAD * Math.cos(aAng + Math.PI / 7),
                 y: aEnd.y - HEAD * Math.sin(aAng + Math.PI / 7) };
    const arrow =
      `<g stroke="${strokeColor}" stroke-width="${strokePx.toFixed(2)}"
          stroke-linecap="round" stroke-linejoin="round" fill="none">
         <line x1="${aStart.x.toFixed(1)}" y1="${aStart.y.toFixed(1)}"
               x2="${aEnd.x.toFixed(1)}" y2="${aEnd.y.toFixed(1)}" />
         <polyline points="${h1.x.toFixed(1)},${h1.y.toFixed(1)} ${aEnd.x.toFixed(1)},${aEnd.y.toFixed(1)} ${h2.x.toFixed(1)},${h2.y.toFixed(1)}" />
       </g>`;

    // --- sample label (upper-left, clear of the ramp) ---
    const style = currentStyle();
    const fontPx = Math.max(6, Number(fields.textSizeMm.value) * scale);
    const fontFamily = fields.textFont.value;
    const label =
      `<text x="12" y="${(fontPx + 8).toFixed(1)}" fill="${strokeColor}"
             font-size="${fontPx.toFixed(1)}"
             font-family="${fontFamily.replace(/"/g, "&quot;")}"
             font-weight="${style.fontWeight}" font-style="${style.fontStyle}"
             text-anchor="start"
             dominant-baseline="alphabetic">ABC 가나다</text>`;

    previewSvg.innerHTML = `
      <rect x="0" y="0" width="${PREVIEW_W}" height="${PREVIEW_H}" fill="#ffffff" />
      <g stroke="#000000" stroke-width="1" opacity="${gridOpacity.toFixed(3)}"
         vector-effect="non-scaling-stroke">${gridLines}</g>
      ${ramp}
      ${box}
      ${arrow}
      ${label}
    `;
  }

  // Re-render the preview on any control change (no 저장 needed to see it).
  fields.gridVisible.parentElement.parentElement
    .querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", renderPreview);
      el.addEventListener("change", renderPreview);
    });

  function showModal() {
    populate();
    renderPreview();
    renderPbgList();
    overlay.hidden = false;
    fields.strokeWidth.focus();
    fields.strokeWidth.select();
  }
  function hideModal() {
    overlay.hidden = true;
  }

  // Open from the dropdown item.
  const openBtn = document.getElementById("open-defaults");
  if (openBtn) openBtn.addEventListener("click", showModal);

  // Cancel / overlay-click / Escape close without saving.
  overlay.querySelector("#defaults-cancel").addEventListener("click", hideModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) hideModal();
  });

  // Save: read fields → persist → close. (Step 2 wires these into drawing.)
  overlay.querySelector("#defaults-save").addEventListener("click", () => {
    const style = currentStyle();
    saveDefaults({
      strokeWidth:  Number(fields.strokeWidth.value),
      strokeLevel:  Number(fields.strokeLevel.value),
      fillLevel:    Number(fields.fillLevel.value),
      textSizeMm:   Number(fields.textSizeMm.value),
      textFont:     fields.textFont.value,
      textWeight:   style.fontWeight,
      textStyle:    style.fontStyle,
      gridVisible:  fields.gridVisible.checked,
      gridOpacity:  Number(fields.gridOpacity.value),
      gridInterval: Number(fields.gridInterval.value),
      rulerTickMm:       Number(fields.rulerTickMm.value),
      protractorTickDeg: Number(fields.protractorTickDeg.value),
    });
    hideModal();
  });

  /* ----- 인쇄 비교 이미지: 업로드 / 목록 / 삭제 ----- */
  const pbgFile = overlay.querySelector("#defaults-pbg-file");
  const pbgName = overlay.querySelector("#defaults-pbg-name");
  const pbgW = overlay.querySelector("#defaults-pbg-w");
  const pbgH = overlay.querySelector("#defaults-pbg-h");
  const pbgAdd = overlay.querySelector("#defaults-pbg-add");
  const pbgListEl = overlay.querySelector("#defaults-pbg-list");

  function renderPbgList() {
    const list = loadPreviewBackgrounds();
    pbgListEl.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "defaults-pbg-empty";
      empty.textContent = "등록된 이미지가 없습니다.";
      pbgListEl.appendChild(empty);
      return;
    }
    for (const bg of list) {
      const row = document.createElement("div");
      row.className = "defaults-pbg-item";
      const thumb = document.createElement("img");
      thumb.src = bg.dataUrl;
      thumb.alt = "";
      thumb.className = "defaults-pbg-thumb";
      const meta = document.createElement("span");
      meta.className = "defaults-pbg-meta";
      meta.textContent = `${bg.name} · ${bg.widthMm}×${bg.heightMm}mm`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "defaults-pbg-del";
      del.textContent = "✕";
      del.title = "삭제";
      del.addEventListener("click", async () => {
        const yes = await showConfirm(`'${bg.name}'\n정말로 삭제하시겠습니까?`,
          { title: "이미지 삭제", okText: "예", cancelText: "아니오" });
        if (!yes) return;
        removePreviewBackground(bg.id);
        renderPbgList();
      });
      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(del);
      pbgListEl.appendChild(row);
    }
  }

  pbgAdd.addEventListener("click", async () => {
    const file = pbgFile.files && pbgFile.files[0];
    if (!file) { showAlert("추가할 이미지 파일을 먼저 선택하세요.", { title: "인쇄 비교 이미지" }); return; }
    pbgAdd.disabled = true;
    try {
      await addPreviewBackground({
        name: pbgName.value,
        widthMm: pbgW.value,
        heightMm: pbgH.value,
        file,
      });
      pbgFile.value = ""; pbgName.value = ""; pbgW.value = ""; pbgH.value = "";
      renderPbgList();
    } catch (err) {
      showAlert(err && err.message ? err.message : "이미지를 추가하지 못했습니다.", { title: "인쇄 비교 이미지" });
    }
    pbgAdd.disabled = false;
  });

  /* ----- 설정 파일 저장/불러오기 dropdown 항목 wiring ----- */
  // 숨김 파일 입력은 여기서 만들어 index.html은 마크업만 유지(project-io.js 관습).
  const settingsFileInput = document.createElement("input");
  settingsFileInput.type = "file";
  settingsFileInput.accept = ".json,application/json";
  settingsFileInput.style.display = "none";
  document.body.appendChild(settingsFileInput);

  const exportBtn = document.getElementById("settings-export");
  if (exportBtn) exportBtn.addEventListener("click", openExportDialog);

  const importBtn = document.getElementById("settings-import");
  if (importBtn) importBtn.addEventListener("click", () => settingsFileInput.click());

  settingsFileInput.addEventListener("change", () => {
    const file = settingsFileInput.files && settingsFileInput.files[0];
    if (file) importSettingsFile(file);
    // 같은 파일을 다시 선택해도 change가 발생하도록 초기화.
    settingsFileInput.value = "";
  });
}
