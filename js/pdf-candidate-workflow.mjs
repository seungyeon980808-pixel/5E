import { suggestDiagramCandidates } from "./pdf-region-suggestions.mjs";

export const PDF_CANDIDATE_MANIFEST_VERSION = 1;

function candidateId(sourceId, pageNumber, candidateIndex) {
  return `${sourceId}:p${pageNumber}:c${candidateIndex}`;
}

export function buildCandidateFilename(source, pageNumber, candidateIndex) {
  const rawName = String(source?.name || source?.relativePath || "pdf");
  const stem = rawName.replace(/\.[^.]+$/, "");
  let safe = stem
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/[\s-]+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 96) || "pdf";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = `_${safe}`;
  return `${safe}-p${String(pageNumber).padStart(3, "0")}-c${String(candidateIndex).padStart(2, "0")}.png`;
}

export async function discoverPdfCandidates({ source, pages, loadPageImageData, onProgress } = {}) {
  if (!source || !Array.isArray(pages) || typeof loadPageImageData !== "function") {
    throw new TypeError("source, pages, and loadPageImageData are required");
  }
  const manifestPages = [];
  const candidates = [];
  for (let pageOffset = 0; pageOffset < pages.length; pageOffset += 1) {
    const page = pages[pageOffset];
    const boxes = suggestDiagramCandidates(await loadPageImageData(source, page.pageNumber, page));
    const pageCandidates = boxes.map((box, offset) => {
      const candidateIndex = offset + 1;
      return {
        id: candidateId(source.id, page.pageNumber, candidateIndex),
        sourceId: source.id,
        source,
        pageNumber: page.pageNumber,
        candidateIndex,
        box,
        included: true,
        outputName: buildCandidateFilename(source, page.pageNumber, candidateIndex),
      };
    });
    candidates.push(...pageCandidates);
    manifestPages.push({
      pageNumber: page.pageNumber,
      candidateCount: pageCandidates.length,
      searchable: Boolean(page.searchable),
    });
    onProgress?.({
      pageNumber: page.pageNumber,
      completedPages: pageOffset + 1,
      pageCount: pages.length,
      candidateCount: candidates.length,
    });
  }
  return {
    version: PDF_CANDIDATE_MANIFEST_VERSION,
    sourceId: source.id,
    sourceName: source.name,
    pages: manifestPages,
    candidates,
  };
}

function cloneCandidate(candidate) {
  return { ...candidate, box: { ...candidate.box } };
}

function rounded(value) {
  return Math.round(value * 1000) / 1000;
}

export function createPdfCandidateReview(manifest) {
  let items = (manifest?.candidates || []).map(cloneCandidate);
  const mergeSelection = new Set();

  function candidates() {
    return items.map(cloneCandidate);
  }

  function find(id) {
    const candidate = items.find((item) => item.id === id);
    if (!candidate) throw new Error(`도판 후보를 찾을 수 없습니다: ${id}`);
    return candidate;
  }

  function toggleIncluded(id) {
    const candidate = find(id);
    candidate.included = !candidate.included;
    return cloneCandidate(candidate);
  }

  function split(id, axis = "vertical") {
    const index = items.findIndex((candidate) => candidate.id === id);
    const original = find(id);
    if (!["vertical", "horizontal"].includes(axis)) throw new Error("분리 방향이 올바르지 않습니다.");
    const first = cloneCandidate(original);
    const second = cloneCandidate(original);
    first.id = `${original.id}:${axis}:1`;
    second.id = `${original.id}:${axis}:2`;
    if (axis === "vertical") {
      first.box.w = rounded(original.box.w / 2);
      second.box.x = rounded(original.box.x + first.box.w);
      second.box.w = rounded(original.box.w - first.box.w);
    } else {
      first.box.h = rounded(original.box.h / 2);
      second.box.y = rounded(original.box.y + first.box.h);
      second.box.h = rounded(original.box.h - first.box.h);
    }
    mergeSelection.delete(original.id);
    items.splice(index, 1, first, second);
    return [cloneCandidate(first), cloneCandidate(second)];
  }

  function toggleMergeSelection(id) {
    find(id);
    if (mergeSelection.delete(id)) return false;
    mergeSelection.add(id);
    return true;
  }

  function mergeSelected() {
    const selected = items.filter((candidate) => mergeSelection.has(candidate.id));
    if (selected.length < 2) throw new Error("병합할 도판 후보를 두 개 이상 선택하세요.");
    const sourceId = selected[0].sourceId;
    const pageNumber = selected[0].pageNumber;
    if (selected.some((candidate) => candidate.sourceId !== sourceId || candidate.pageNumber !== pageNumber)) {
      throw new Error("같은 PDF 페이지의 도판 후보만 병합할 수 있습니다.");
    }
    const left = Math.min(...selected.map((candidate) => candidate.box.x));
    const top = Math.min(...selected.map((candidate) => candidate.box.y));
    const right = Math.max(...selected.map((candidate) => candidate.box.x + candidate.box.w));
    const bottom = Math.max(...selected.map((candidate) => candidate.box.y + candidate.box.h));
    const firstIndex = Math.min(...selected.map((candidate) => items.indexOf(candidate)));
    const merged = {
      ...selected[0],
      id: `${sourceId}:p${pageNumber}:merge:${selected.map((candidate) => candidate.id).sort().join("+")}`,
      box: {
        x: rounded(left),
        y: rounded(top),
        w: rounded(right - left),
        h: rounded(bottom - top),
      },
      included: selected.some((candidate) => candidate.included),
    };
    items = items.filter((candidate) => !mergeSelection.has(candidate.id));
    items.splice(firstIndex, 0, merged);
    mergeSelection.clear();
    return cloneCandidate(merged);
  }

  function snapshot() {
    return {
      ...manifest,
      version: PDF_CANDIDATE_MANIFEST_VERSION,
      pages: (manifest?.pages || []).map((page) => ({ ...page })),
      candidates: candidates(),
    };
  }

  return {
    candidates,
    included: () => candidates().filter((candidate) => candidate.included),
    isMergeSelected: (id) => mergeSelection.has(id),
    mergeSelectionCount: () => mergeSelection.size,
    mergeSelected,
    snapshot,
    split,
    toggleIncluded,
    toggleMergeSelection,
  };
}
