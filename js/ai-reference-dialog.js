function legacySourceNavigation(enabled) {
  if (!enabled) return "";
  return `<nav aria-label="개발용 참고 자료 위치"><button type="button" data-ai-search-source="parts">일러스트 이미지</button><button type="button" data-ai-search-source="exam">기출문제</button><button type="button" data-ai-search-source="local">내 PDF·이미지</button></nav>`;
}

export function createReferenceDialog({ legacyLibraryUiEnabled = false } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "ai-compare-overlay ai-reference-search-overlay";
  overlay.innerHTML = `<section class="ai-reference-search-dialog" role="dialog" aria-modal="true" aria-label="내 PDF·이미지">
    <header><strong>내 PDF·이미지</strong><button type="button" data-ai-search-close aria-label="닫기">×</button></header>
    ${legacySourceNavigation(legacyLibraryUiEnabled)}
    <div class="ai-reference-search-query"><span aria-hidden="true">⌕</span><input type="search" placeholder="이미지 이름 또는 PDF 원문 검색어" aria-label="이미지 이름 또는 PDF 원문 검색어"></div>
    <div class="ai-local-folder" data-ai-local-folder hidden><span></span><button type="button" data-ai-local-pick>내 PDF·이미지 폴더 선택</button><input data-ai-web-folder type="file" accept="image/*,.pdf" webkitdirectory multiple hidden></div>
    <div class="ai-reference-search-summary" data-ai-search-summary></div>
    <div class="ai-reference-search-body">
      <div class="ai-reference-search-grid" data-ai-search-grid></div>
      <section class="ai-pdf-workspace" data-ai-pdf-workspace hidden>
        <div class="ai-pdf-page-viewer"><header><strong data-ai-pdf-page-title>검색 결과를 선택하세요</strong><div>
          <span class="ai-pdf-crop-dimensions" data-ai-pdf-crop-dimensions role="status" aria-live="polite"></span>
          <button type="button" data-ai-pdf-suggest-question disabled>문항 전체 제안</button>
          <button type="button" data-ai-pdf-suggest-figure disabled>도판 영역 제안</button>
          <button type="button" data-ai-pdf-crop-toggle aria-pressed="false" disabled>선택 영역 지정</button>
          <button type="button" data-ai-pdf-add-whole disabled>PDF 페이지 추가</button>
          <button type="button" data-ai-pdf-add-crop hidden disabled>선택 영역을 시험문제용 도판으로 변환</button>
        </div></header><div class="ai-pdf-page-stage">
          <p data-ai-pdf-page-empty>오른쪽 검색 결과를 선택하면 PDF 페이지를 크게 볼 수 있습니다.</p>
          <div class="ai-pdf-page-wrap" data-ai-pdf-page-wrap hidden><img alt="선택한 PDF 페이지" draggable="false"><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-selection" data-ai-pdf-crop-selection tabindex="0" role="group" aria-label="선택 영역. 방향키로 이동하고 Shift와 방향키로 크기를 조절합니다"></i></div>
        </div><aside class="ai-pdf-crop-preview" data-ai-pdf-crop-preview hidden><span>선택 영역 확대 미리보기</span><canvas aria-label="선택 영역 확대 미리보기"></canvas></aside></div>
        <aside class="ai-pdf-result-pane"><header><strong data-ai-pdf-result-title>PDF 원문 검색 결과</strong></header><div data-ai-pdf-result-list></div></aside>
      </section>
    </div>
    <footer><span data-ai-search-footnote>선택한 이미지만 참고 자료로 추가됩니다.</span><button type="button" data-ai-search-add disabled hidden>참고 자료로 추가</button></footer>
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
    if (message) {
      summary.textContent = message;
      const notice = grid.ownerDocument.createElement("p");
      notice.className = "ai-reference-search-empty";
      notice.dataset.aiSearchState = state;
      notice.setAttribute("aria-hidden", "true");
      notice.textContent = message;
      grid.replaceChildren(notice);
    }
  };
  return {
    loading: () => update("loading", "이미지 검색 목록을 불러오는 중…"),
    ready: () => update("ready"),
    error: (error) => update("error", error?.message || String(error)),
  };
}

export function createReferenceAddControl(root) {
  const button = root.querySelector("[data-ai-search-add]");
  const summary = root.querySelector("[data-ai-search-summary]");
  let selectedCount = 0;
  let state = "ready";
  const sync = () => { button.disabled = state !== "ready" || selectedCount === 0; };
  const setState = (nextState) => { state = nextState; sync(); };
  sync();
  return {
    selection: (count) => { selectedCount = count; sync(); },
    loading: () => setState("loading"),
    ready: () => setState("ready"),
    error: () => setState("error"),
    warning: (message) => {
      summary.hidden = false;
      summary.dataset.aiSearchState = "warning";
      summary.setAttribute("role", "status");
      summary.setAttribute("aria-live", "polite");
      summary.setAttribute("aria-atomic", "true");
      summary.textContent = message;
    },
  };
}
