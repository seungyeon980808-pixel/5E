const SOURCES = Object.freeze({ PARTS: "parts", EXAM: "exam", LOCAL: "local" });
const MAX_RESULTS = 60;
const MAX_SELECT = 10;

function textOf(item) {
  return [item.title, item.name, item.relativePath, item.subjectLabel, item.part, item.exam,
    ...(item.tags || []), ...(item.parts || []), ...(item.keywords || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase("ko");
}

function remoteUrl(source, item) {
  const base = source === SOURCES.EXAM ? "assets/exam-library/images/" : "assets/parts-library/svg/";
  return `${base}${encodeURIComponent(item.file)}`;
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`이미지를 불러오지 못했습니다. (HTTP ${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

export function createAiReferenceSearch({ desktop, onAdd, onStatus } = {}) {
  let overlay = null;
  let source = SOURCES.PARTS;
  let query = "";
  let parts = [];
  let exams = [];
  let locals = [];
  let localFolder = "";
  let loaded = false;
  const selected = new Map();

  const status = (text, kind = "ok") => onStatus?.(text, kind);
  const keyOf = (item) => `${source}:${item.id || item.path || item.file}`;

  async function ensureRemoteData() {
    if (loaded) return;
    const [partResponse, examResponse] = await Promise.all([
      fetch("assets/parts-library/manifest.json", { cache: "no-store" }),
      fetch("assets/exam-library/manifest.json", { cache: "no-store" }),
    ]);
    if (!partResponse.ok || !examResponse.ok) throw new Error("이미지 검색 목록을 불러오지 못했습니다.");
    const [partManifest, examManifest] = await Promise.all([partResponse.json(), examResponse.json()]);
    parts = Array.isArray(partManifest.items) ? partManifest.items : [];
    exams = Array.isArray(examManifest.items) ? examManifest.items : [];
    loaded = true;
  }

  function currentItems() {
    const list = source === SOURCES.EXAM ? exams : source === SOURCES.LOCAL ? locals : parts;
    const needle = query.trim().toLocaleLowerCase("ko");
    return (needle ? list.filter((item) => textOf(item).includes(needle)) : list).slice(0, MAX_RESULTS);
  }

  function close() {
    overlay?.remove();
    overlay = null;
  }

  async function loadLocalFolder(folder) {
    if (!desktop?.listLocalImages || !folder) return;
    const result = await desktop.listLocalImages(folder);
    localFolder = result.folder || folder;
    locals = Array.isArray(result.items) ? result.items : [];
  }

  function render() {
    if (!overlay) return;
    const grid = overlay.querySelector("[data-ai-search-grid]");
    const summary = overlay.querySelector("[data-ai-search-summary]");
    const folderBar = overlay.querySelector("[data-ai-local-folder]");
    folderBar.hidden = source !== SOURCES.LOCAL;
    folderBar.querySelector("span").textContent = localFolder || "연결된 로컬 폴더가 없습니다.";
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      const active = button.dataset.aiSearchSource === source;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const items = currentItems();
    const total = source === SOURCES.EXAM ? exams.length : source === SOURCES.LOCAL ? locals.length : parts.length;
    summary.textContent = `${query.trim() ? `검색 결과 ${items.length}개` : `전체 ${total}개`} · 최대 ${MAX_SELECT}개 선택`;
    grid.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "ai-reference-search-empty";
      empty.textContent = source === SOURCES.LOCAL && !localFolder
        ? "폴더 연결을 눌러 이미지가 있는 로컬 폴더를 선택하세요."
        : "검색 결과가 없습니다.";
      grid.appendChild(empty);
      return;
    }
    for (const item of items) {
      const key = keyOf(item);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ai-reference-search-card";
      card.classList.toggle("is-on", selected.has(key));
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      if (source === SOURCES.LOCAL) {
        image.dataset.localPath = item.path;
        void desktop?.localImageThumbnail?.(item.path).then((data) => {
          if (image.isConnected) image.src = data;
        }).catch(() => {});
      } else image.src = remoteUrl(source, item);
      const title = document.createElement("strong");
      title.textContent = item.title || item.name || item.file;
      const meta = document.createElement("span");
      meta.textContent = source === SOURCES.LOCAL
        ? item.relativePath
        : [item.subjectLabel, item.part || item.exam, item.year].filter(Boolean).join(" · ");
      card.append(image, title, meta);
      card.onclick = () => {
        if (selected.has(key)) selected.delete(key);
        else if (selected.size < MAX_SELECT) selected.set(key, { source, item });
        else status(`참고 이미지는 한 번에 최대 ${MAX_SELECT}개까지 선택할 수 있습니다.`, "warn");
        render();
      };
      grid.appendChild(card);
    }
  }

  async function addSelected() {
    const records = Array.from(selected.values());
    if (!records.length) return status("추가할 이미지를 선택하세요.", "warn");
    const addButton = overlay.querySelector("[data-ai-search-add]");
    addButton.disabled = true;
    addButton.textContent = "불러오는 중…";
    try {
      const references = await Promise.all(records.map(async ({ source: recordSource, item }) => ({
        name: item.title || item.name || item.file,
        data: recordSource === SOURCES.LOCAL
          ? await desktop.readLocalImage(item.path)
          : await urlToDataUrl(remoteUrl(recordSource, item)),
        sourceKind: recordSource === SOURCES.LOCAL ? "local-folder" : recordSource,
      })));
      references.forEach((reference) => onAdd?.(reference));
      status(`참고 이미지 ${references.length}개가 추가되었습니다.`, "ok");
      close();
    } catch (error) {
      status(error.message || String(error), "error");
      addButton.disabled = false;
      addButton.textContent = "AI 참고로 추가";
    }
  }

  async function open() {
    close();
    selected.clear();
    query = "";
    overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay ai-reference-search-overlay";
    overlay.innerHTML = `<section class="ai-reference-search-dialog" role="dialog" aria-modal="true" aria-label="이미지 검색">
      <header><strong>이미지 검색</strong><button type="button" data-ai-search-close aria-label="닫기">×</button></header>
      <nav aria-label="검색 위치">
        <button type="button" data-ai-search-source="parts">온라인 이미지</button>
        <button type="button" data-ai-search-source="exam">기출문제</button>
        <button type="button" data-ai-search-source="local">로컬 폴더</button>
      </nav>
      <div class="ai-reference-search-query"><span aria-hidden="true">⌕</span><input type="search" placeholder="이미지 검색어를 입력하세요" aria-label="이미지 검색어"></div>
      <div class="ai-local-folder" data-ai-local-folder hidden><span></span><button type="button" data-ai-local-pick>폴더 연결</button><button type="button" data-ai-local-refresh>새로고침</button></div>
      <div class="ai-reference-search-summary" data-ai-search-summary></div>
      <div class="ai-reference-search-grid" data-ai-search-grid></div>
      <footer><span>로컬 폴더 이미지는 원본을 복사하지 않고 AI 참고로만 불러옵니다.</span><button type="button" data-ai-search-add>AI 참고로 추가</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-ai-search-close]").onclick = close;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      button.onclick = () => { source = button.dataset.aiSearchSource; render(); };
    });
    const input = overlay.querySelector("input[type=search]");
    input.oninput = () => { query = input.value; render(); };
    overlay.querySelector("[data-ai-local-pick]").onclick = async () => {
      try {
        const result = await desktop?.pickLocalImageFolder?.();
        if (result?.folder) { await loadLocalFolder(result.folder); render(); }
      } catch (error) { status(error.message || String(error), "error"); }
    };
    overlay.querySelector("[data-ai-local-refresh]").onclick = async () => {
      try { await loadLocalFolder(localFolder); render(); }
      catch (error) { status(error.message || String(error), "error"); }
    };
    overlay.querySelector("[data-ai-search-add]").onclick = () => { void addSelected(); };
    try { await ensureRemoteData(); }
    catch (error) { status(error.message || String(error), "error"); }
    render();
    input.focus();
  }

  return { open, close };
}
