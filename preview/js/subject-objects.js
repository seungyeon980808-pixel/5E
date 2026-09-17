import { previewStorage as localStorage } from './preview-storage.js?v=1.6.0-preview-labeler-0917-1111';
import {
  TEMPLATES,
  renderSymbolsForCategories,
  renderSymbolsForIds,
  sizeIconViewBox,
} from "./templates.js?v=1.6.0-preview-labeler-0917-1111";

const SUBJECTS = {
  p: {
    label: "물리",
    parts: [
      { name: "역학", cats: ["역학"] },
      { name: "전기자기학", cats: ["회로", "전자기학"] },
      { name: "파동 및 광학", cats: ["광학"] },
      { name: "열역학", cats: ["열역학"] },
      { name: "현대물리학" },
      { name: "표시·주석", cats: ["표시·주석"] },
    ],
  },
  c: {
    label: "화학",
    parts: [
      { name: "원자와 주기율", cats: ["원자·주기율"] },
      { name: "화학 결합과 분자", cats: ["결합·분자"] },
      { name: "물질의 상태", cats: ["물질의 상태"] },
      { name: "반응과 그래프", cats: ["반응·그래프"] },
      { name: "실험 기구", cats: ["실험 기구"] },
      { name: "표시·주석", cats: ["표시·주석"] },
    ],
  },
  b: {
    label: "생명",
    parts: [
      { name: "세포학", cats: ["세포학"] },
      { name: "동식물학", cats: ["동식물학"] },
      { name: "유전학", cats: ["유전학"] },
      { name: "생태학" },
      { name: "표시·주석", cats: ["표시·주석"] },
    ],
  },
  e: {
    label: "지구",
    parts: [
      { name: "지질학", cats: ["지질학"] },
      { name: "해양학", cats: ["해양학"] },
      { name: "기상학", cats: ["기상학"] },
      { name: "천문학", cats: ["천문학"] },
      { name: "표시·주석", cats: ["표시·주석"] },
    ],
  },
};

const SUBJECT_KEY = "5e.subject";
const BROWSER_KEY = "5e.objectBrowser.v1";
const FAVORITES_KEY = "5e.objectFavorites.v1";
const RECENT_KEY = "5e.objectRecent.v1";
const MAX_RECENT = 6;

const readJson = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
};

function validIds(ids) {
  return Array.isArray(ids) ? ids.filter((id) => TEMPLATES[id]) : [];
}

