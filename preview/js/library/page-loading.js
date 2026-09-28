export function targetPageGeometry(result) {
  return result?.getPageGeometry?.(result.provenance?.pageNumber || 1)
    || result?.preview?.pageGeometry || null;
}

export function fittedPageSize(geometry, width, zoom = 1) {
  return { width: width * zoom, height: width * zoom * geometry.height / geometry.width };
}

export function createPreviewPaper(result) {
  const paper = document.createElement("div");
  paper.className = "unilib-preview-paper";
  paper.setAttribute("aria-hidden", "true");
  const geometry = targetPageGeometry(result);
  if (geometry) {
    const rect = result.provenance?.rect || [0, 0, 1, 1];
    paper.style.aspectRatio = `${geometry.width * rect[2]} / ${geometry.height * rect[3]}`;
  }
  return paper;
}
