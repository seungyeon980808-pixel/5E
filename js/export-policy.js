export const MIN_EXPORT_DPI = 72;
export const MAX_EXPORT_DPI = 600;
export const MAX_EXPORT_EDGE_PX = 16384;
export const MAX_EXPORT_PIXELS = 64_000_000;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizeExportBaseName(value, fallback = "5E-export") {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!cleaned || WINDOWS_RESERVED_NAME.test(cleaned)) return fallback;
  return cleaned.slice(0, 120);
}

export function defaultExportBaseName(state, timestampFallback) {
  const page = (state.pages || []).find((item) => item.id === state.activePageId);
  return sanitizeExportBaseName(page?.name, timestampFallback);
}

export function rasterDimensions(widthMm, heightMm, dpi) {
  const numericDpi = Number(dpi);
  const numericWidth = Number(widthMm);
  const numericHeight = Number(heightMm);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) {
    throw new RangeError("내보낼 영역의 크기가 올바르지 않습니다.");
  }
  if (!Number.isFinite(numericDpi) || numericDpi < MIN_EXPORT_DPI || numericDpi > MAX_EXPORT_DPI) {
    throw new RangeError(`해상도는 ${MIN_EXPORT_DPI}~${MAX_EXPORT_DPI} DPI여야 합니다.`);
  }
  const width = Math.max(1, Math.round(numericWidth / 25.4 * numericDpi));
  const height = Math.max(1, Math.round(numericHeight / 25.4 * numericDpi));
  if (width > MAX_EXPORT_EDGE_PX || height > MAX_EXPORT_EDGE_PX || width * height > MAX_EXPORT_PIXELS) {
    throw new RangeError(`내보내기 크기 ${width}×${height}px가 안전 한도를 넘습니다. DPI를 낮춰 주세요.`);
  }
  return { width, height, dpi: numericDpi };
}
