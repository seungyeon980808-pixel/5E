/* ===== 과목별 오브젝트 라이브러리 (과목 선택 + 파트별 아코디언) =====
 *
 * 왼쪽 패널의 '과목별 오브젝트' 섹션을 채운다.
 *   · 과목 선택(물리/화학/생명/지구) → :root[data-subject]=코드 로 강조색 테마 전환
 *     (실제 색은 css/style.css의 :root[data-subject="..."] 규칙이 담당)
 *   · 과목의 파트별로 '빈' 아코디언을 만든다(오브젝트 기능은 구현 예정).
 *   · 모든 파트 아코디언은 기본 접힘.
 * 공통 도구(#tool-list 상단, #symbol-sections)는 과목과 무관하게 항상 표시된다.
 */

const SUBJECTS = {
  p: { label: "물리", parts: ["역학", "전자기학", "광학", "현대물리학"] },
  c: { label: "화학", parts: ["화학의 첫걸음", "원자의 세계", "화학 결합과 분자", "역동적인 화학 반응"] },
  b: { label: "생명과학", parts: ["생명과학의 이해", "사람의 물질대사", "항상성과 몸의 조절", "유전", "생태계와 상호작용"] },
  e: { label: "지구과학", parts: ["고체 지구", "유체 지구", "우주"] },
};

const STORAGE_KEY = "5e.subject";

function buildParts(container, code) {
  container.innerHTML = "";
  const parts = (SUBJECTS[code] || SUBJECTS.p).parts;
  for (const name of parts) {
    const sec = document.createElement("div");
    sec.className = "subject-part is-collapsed"; // 기본 접힘
    const header = document.createElement("button");
    header.type = "button";
    header.className = "subject-part-header";
    header.innerHTML = `<span>${name}</span><span class="toggle-icon">▾</span>`;
    const body = document.createElement("div");
    body.className = "subject-part-body";
    body.innerHTML = `<p class="subject-part-empty">준비 중입니다.</p>`;
    header.addEventListener("click", () => sec.classList.toggle("is-collapsed"));
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
  };

  let initial = "p";
  try { initial = localStorage.getItem(STORAGE_KEY) || "p"; } catch (_) { /* ignore */ }
  apply(initial);

  select.addEventListener("change", () => apply(select.value));
}
