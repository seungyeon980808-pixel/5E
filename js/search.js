/* ===== OBJECT SEARCH (registry filtering + modal interaction only) ===== */

import {
  TEMPLATES,
  activateTemplate,
  buildSymbolIcon,
  sizeIconViewBox,
} from "./templates.js?v=0.54.8";
import { listPersonalItems, insertPersonalItem } from "./personal-objects.js?v=0.54.8";

const CATEGORY_ORDER = ["공통", "광학", "회로", "역학"];

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.matches("input, textarea, select") || target.isContentEditable
  );
}

export function initObjectSearch() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="modal object-search-modal" role="dialog" aria-modal="true" aria-labelledby="object-search-title">
      <h2 class="modal-title" id="object-search-title">오브젝트 검색</h2>
      <input class="modal-input object-search-input" type="text" autocomplete="off"
             placeholder="이름 또는 키워드 검색" aria-label="오브젝트 이름 검색">
      <div class="object-search-results" role="listbox" aria-label="검색 결과"></div>
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
    if (scroll) rows[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function renderResults() {
    const query = input.value.trim().toLocaleLowerCase();
    const rank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 99 : i; };
    matches = Object.entries(TEMPLATES)
      .filter(([, def]) => [def.label, ...(def.keywords || [])]
        .some((value) => String(value).toLocaleLowerCase().includes(query)))
      .map(([id, def]) => ({ id, def }))
      .sort((a, b) => rank(a.def.category) - rank(b.def.category));
    // 퍼스널 오브젝트: 이름/분류 매치 → 목록 끝에 '퍼스널' 그룹으로
    for (const it of listPersonalItems()) {
      if (![it.name, it.category].some((v) => String(v).toLocaleLowerCase().includes(query))) continue;
      matches.push({ id: it.id, personal: true,
        def: { label: it.name, category: `퍼스널 · ${it.category}`, kind: "atomic" } });
    }
    highlighted = matches.length ? 0 : -1;
    results.replaceChildren();

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "object-search-empty";
      empty.textContent = "검색 결과가 없습니다.";
      results.appendChild(empty);
      return;
    }

    const categories = [...CATEGORY_ORDER, ...new Set(matches.map(({ def }) => def.category))];
    for (const category of [...new Set(categories)]) {
      const group = matches.filter(({ def }) => def.category === category);
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
        if (match.personal) {
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
        badge.textContent = match.personal ? "퍼스널" : (match.def.kind === "atomic" ? "즉시" : "드래그");
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
  results.addEventListener("dblclick", (event) => {
    const row = event.target.closest(".object-search-row");
    if (row) pick(Number(row.dataset.index));
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "f") return;
    if (event.shiftKey) return; // Ctrl+Shift+F는 기출문항 검색 몫
    if (isTypingTarget(event.target) && event.target !== input) return;
    event.preventDefault();
    if (overlay.hidden) open();
    else input.focus();
  }, true);

  // Visible entry point: the same modal that Ctrl+F opens, now reachable by a
  // toolbar button (the shortcut alone was undiscoverable). Optional-chained so
  // the search still works if the button markup is ever absent.
  document.getElementById("object-search-trigger")?.addEventListener("click", open);
}
