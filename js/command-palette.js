/* ===== COMMAND PALETTE (Ctrl+K unified runner: 명령 + 오브젝트 검색) =====
 *
 * Ctrl+F는 오브젝트만 찾는다. 이 팔레트는 같은 창에서 "명령"(실행취소·그룹묶기·
 * 내보내기·격자토글 등 이미 있는 기능)까지 타이핑으로 검색·실행한다. 모달 구조와
 * 키보드 내비게이션(↑↓ Enter Esc)은 search.js의 오브젝트 검색을 그대로 복제했고,
 * 스타일도 object-search-* 클래스를 재사용한다(신규 CSS 없음).
 *
 * 설계 원칙(요청 준수): 명령의 run은 "신규 로직을 만들지 않고" 이미 있는 버튼 클릭/
 * 키보드 단축키/공개 함수만 호출한다.
 *   - 대부분의 기능은 상단바/드롭다운 버튼에 이미 핸들러가 있으므로 element.click().
 *   - 그룹묶기(G)/그룹해제(Shift+G)/잠금토글(K)은 버튼이 없고 transform.js의 전역
 *     keydown 단축키로만 동작한다 → 동일 키 이벤트를 window에 dispatch해 그대로 탄다.
 *   - 오브젝트는 search.js와 동일한 데이터(TEMPLATES/퍼스널)를 재사용해 생성한다.
 */

import { TEMPLATES, activateTemplate, buildSymbolIcon, sizeIconViewBox } from "./templates.js?v=1.0.0";
import { listPersonalItems, insertPersonalItem } from "./personal-objects.js?v=1.0.0";

const CATEGORY_ORDER = ["공통", "광학", "회로", "역학"];

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}

/* 이미 있는 상단바/드롭다운 버튼을 그대로 누른다(핸들러는 요소에 붙어 있어 숨김 상태여도 동작). */
function clickById(id) {
  document.getElementById(id)?.click();
}

/* transform.js의 전역 keydown 단축키를 그대로 태운다(신규 로직 없이 기존 경로 재사용). */
function pressKey(key, { shift = false } = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key, shiftKey: shift, bubbles: true, cancelable: true,
  }));
}

/* ===== COMMAND REGISTRY =====
 * run은 기존 기능을 "연결만" 한다. shortcutLabel은 항목 옆에 회색 배지로 표기된다. */
const COMMANDS = [
  { id: "undo",        label: "실행취소",          keywords: ["undo", "되돌리기", "취소"],        shortcutLabel: "Ctrl+Z",       run: () => clickById("undo-btn") },
  { id: "redo",        label: "다시실행",          keywords: ["redo", "재실행"],                  shortcutLabel: "Ctrl+Shift+Z", run: () => clickById("redo-btn") },
  { id: "group",       label: "그룹 묶기",         keywords: ["group", "묶기", "그룹화"],          shortcutLabel: "G",            run: () => pressKey("g") },
  { id: "ungroup",     label: "그룹 해제",         keywords: ["ungroup", "해제", "그룹풀기"],      shortcutLabel: "Shift+G",      run: () => pressKey("g", { shift: true }) },
  { id: "lockToggle",  label: "잠금 토글",         keywords: ["lock", "잠금", "고정", "unlock"],   shortcutLabel: "K",            run: () => pressKey("k") },
  { id: "projectSave", label: "프로젝트 저장",     keywords: ["save", "저장", "project"],          shortcutLabel: "",             run: () => clickById("project-save") },
  { id: "projectOpen", label: "프로젝트 불러오기", keywords: ["open", "load", "불러오기", "열기"], shortcutLabel: "",             run: () => clickById("project-open") },
  { id: "imageImport", label: "이미지 가져오기",   keywords: ["image", "import", "가져오기", "삽입"], shortcutLabel: "",           run: () => clickById("image-import") },
  { id: "imageExport", label: "이미지로 내보내기", keywords: ["export", "내보내기", "png", "svg"], shortcutLabel: "",             run: () => clickById("image-export") },
  { id: "gridToggle",  label: "격자 토글",         keywords: ["grid", "격자", "모눈"],             shortcutLabel: "",             run: () => clickById("grid-btn") },
  { id: "openDefaults",label: "기본값 설정 열기",  keywords: ["defaults", "기본값", "설정"],        shortcutLabel: "",             run: () => clickById("open-defaults") },
  { id: "settingsExport", label: "설정 저장하기",  keywords: ["settings", "설정", "export", "저장"], shortcutLabel: "",            run: () => clickById("settings-export") },
  { id: "settingsImport", label: "설정 불러오기",  keywords: ["settings", "설정", "import", "불러오기"], shortcutLabel: "",        run: () => clickById("settings-import") },
  { id: "objectSearch", label: "오브젝트 검색 열기", keywords: ["object", "오브젝트", "검색", "찾기"], shortcutLabel: "Ctrl+F",     run: () => clickById("object-search-trigger") },
  { id: "examSearch",  label: "기출문항 검색 열기", keywords: ["exam", "기출", "문항", "검색"],     shortcutLabel: "Ctrl+Shift+F", run: () => clickById("exam-library-open") },
  { id: "bulkEdit",    label: "전체 통일 수정 열기", keywords: ["bulk", "통일", "일괄", "전체수정"], shortcutLabel: "",            run: () => clickById("bulk-edit-open") },
  { id: "imageObjectify", label: "이미지 객체화",  keywords: ["objectify", "객체화", "벡터", "이미지"], shortcutLabel: "",         run: () => clickById("image-objectify-open") },
  { id: "shortcuts",   label: "단축키 도움말",     keywords: ["shortcut", "단축키", "도움말", "help"], shortcutLabel: "",          run: () => clickById("open-shortcuts") },
];