export function initSubjectObjects() {
  const switcher = document.getElementById("subject-switch");
  const partsHost = document.getElementById("subject-parts");
  const quickHost = document.getElementById("object-quick-access");
  if (!switcher || !partsHost || !quickHost) return;

  const savedBrowser = readJson(BROWSER_KEY, {});
  let legacySubject = null;
  try { legacySubject = localStorage.getItem(SUBJECT_KEY); } catch (_) {}
  let subject = SUBJECTS[savedBrowser.subject]
    ? savedBrowser.subject
    : (SUBJECTS[legacySubject] ? legacySubject : "p");
  const openParts = savedBrowser.openParts && typeof savedBrowser.openParts === "object"
    ? savedBrowser.openParts : {};
  let favorites = validIds(readJson(FAVORITES_KEY, []));
  let recent = validIds(readJson(RECENT_KEY, []));

  const saveBrowser = () => writeJson(BROWSER_KEY, { subject, openParts });
  const saveSubject = () => {
    try { localStorage.setItem(SUBJECT_KEY, subject); } catch (_) {}
  };

  function decorateGrid(grid) {
    for (const button of [...grid.children]) {
      const id = button.dataset.symbol || button.dataset.symbolGroup;
      if (!id) continue;
      const tile = document.createElement("div");
      tile.className = "object-tile";
      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.className = "object-favorite-toggle";
      favorite.textContent = favorites.includes(id) ? "★" : "☆";
      favorite.title = favorites.includes(id) ? "즐겨찾기에서 제거" : "즐겨찾기에 추가";
      favorite.setAttribute("aria-label", favorite.title);
      favorite.setAttribute("aria-pressed", String(favorites.includes(id)));
      favorite.addEventListener("click", (event) => {
        event.stopPropagation();
        favorites = favorites.includes(id) ? favorites.filter((item) => item !== id) : [id, ...favorites];
        writeJson(FAVORITES_KEY, favorites);
        renderAll();
      });
      button.replaceWith(tile);
      tile.append(button, favorite);
    }
  }

  function symbolGrid(ids, categories) {
    const grid = document.createElement("div");
    grid.className = "object-quick-grid";
    const pending = [];
    if (ids) renderSymbolsForIds(grid, ids, pending);
    else renderSymbolsForCategories(grid, categories, pending);
    decorateGrid(grid);
    requestAnimationFrame(() => pending.forEach(sizeIconViewBox));
    return grid;
  }

  function quickGroup(title, ids, emptyText) {
    const group = document.createElement("section");
    group.className = "object-quick-group";
    const heading = document.createElement("h3");
    heading.className = "object-quick-title";
    heading.textContent = title;
    group.appendChild(heading);
    if (ids.length) group.appendChild(symbolGrid(ids));
    else {
      const empty = document.createElement("p");
      empty.className = "object-quick-empty";
      empty.textContent = emptyText;
      group.appendChild(empty);
    }
    return group;
  }

  function renderQuickAccess() {
    quickHost.replaceChildren(
      quickGroup("즐겨찾기", favorites, "오브젝트의 별을 누르면 여기에 모입니다."),
      quickGroup("최근 사용", recent, "사용한 오브젝트가 여기에 표시됩니다."),
    );
  }

  function renderParts() {
    partsHost.replaceChildren();
    for (const part of SUBJECTS[subject].parts) {
      const section = document.createElement("section");
      const expanded = openParts[subject] === part.name;
      section.className = "subject-part" + (expanded ? "" : " is-collapsed");
      const header = document.createElement("button");
      header.type = "button";
      header.className = "subject-part-header";
      header.setAttribute("aria-expanded", String(expanded));
      header.innerHTML = "<span>" + part.name + "</span><span class=\"toggle-icon\">▾</span>";
      const body = document.createElement("div");
      body.className = "subject-part-body";
      if (part.cats?.length) body.appendChild(symbolGrid(null, part.cats));
      else {
        const empty = document.createElement("p");
        empty.className = "subject-part-empty";
        empty.textContent = "준비 중입니다.";
        body.appendChild(empty);
      }
      header.addEventListener("click", () => {
        openParts[subject] = openParts[subject] === part.name ? null : part.name;
        saveBrowser();
        renderParts();
      });
      section.append(header, body);
      partsHost.appendChild(section);
    }
  }

  function syncSubjectButtons() {
    for (const button of switcher.querySelectorAll("button")) {
      button.setAttribute("aria-selected", String(button.dataset.subject === subject));
      button.tabIndex = button.dataset.subject === subject ? 0 : -1;
    }
  }

  function renderAll() {
    syncSubjectButtons();
    renderQuickAccess();
    renderParts();
  }

  for (const [code, config] of Object.entries(SUBJECTS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset.subject = code;
    button.textContent = config.label;
    button.addEventListener("click", () => {
      if (subject === code) return;
      subject = code;
      document.documentElement.setAttribute("data-subject", subject);
      saveSubject();
      saveBrowser();
      renderAll();
      window.dispatchEvent(new CustomEvent("5e:subject-changed", { detail: { subject } }));
    });
    switcher.appendChild(button);
  }

  switcher.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const buttons = [...switcher.querySelectorAll("button")];
    const current = buttons.findIndex((button) => button.dataset.subject === subject);
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    buttons[(current + delta + buttons.length) % buttons.length]?.click();
    buttons[(current + delta + buttons.length) % buttons.length]?.focus();
    event.preventDefault();
  });

  window.addEventListener("5e:template-activated", (event) => {
    const id = event.detail?.symbolId;
    if (!id || TEMPLATES[id]?.category === "공통") return;
    recent = [id, ...recent.filter((item) => item !== id)].slice(0, MAX_RECENT);
    writeJson(RECENT_KEY, recent);
    renderQuickAccess();
  });

  document.documentElement.setAttribute("data-subject", subject);
  saveSubject();
  renderAll();
  document.querySelector("#subject-section > .tool-section-header")?.addEventListener("click", () => {
    requestAnimationFrame(() => document.querySelectorAll("#subject-section svg.tool-ico").forEach(sizeIconViewBox));
  });
  window.dispatchEvent(new CustomEvent("5e:subject-changed", { detail: { subject } }));
}
