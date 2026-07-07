/* ===== 과목별 오브젝트 라이브러리 (상단 과목 선택 + 파트별 아코디언) =====
 *
 * 상단 툴바의 과목 선택(#subject-select, 5E 브랜드 옆)과 왼쪽 패널의
 * '과목별 오브젝트' 파트 아코디언(#subject-parts)을 배선한다.
 *   · 과목 선택 → :root[data-subject] 로 강조색·배경 톤 테마 전환
 *     (실제 색은 css/style.css의 :root[data-subject="..."] 규칙이 담당)
 *   · 파트 아코디언: 기존 심볼 라이브러리(templates.js)의 카테고리를
 *     새 분류로 흡수 — 회로·전자기학→전기자기학, 역학→역학, 광학→파동 및 광학.
 *     심볼이 없는 파트는 '준비 중입니다.' 자리 표시.
 *   · 모든 파트는 기본 접힘. 아이콘 크기 계산(getBBox)은 접힌 상태에서 0이
 *     나오므로 첫 펼침 때 지연 수행한다.
 * 공통 도구(#tool-list 상단)는 과목과 무관하게 항상 표시된다.
 */

import { renderSymbolsForCategories, sizeIconViewBox } from "./templates.js?v=0.54.10";

const SUBJECTS = {
  p: {
    label: "물리학",
    parts: [
      { name: "역학", cats: ["역학"] },
      { name: "전기자기학", cats: ["회로", "전자기학"] },
      { name: "파동 및 광학", cats: ["광학"] },
      { name: "열역학" },
      { name: "현대물리학" },
    ],
  },
  c: {
    label: "화학",
    parts: [{ name: "유기화학" }, { name: "무기화학" }, { name: "물리화학" }, { name: "분석화학" }],
  },
  b: {
    label: "생명과학",
    parts: [{ name: "세포학" }, { name: "동식물학" }, { name: "유전학" }, { name: "생태학" }],
  },
  e: {
    label: "지구과학",
    parts: [{ name: "지질학" }, { name: "해양학" }, { name: "기상학" }, { name: "천문학" }],
  },
};

const STORAGE_KEY = "5e.subject";

function buildParts(container, code) {
  container.innerHTML = "";
  const parts = (SUBJECTS[code] || SUBJECTS.p).parts;
  for (const part of parts) {
    const sec = document.createElement("div");
    sec.className = "subject-part is-collapsed"; // 기본 접힘
    const header = document.createElement("button");
    header.type = "button";
    header.className = "subject-part-header";
    header.innerHTML = `<span>${part.name}</span><span class="toggle-icon">▾</span>`;
    const body = document.createElement("div");
    body.className = "subject-part-body";

    let sizer = null; // 첫 펼침 때 아이콘 사이징할 svg 목록
    if (part.cats && part.cats.length) {
      const grid = document.createElement("div");
      grid.className = "tool-section-body"; // 공통 도구와 같은 3열 아이콘 그리드
      sizer = [];
      const n = renderSymbolsForCategories(grid, part.cats, sizer);
      if (n > 0) body.appendChild(grid);
      else body.innerHTML = `<p class="subject-part-empty">준비 중입니다.</p>`;
    } else {
      body.innerHTML = `<p class="subject-part-empty">준비 중입니다.</p>`;
    }

    header.addEventListener("click", () => {
      sec.classList.toggle("is-collapsed");
      if (sizer && !sec.classList.contains("is-collapsed")) {
        for (const svg of sizer) sizeIconViewBox(svg); // 보이게 된 뒤 1회 사이징
        sizer = null;
      }
    });
    sec.appendChild(header);
    sec.appendChild(body);
    container.appendChild(sec);
  }
}

export function initSubjectObjects() {
  const select = document.getElementById("subject-select");
  const parts = document.getElementById("subject-parts");
  if (!select || !parts) return;

  const apply = (code) => {
    const c = SUBJECTS[code] ? code : "p";
    document.documentElement.setAttribute("data-subject", c);
    select.value = c;
    buildParts(parts, c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch (_) { /* ignore */ }
    // 다른 모듈(퍼스널 오브젝트 등)이 과목 전환에 반응할 수 있게 알림
    window.dispatchEvent(new CustomEvent("5e:subject-changed", { detail: { subject: c } }));
  };

  let initial = "p";
  try { initial = localStorage.getItem(STORAGE_KEY) || "p"; } catch (_) { /* ignore */ }
  apply(initial);

  select.addEventListener("change", () => apply(select.value));
}
