/* ===== ASSET LIBRARY (에셋 라이브러리: 과목별 투명 PNG 에셋 검색·삽입) [개발용] =====
 *
 * 정적 파일: assets/asset-library/manifest.json + 과목 폴더의 PNG. 서버·API 없음.
 * 기존 이미지 라이브러리(parts-library, SVG)와는 파일·코드를 공유하지 않는다.
 *
 * · 과목 탭은 좌측 '오브젝트' 과목 전환을 따라가고, 탭을 눌러 따로 볼 수도 있다.
 * · 검색은 이름·분류·검색어에 모든 낱말이 들어 있어야 맞는다(AND).
 * · 클릭 한 번 = 뷰 중앙에 이미지 객체 1개(Undo 1스텝). 파일을 dataURL로 넣어
 *   저장 파일이 라이브러리 폴더 없이도 열린다.
 * · manifest는 섹션을 처음 펼칠 때 1회만 불러온다(앱 시작 비용 0). */

import { insertImageFromSrc } from "./image-paste.js?v=1.7.0-preview-0930";
import { showAlert } from "./ui-dialogs.js?v=1.7.0-preview-0930";

const LIB_BASE = "assets/asset-library/";
const SUBJECTS = [["p", "물리"], ["c", "화학"], ["b", "생명"], ["e", "지구"]];
const DEFAULT_MM = 30;

let manifest = null;
let loading = null;

async function fetchJson(path) {
  const res = await fetch(LIB_BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " (" + path + ")");
  return res.json();
}

// manifest.json은 과목 묶음 파일 목록(parts)만 가진다. 과목 브랜치가 서로 다른 파일을 고치게 하려는 것.
function loadManifest() {
  loading ??= fetchJson("manifest.json")
    .then(async (data) => {
      if (!data || !Array.isArray(data.parts)) throw new Error("manifest.parts가 없습니다.");
      const parts = await Promise.all(data.parts.map(fetchJson));
      data.items = parts.flatMap((part) => (Array.isArray(part?.items) ? part.items : []));
      for (const item of data.items) {
        item._hay = [item.name, item.category, ...(item.keywords || [])].join(" ").toLowerCase();
        item._hayNs = item._hay.replace(/\s+/g, "");
      }
      manifest = data;
      return data;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

function search(subject, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return manifest.items.filter((item) => item.subject === subject
    && tokens.every((t) => item._hay.includes(t) || item._hayNs.includes(t)));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function insertItem(state, item) {
  const res = await fetch(LIB_BASE + item.file, { cache: "force-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const src = await blobToDataUrl(await res.blob());
  const vb = state.get().viewBox;
  const center = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
  const id = await insertImageFromSrc(state, src, {
    at: center,
    preserveBytes: true,
    sourceMetadata: {
      provider: "asset-library", itemId: item.id, title: item.name, fileName: item.file,
      sourceKind: "ai-generated", locator: item.referenceExam || "",
    },
  });
  const [w, h] = Array.isArray(item.defaultMm) ? item.defaultMm : [DEFAULT_MM, DEFAULT_MM];
  // 삽입 직전 스냅샷이 이미 undo에 들어가 있어 크기 보정은 같은 Undo 1스텝에 포함된다.
  state.update((s) => {
    const obj = s.objects.find((o) => o.id === id);
    if (!obj) return;
    Object.assign(obj, { name: item.name, x: center.x - w / 2, y: center.y - h / 2, w, h });
  });
}

export function initAssetLibrary(state) {
  const section = document.getElementById("asset-library-section");
  const tabs = document.getElementById("asset-library-tabs");
  const input = document.getElementById("asset-library-query");
  const status = document.getElementById("asset-library-status");
  const grid = document.getElementById("asset-library-grid");
  if (!section || !tabs || !input || !status || !grid) return;

  let subject = document.documentElement.getAttribute("data-subject") || "p";
  let busy = false;

  for (const [code, label] of SUBJECTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.dataset.subject = code;
    button.textContent = label;
    button.addEventListener("click", () => { subject = code; render(); });
    tabs.appendChild(button);
  }

  function render() {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.subject === subject)));
    grid.innerHTML = "";
    if (!manifest) return;
    const found = search(subject, input.value);
    const inSubject = manifest.items.some((item) => item.subject === subject);
    status.textContent = !inSubject ? "이 과목은 아직 에셋이 없습니다."
      : found.length ? "에셋 " + found.length + "개 · 클릭하면 넣습니다" : "검색 결과가 없습니다.";
    for (const item of found) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "asset-card";
      card.title = item.name + " (" + item.category + ")\n참고: " + (item.referenceExam || "-") + "\nAI 생성 이미지 · 기출 원본 아님";
      const thumb = document.createElement("img");
      thumb.loading = "lazy";
      thumb.alt = "";
      thumb.src = LIB_BASE + (item.thumb || item.file);
      const name = document.createElement("span");
      name.className = "asset-card-name";
      name.textContent = item.name;
      card.append(thumb, name);
      if (item.qa && item.qa !== "통과") {
        const badge = document.createElement("span");
        badge.className = "asset-card-badge";
        badge.textContent = item.qa;
        badge.title = item.qaNote || "";
        card.appendChild(badge);
      }
      card.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        card.setAttribute("aria-busy", "true");
        try {
          await insertItem(state, item);
        } catch (error) {
          void showAlert("에셋을 넣지 못했습니다. (" + (error && error.message ? error.message : error) + ")", { title: "에셋 라이브러리" });
        } finally {
          busy = false;
          card.removeAttribute("aria-busy");
        }
      });
      grid.appendChild(card);
    }
  }

  async function ensureLoaded() {
    if (manifest) { render(); return; }
    status.textContent = "에셋 목록을 불러오는 중…";
    try {
      await loadManifest();
      render();
    } catch (error) {
      status.textContent = "에셋 목록을 불러오지 못했습니다. (" + (error && error.message ? error.message : error) + ")";
    }
  }

  input.addEventListener("input", render);
  window.addEventListener("5e:subject-changed", (event) => {
    subject = event.detail?.subject || subject;
    if (manifest) render();
  });
  section.querySelector(".tool-section-header")?.addEventListener("click", () => void ensureLoaded());
  render();
  if (!section.classList.contains("is-collapsed")) void ensureLoaded();
}
