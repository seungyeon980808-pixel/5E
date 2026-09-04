import { createPdfCandidateReview } from "./pdf-candidate-workflow.mjs";

export function createPdfCandidateGallery({
  root,
  scanPdf,
  loadPreview,
  onAddCandidates,
  onStatus,
} = {}) {
  const workspace = root.querySelector("[data-ai-pdf-candidates]");
  const select = workspace.querySelector("[data-ai-pdf-candidate-source]");
  const scanButton = workspace.querySelector("[data-ai-pdf-candidate-scan]");
  const addButton = workspace.querySelector("[data-ai-pdf-candidate-add]");
  const mergeButton = workspace.querySelector("[data-ai-pdf-candidate-merge]");
  const status = workspace.querySelector("[data-ai-pdf-candidate-status]");
  const grid = workspace.querySelector("[data-ai-pdf-candidate-grid]");
  let sources = [];
  let sourceKey = "";
  let manifest = null;
  let review = null;
  let scanEpoch = 0;

  function selectedSource() {
    return sources.find((source) => source.id === select.value) || sources[0] || null;
  }

  function syncActions() {
    const included = review?.included() || [];
    addButton.disabled = included.length === 0;
    addButton.textContent = included.length ? `선택 도판 ${included.length}개 추가` : "선택 도판 추가";
    mergeButton.disabled = (review?.mergeSelectionCount() || 0) < 2;
  }

  function renderCandidate(candidate) {
    const card = document.createElement("article");
    card.className = "ai-pdf-candidate-card";
    card.dataset.candidateId = candidate.id;
    card.classList.toggle("is-excluded", !candidate.included);
    const preview = document.createElement("img");
    preview.alt = `${candidate.pageNumber}쪽 ${candidate.candidateIndex}번 도판 후보`;
    preview.loading = "lazy";
    void loadPreview(candidate).then((data) => {
      if (preview.isConnected) preview.src = data;
    }).catch((error) => {
      if (preview.isConnected) preview.alt = `미리보기 실패: ${error.message || error}`;
    });
    const meta = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = `${candidate.pageNumber}쪽 · 후보 ${candidate.candidateIndex}`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(candidate.included));
    toggle.textContent = candidate.included ? "포함" : "제외";
    toggle.onclick = () => {
      review.toggleIncluded(candidate.id);
      render();
    };
    const merge = document.createElement("button");
    merge.type = "button";
    merge.className = "ai-pdf-candidate-select";
    merge.setAttribute("aria-pressed", String(review.isMergeSelected(candidate.id)));
    merge.textContent = review.isMergeSelected(candidate.id) ? "병합 선택됨" : "병합 선택";
    merge.onclick = () => {
      review.toggleMergeSelection(candidate.id);
      render();
    };
    const splitVertical = document.createElement("button");
    splitVertical.type = "button";
    splitVertical.textContent = "좌우 분리";
    splitVertical.onclick = () => {
      review.split(candidate.id, "vertical");
      render();
    };
    const splitHorizontal = document.createElement("button");
    splitHorizontal.type = "button";
    splitHorizontal.textContent = "상하 분리";
    splitHorizontal.onclick = () => {
      review.split(candidate.id, "horizontal");
      render();
    };
    meta.append(label, toggle, merge, splitVertical, splitHorizontal);
    card.append(preview, meta);
    grid.appendChild(card);
  }

  function render() {
    workspace.hidden = sources.length === 0;
    grid.replaceChildren();
    if (!manifest) {
      const empty = document.createElement("p");
      empty.className = "ai-pdf-candidate-empty";
      empty.textContent = sources.length
        ? "PDF 전체 도판 찾기를 실행하면 모든 페이지의 후보가 여기에 표시됩니다."
        : "연결된 PDF가 없습니다.";
      grid.appendChild(empty);
    } else if (!review.candidates().length) {
      const empty = document.createElement("p");
      empty.className = "ai-pdf-candidate-empty";
      empty.textContent = "자동 탐지된 도판 후보가 없습니다. PDF 원문 검색에서 영역을 직접 지정할 수 있습니다.";
      grid.appendChild(empty);
    } else {
      review.candidates().forEach(renderCandidate);
    }
    syncActions();
  }

  async function scan() {
    const source = selectedSource();
    if (!source) return;
    const current = ++scanEpoch;
    scanButton.disabled = true;
    select.disabled = true;
    status.textContent = "전체 페이지 분석 준비 중…";
    status.setAttribute("aria-busy", "true");
    try {
      const next = await scanPdf(source, (progress) => {
        if (current !== scanEpoch) return;
        status.textContent = `${progress.completedPages}/${progress.pageCount}쪽 · 후보 ${progress.candidateCount}개`;
      });
      if (current !== scanEpoch) return;
      manifest = next;
      review = createPdfCandidateReview(next);
      status.textContent = `${next.pages.length}쪽 분석 완료 · 후보 ${next.candidates.length}개`;
      render();
    } catch (error) {
      if (current !== scanEpoch) return;
      status.textContent = `도판 후보를 찾지 못했습니다: ${error.message || error}`;
      onStatus?.(status.textContent, "error");
    } finally {
      if (current === scanEpoch) {
        scanButton.disabled = false;
        select.disabled = false;
        status.setAttribute("aria-busy", "false");
      }
    }
  }

  scanButton.onclick = () => void scan();
  select.onchange = () => {
    manifest = null;
    review = null;
    status.textContent = "";
    render();
  };
  addButton.onclick = () => {
    const included = review?.included() || [];
    if (included.length) void onAddCandidates(included, manifest);
  };
  mergeButton.onclick = () => {
    try {
      review?.mergeSelected();
      render();
    } catch (error) {
      onStatus?.(error.message || String(error), "warn");
    }
  };

  return {
    clear() {
      scanEpoch += 1;
      sources = [];
      manifest = null;
      review = null;
      select.replaceChildren();
      render();
    },
    setSources(nextSources, { autoScan = false } = {}) {
      const next = [...(nextSources || [])];
      const nextKey = next.map((source) => source.id).join("|");
      if (nextKey === sourceKey) return;
      scanEpoch += 1;
      sources = next;
      sourceKey = nextKey;
      manifest = null;
      review = null;
      select.replaceChildren();
      sources.forEach((source) => {
        const option = document.createElement("option");
        option.value = source.id;
        option.textContent = source.relativePath || source.name;
        select.appendChild(option);
      });
      render();
      if (autoScan && sources.length === 1) void scan();
    },
    render,
    scan,
  };
}