export function initCommandPalette() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="modal object-search-modal" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <h2 class="modal-title" id="command-palette-title">명령 팔레트</h2>
      <input class="modal-input object-search-input" type="text" autocomplete="off"
             placeholder="명령 또는 오브젝트 검색 (Ctrl+K)" aria-label="명령 또는 오브젝트 검색">
      <div class="object-search-results" role="listbox" aria-label="명령/검색 결과"></div>
    </section>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector(".object-search-input");
  const results = overlay.querySelector(".object-search-results");
  let matches = [];
  let highlighted = 0;

  function close() {
    overlay.hidden = true;
    input.value = "";
  }

  function pick(index) {
    const match = matches[index];
    if (!match) return;
    close();
    // 모달을 먼저 닫아 포커스를 캔버스로 돌린 뒤 실행한다(그룹/잠금 단축키가 입력창
    // 포커스 가드에 막히지 않도록). run은 항상 기존 기능만 호출한다.
    if (match.kind === "command") match.cmd.run();
    else if (match.kind === "personal") insertPersonalItem(match.id);
    else activateTemplate(match.id);
  }

  function syncHighlight(scroll = false) {
    const rows = results.querySelectorAll(".object-search-row");
    rows.forEach((row, index) => {
      const active = index === highlighted;
      row.classList.toggle("is-highlighted", active);
      row.setAttribute("aria-selected", String(active));
    });
    if (scroll) rows[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function renderResults() {
    const query = input.value.trim().toLocaleLowerCase();
    const rank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };

    matches = [];
    // (a) 명령: 레지스트리에서 라벨/키워드 매치
    for (const cmd of COMMANDS) {
      if (!query || [cmd.label, ...(cmd.keywords || [])]
        .some((v) => String(v).toLocaleLowerCase().includes(query))) {
        matches.push({ kind: "command", id: cmd.id, cmd });
      }
    }
    // (b) 오브젝트: search.js와 동일 데이터 재사용(TEMPLATES → 퍼스널)
    const objMatches = Object.entries(TEMPLATES)
      .filter(([, def]) => [def.label, ...(def.keywords || [])]
        .some((value) => String(value).toLocaleLowerCase().includes(query)))
      .map(([id, def]) => ({ kind: "template", id, def }))
      .sort((a, b) => rank(a.def.category) - rank(b.def.category));
    for (const it of listPersonalItems()) {
      if (![it.name, it.category].some((v) => String(v).toLocaleLowerCase().includes(query))) continue;
      objMatches.push({ kind: "personal", id: it.id,
        def: { label: it.name, category: `퍼스널 · ${it.category}`, kind: "atomic" } });
    }
    // 빈 검색어일 땐 오브젝트가 수십 개라 창을 덮으므로 명령만 먼저 보인다.
    if (query) matches.push(...objMatches);

    highlighted = matches.length ? 0 : -1;
    results.replaceChildren();

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "object-search-empty";
      empty.textContent = "결과가 없습니다.";
      results.appendChild(empty);
      return;
    }

    // ----- 명령 그룹 (항상 맨 위) -----
    const commandRows = matches.filter((m) => m.kind === "command");
    if (commandRows.length) {
      const heading = document.createElement("div");
      heading.className = "object-search-category";
      heading.textContent = "명령";
      results.appendChild(heading);
      for (const match of commandRows) {
        const index = matches.indexOf(match);
        const row = document.createElement("button");
        row.type = "button";
        row.className = "object-search-row";
        row.dataset.index = String(index);
        row.setAttribute("role", "option");

        const iconBox = document.createElement("span");
        iconBox.className = "object-search-icon";
        const glyph = document.createElement("span");
        glyph.textContent = "⌘";
        glyph.style.cssText = "font-weight:700;font-size:13px;opacity:.65;";
        iconBox.appendChild(glyph);

        const label = document.createElement("span");
        label.textContent = match.cmd.label;
        const badge = document.createElement("span");
        badge.className = "object-search-badge";
        badge.textContent = match.cmd.shortcutLabel || "명령";
        row.append(iconBox, label, badge);
        results.appendChild(row);
      }
    }

    // ----- 오브젝트 그룹 (search.js와 동일한 카테고리 정렬) -----
    const objRows = matches.filter((m) => m.kind !== "command");
    const categories = [...new Set([...CATEGORY_ORDER, ...objRows.map((m) => m.def.category)])];
    for (const category of categories) {
      const group = objRows.filter((m) => m.def.category === category);
      if (!group.length) continue;

      const heading = document.createElement("div");
      heading.className = "object-search-category";
      heading.textContent = category;
      results.appendChild(heading);

      for (const match of group) {
        const index = matches.indexOf(match);
        const row = document.createElement("button");
        row.type = "button";
        row.className = "object-search-row";
        row.dataset.index = String(index);
        row.setAttribute("role", "option");

        const iconBox = document.createElement("span");
        iconBox.className = "object-search-icon";
        let icon = null;
        if (match.kind === "personal") {
          const letter = document.createElement("span");
          letter.textContent = (match.def.label || "?").slice(0, 1);
          letter.style.cssText = "font-weight:700;font-size:13px;";
          iconBox.appendChild(letter);
        } else {
          icon = buildSymbolIcon(match.id, match.def);
          iconBox.appendChild(icon);
        }

        const label = document.createElement("span");
        label.textContent = match.def.label;
        const badge = document.createElement("span");
        badge.className = "object-search-badge";
        badge.textContent = match.kind === "personal" ? "퍼스널" : (match.def.kind === "atomic" ? "즉시" : "드래그");
        row.append(iconBox, label, badge);
        results.appendChild(row);
        if (icon) sizeIconViewBox(icon);
      }
    }
    syncHighlight();
  }

  function open() {
    overlay.hidden = false;
    input.value = "";
    renderResults();
    input.focus();
  }

  input.addEventListener("input", renderResults);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!matches.length) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      highlighted = (highlighted + delta + matches.length) % matches.length;
      syncHighlight(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(highlighted);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  results.addEventListener("mousemove", (event) => {
    const row = event.target.closest(".object-search-row");
    if (!row) return;
    highlighted = Number(row.dataset.index);
    syncHighlight();
  });
  results.addEventListener("click", (event) => {
    const row = event.target.closest(".object-search-row");
    if (row) pick(Number(row.dataset.index));
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  // Ctrl+K 전역 토글(캡처 단계 — Ctrl+F 패턴과 동일). Ctrl+F는 search.js가 그대로 유지.
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.key.toLocaleLowerCase() !== "k") return;
    if (isTypingTarget(event.target) && event.target !== input) return;
    event.preventDefault();
    if (overlay.hidden) open();
    else input.focus();
  }, true);
}
