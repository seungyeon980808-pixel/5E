export function createReferenceDialog() {
  const overlay = document.createElement("div");
  overlay.className = "ai-compare-overlay ai-reference-search-overlay";
  overlay.innerHTML = `<section class="ai-reference-search-dialog" role="dialog" aria-modal="true" aria-label="이미지와 PDF 검색">
    <header><strong>이미지·PDF 검색</strong><button type="button" data-ai-search-close aria-label="닫기">×</button></header>
    <nav aria-label="검색 위치"><button type="button" data-ai-search-source="parts">일러스트 이미지</button><button type="button" data-ai-search-source="exam">기출문제</button><button type="button" data-ai-search-source="local">로컬 폴더</button></nav>
    <div class="ai-reference-search-query"><span aria-hidden="true">⌕</span><input type="search" placeholder="이미지 또는 PDF 본문 검색어" aria-label="이미지 또는 PDF 본문 검색어"></div>
    <div class="ai-local-folder" data-ai-local-folder hidden><span></span><button type="button" data-ai-local-pick>이미지·PDF 폴더 선택</button><input data-ai-web-folder type="file" accept="image/*,.pdf" webkitdirectory multiple hidden></div>
    <div class="ai-reference-search-summary" data-ai-search-summary></div>
    <div class="ai-reference-search-body">
      <div class="ai-reference-search-grid" data-ai-search-grid></div>
      <section class="ai-pdf-workspace" data-ai-pdf-workspace hidden>
        <div class="ai-pdf-page-viewer"><header><strong data-ai-pdf-page-title>검색 결과를 선택하세요</strong><div>
          <button type="button" data-ai-pdf-crop-toggle aria-pressed="false" disabled>영역 크롭</button>
          <button type="button" data-ai-pdf-add-whole disabled>전체 페이지 추가</button>
          <button type="button" data-ai-pdf-add-crop hidden disabled>선택 영역을 AI로 편집</button>
        </div></header><div class="ai-pdf-page-stage">
          <p data-ai-pdf-page-empty>오른쪽 검색 결과를 선택하면 교과서 페이지를 크게 볼 수 있습니다.</p>
          <div class="ai-pdf-page-wrap" data-ai-pdf-page-wrap hidden><img alt="선택한 교과서 PDF 페이지" draggable="false"><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-selection"></i></div>
        </div></div>
        <aside class="ai-pdf-result-pane"><header><strong data-ai-pdf-result-title>PDF 본문 검색 결과</strong></header><div data-ai-pdf-result-list></div></aside>
      </section>
    </div>
    <footer><span data-ai-search-footnote>선택한 이미지만 AI 참고 이미지로 추가됩니다.</span><button type="button" data-ai-search-add>AI 참고로 추가</button></footer>
  </section>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

export function createReferenceLoadStatus(root) {
  const summary = root.querySelector("[data-ai-search-summary]");
  const grid = root.querySelector("[data-ai-search-grid]");
  const update = (state, message = "") => {
    const busy = state === "loading";
    summary.hidden = false;
    summary.dataset.aiSearchState = state;
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
    summary.setAttribute("aria-atomic", "true");
    summary.setAttribute("aria-busy", String(busy));
    grid.setAttribute("aria-busy", String(busy));
    if (message) summary.textContent = message;
  };
  return {
    loading: () => update("loading", "이미지 검색 목록을 불러오는 중…"),
    ready: () => update("ready"),
    error: (error) => update("error", error?.message || String(error)),
  };
}
