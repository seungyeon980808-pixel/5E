import { registerEscapeLayer } from "./escape-layers.js?v=1.7.0-four-session-integration";
import { modKey, shortcutKey, isComposingKey } from "./platform.js?v=1.7.0-four-session-integration";

/* ===== OBJECT SEARCH (registry filtering + modal interaction only) ===== */

import {
  TEMPLATES,
  activateTemplate,
  buildSymbolIcon,
  sizeIconViewBoxes,
} from "./templates.js?v=1.7.0-four-session-integration";
import { listPersonalItems, insertPersonalItem } from "./personal-objects.js?v=1.7.0-four-session-integration";

const CATEGORY_ORDER = ["공통", "광학", "회로", "역학"];

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}

export function initObjectSearch() {
  // 한 번 만들고 크기를 맞춘 아이콘은 다시 쓰고(열 때마다 139개를 새로 만들어 getBBox로 재지 않게),
  // 첫 화면에 보이는 줄만 바로 붙이고 나머지는 다음 프레임에 붙인다 — 창이 뜨는 모션 첫 프레임이 60–90ms 멈췄다.
  const iconCache = new Map(), FIRST_ROWS = 24;
  let restFrame = 0;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="modal object-search-modal" role="dialog" aria-modal="true" aria-labelledby="object-search-title">
      <h2 class="modal-title" id="object-search-title">오브젝트 검색</h2>
      <input class="modal-input object-search-input" type="text" autocomplete="off"
             placeholder="이름 또는 키워드 검색" aria-label="오브젝트 이름 검색" aria-controls="object-search-results">
      <div class="object-search-results" id="object-search-results" role="listbox" aria-label="검색 결과"></div>
    </section>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector(".object-search-input");
  const results = overlay.querySelector(".object-search-results");
  let matches = [];
  let highlighted = 0;
  let returnFocus = null;

  function close() {
    input.blur();
    overlay.hidden = true;
    input.value = "";
    input.removeAttribute("aria-activedescendant");
    (returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : document.getElementById("canvas"))?.focus();
  }

  registerEscapeLayer(overlay.querySelector('[role="dialog"]'), close);

  function pick(index) {
    const match = matches[index];
    if (!match) return;
    close();
    if (match.personal) insertPersonalItem(match.id);
    else activateTemplate(match.id);
  }

  function syncHighlight(scroll = false) {
    const rows = results.querySelectorAll(".object-search-row");
    rows.forEach((row, index) => {
      const active = index === highlighted;
      row.classList.toggle("is-highlighted", active);
      row.setAttribute("aria-selected", String(active));
    });
    if (rows[highlighted]) input.setAttribute("aria-activedescendant", rows[highlighted].id);
    else input.removeAttribute("aria-activedescendant");
    if (scroll) rows[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function renderResults() {
    const query = input.value.trim().toLocaleLowerCase();
    const rank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };
    matches = Object.entries(TEMPLATES)
      .filter(([, def]) => [def.label, ...(def.keywords || [])]
        .some((value) => String(value).toLocaleLowerCase().includes(query)))
      .map(([id, def]) => ({ id, def }));
    // 이름이 검색어와 정확히 같은 것을 맨 위에(그 묶음을 먼저, 묶음 안에서도 먼저). 예: '용수철' → 용수철, 그다음 용수철 저울
    const exact = (def) => String(def.label).toLocaleLowerCase() === query;
    const exactCategories = new Set(matches.filter(({ def }) => exact(def)).map(({ def }) => def.category));
    const groupRank = (c) => exactCategories.has(c) ? -1 : rank(c);
    matches.sort((a, b) => groupRank(a.def.category) - groupRank(b.def.category) || exact(b.def) - exact(a.def));
    for (const it of listPersonalItems()) {
      if (![it.name, it.category].some((v) => String(v).toLocaleLowerCase().includes(query))) continue;
      matches.push({ id: it.id, personal: true,
        def: { label: it.name, category: `내 오브젝트 · ${it.category}`, kind: "atomic" } });
    }
    highlighted = matches.length ? 0 : -1;
    cancelAnimationFrame(restFrame); restFrame = 0;
    results.replaceChildren();
    const nodes = [];

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "object-search-empty";
      empty.textContent = "검색 결과가 없습니다.";
      results.appendChild(empty);
      return;
    }

    const icons = [];
    const categories = [...exactCategories, ...CATEGORY_ORDER, ...new Set(matches.map(({ def }) => def.category))];
    for (const category of [...new Set(categories)]) {
      const group = matches.filter(({ def }) => def.category === category);
      if (!group.length) continue;

      const heading = document.createElement("div");
      heading.className = "object-search-category";
      heading.setAttribute("role", "presentation");
      heading.textContent = category;
      nodes.push(heading);

      for (const match of group) {
        const index = matches.indexOf(match);
        const row = document.createElement("button");
        row.type = "button";
        row.className = "object-search-row";
        row.id = `object-search-option-${index}`;
        row.dataset.index = String(index);
        row.setAttribute("role", "option");

        const iconBox = document.createElement("span");
        iconBox.className = "object-search-icon";
        let icon = null;
        if (match.personal) {
          const letter = document.createElement("span");
          letter.textContent = (match.def.label || "?").slice(0, 1);
          letter.style.cssText = "font-weight:700;font-size: 13px;";
          iconBox.appendChild(letter);
        } else {
          const cached = iconCache.get(match.id);
          if (!cached) { icon = buildSymbolIcon(match.id, match.def); icon.dataset.iconFor = match.id; }
          iconBox.appendChild(cached || icon);
        }

        const label = document.createElement("span");
        label.textContent = match.def.label;
        const badge = document.createElement("span");
        badge.className = "object-search-badge";
        badge.textContent = match.personal ? "내 오브젝트" : (match.def.kind === "atomic" ? "즉시" : "드래그");
        row.append(iconBox, label, badge);
        nodes.push(row);
        if (icon) icons.push(icon);
      }
    }
    const sizeAttached = () => {
      const ready = icons.filter((svg) => svg.isConnected && !svg.dataset.sized);
      sizeIconViewBoxes(ready);
      for (const svg of ready) { svg.dataset.sized = "1"; if (svg.getAttribute("viewBox")) iconCache.set(svg.dataset.iconFor, svg); }
    };
    results.append(...nodes.slice(0, FIRST_ROWS));
    sizeAttached();
    syncHighlight();
    if (nodes.length > FIRST_ROWS) restFrame = requestAnimationFrame(() => { restFrame = 0; results.append(...nodes.slice(FIRST_ROWS)); sizeAttached(); });
  }

  function open() {
    returnFocus = document.activeElement;
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
  results.addEventListener("dblclick", (event) => {
    const row = event.target.closest(".object-search-row");
    if (row) pick(Number(row.dataset.index));
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (isComposingKey(event) || event.defaultPrevented || !modKey(event) || event.shiftKey || event.altKey) return;
    if (shortcutKey(event) !== "f") return;
    if (isTypingTarget(event.target) && event.target !== input) return;
    if (overlay.hidden && document.querySelector(".modal-overlay:not([hidden])")) return;
    event.preventDefault();
    if (overlay.hidden) open();
    else input.focus();
  }, true);

  // Visible entry point: the same modal that Ctrl+F opens, now reachable by a
  // toolbar button (the shortcut alone was undiscoverable). Optional-chained so
  // the search still works if the button markup is ever absent.
  document.getElementById("object-search-trigger")?.addEventListener("click", open);

  // 첫 열기도 매끄럽게: 앱이 한가할 때 아이콘을 20개씩 미리 만들어 크기를 재 둔다(보이지 않는 자리에서).
  // 한 번에 다 하면 그 자체가 긴 작업이 되므로 한가한 틈마다 조금씩. 창이 먼저 열리면 거기서 이어 만든다.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 200));
  const pending = Object.entries(TEMPLATES).filter(([, def]) => !def.hidden);
  const warm = () => {
    if (!overlay.hidden || !pending.length) return;
    const holder = document.createElement("div");
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(holder);
    const built = [];
    for (const [id, def] of pending.splice(0, 20)) {
      if (iconCache.has(id)) continue;
      const svg = buildSymbolIcon(id, def); svg.dataset.iconFor = id;
      const box = document.createElement("span"); box.className = "object-search-icon"; box.appendChild(svg);
      holder.appendChild(box); built.push(svg);
    }
    sizeIconViewBoxes(built);
    for (const svg of built) { svg.dataset.sized = "1"; if (svg.getAttribute("viewBox")) iconCache.set(svg.dataset.iconFor, svg); svg.remove(); }
    holder.remove();
    if (pending.length) idle(warm, { timeout: 4000 });
  };
  idle(warm, { timeout: 4000 });
}
