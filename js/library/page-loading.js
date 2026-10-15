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

export function createLoadingDots() {
  const dots = document.createElement('span');
  dots.className = 'unilib-loading-dots'; dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) dots.append(document.createElement('i'));
  return dots;
}

export function createPreviewLoading(message = '미리보기를 불러오는 중…') {
  const status = document.createElement('div');
  status.className = 'unilib-preview-loading'; status.setAttribute('role', 'status');
  const caption = document.createElement('span'); caption.textContent = message;
  status.append(createLoadingDots(), caption);
  return status;
}
