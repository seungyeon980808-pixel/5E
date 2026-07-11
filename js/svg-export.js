/* ===== IMAGE EXPORT (artboard region only; SVG vector + PNG raster) ===== */
//
// Exports the drawing sized to the artboard's physical dimensions (width/height
// in mm), so it imports at true size into word processors. 1 world unit = 1 mm.
//
// What is exported: ONLY the committed drawing objects (state.objects),
// rendered through render.js's per-object node builders ??no duplicated
// shape-drawing code. What is NOT exported: selection/rotation handles,
// marquee, grid, guides, any UI chrome.
//
// The viewBox is exactly the artboard region, so anything outside the page is
// cropped; a clipPath on the artboard rect guarantees nothing leaks past it.
//
//   - SVG: transparent background (no fill rect emitted), vector, true mm size.
//   - PNG: WHITE background (print/hwp-insertion standard), rasterized at a
//     chosen DPI. pixel size = mm / 25.4 * dpi.
//
// Both formats share buildExportSvg(); the dialog (export-dialog.js) decides
// filename, format, and resolution and calls exportSvg() / exportPng().

import { renderObject, makeFillPattern } from "./render.js?v=0.54.30";

const SVG_NS = "http://www.w3.org/2000/svg";
const MM_PER_INCH = 25.4;

/* ----- PNG pHYs(DPI) 청크 삽입 -----
 * canvas.toBlob은 해상도(pHYs)를 기록하지 않아 뷰어가 96dpi로 오인 → 한글/워드에 약 3배
 * 크기로 삽입된다. IHDR 뒤에 pHYs 청크(픽셀/미터, 단위=1)를 넣어 실제 DPI를 새긴다. */
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function insertPngPhys(buffer, dpi) {
  const src = new Uint8Array(buffer);
  // PNG 시그니처(8) + IHDR(길이4+타입4+데이터13+CRC4 = 25) 뒤(=33)에 삽입.
  const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (src[i] !== PNG_SIG[i]) return buffer; // PNG 아님 → 원본 유지
  const insertAt = 33;
  const ppm = Math.round(dpi / 0.0254); // 인치당 dpi → 미터당 픽셀
  const chunk = new Uint8Array(21); // 길이4 + "pHYs"4 + 데이터9 + CRC4
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);            // 데이터 길이 = 9
  chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73; // "pHYs"
  dv.setUint32(8, ppm);         // ppu X
  dv.setUint32(12, ppm);        // ppu Y
  chunk[16] = 1;                // 단위 = 미터
  dv.setUint32(17, _crc32(chunk.subarray(4, 17))); // CRC(타입+데이터)
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(src.subarray(insertAt), insertAt + chunk.length);
  return out.buffer;
}
// PNG blob에 DPI를 새겨 새 blob으로 반환(실패 시 원본).
async function pngBlobWithDpi(blob, dpi) {
  try {
    const buf = await blob.arrayBuffer();
    return new Blob([insertPngPhys(buf, dpi)], { type: "image/png" });
  } catch (_) { return blob; }
}

/* ----- default export filename: local date/time to the minute (YYYYMMDD_HHmm) -----
 * Shared by the export dialog and the save fallbacks so the timestamp format is
 * defined once. Example: new Date(2026,5,30,21,40) → "20260630_2140". */
export function formatExportTimestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}`;
}
// Full default filename with extension, e.g. getDefaultExportFilename("png").
export function getDefaultExportFilename(ext) {
  const e = String(ext || "").replace(/^\./, "");
  return e ? `${formatExportTimestamp()}.${e}` : formatExportTimestamp();
}

/* ----- webfont embedding for export -----
 * 기본 한글 텍스트는 시스템 고딕 스택(이름 기반)이라 임베딩이 필요 없지만, 수식/물리량
 * 텍스트에 쓰는 웹폰트(Latin Modern Roman 정자·이탤릭, 함초롬바탕)는 SVG-as-image의 격리
 * 문맥에서 문서 웹폰트를 못 써 폴백(Times/serif)으로 렌더돼 글꼴·간격이 어긋났다. 그래서
 * 폰트 파일을 base64로 인라인한 @font-face를 export SVG의 <defs>에 넣어 편집 화면과 같은
 * 글꼴로 내보낸다. 파일이 없으면(선택적 폰트) 조용히 건너뛰어 기존 폴백 동작을 유지한다. */
const EMBED_FONTS = [
  { family: "Latin Modern Roman", style: "normal", url: "fonts/lmroman10-regular.woff2" },
  { family: "Latin Modern Roman", style: "italic", url: "fonts/lmroman10-italic.woff2" },
  { family: "HamchoromBatang",    style: "normal", url: "fonts/HamchoromBatang.woff2" },
];
let _fontCss = "";          // 캐시된 @font-face CSS(base64). 사용 가능한 폰트가 없으면 "".
let _fontCssPromise = null;

async function _fileToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("font fetch failed");
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

// 폰트를 한 번만 받아 base64 @font-face로 캐시한다. export 전에 await하면 임베딩이 보장되고,
// 캐시가 비어 있으면(첫 동기 호출 등) 임베딩 없이 기존처럼 폴백 렌더된다.
export function ensureEmbeddedFonts() {
  if (_fontCssPromise) return _fontCssPromise;
  _fontCssPromise = (async () => {
    const parts = [];
    for (const f of EMBED_FONTS) {
      try {
        const b64 = await _fileToBase64(f.url);
        parts.push(`@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:normal;src:url(data:font/woff2;base64,${b64}) format("woff2");}`);
      } catch (_) { /* 폰트 파일 없음 → 건너뜀(기존 폴백 유지) */ }
    }
    _fontCss = parts.join("\n");
    return _fontCss;
  })();
  return _fontCssPromise;
}
// 모듈 로드 시 미리 받아 두어(비동기) 이후 동기 export 경로도 캐시를 쓸 수 있게 한다.
ensureEmbeddedFonts();

/* ----- a layer's visibility (mirrors render.js: hidden = visible === false) ----- */
function isReferenceImage(obj) {
  return !!obj && obj.type === "image" && (obj.imageSelectionLocked === true || (obj.mode === "background" && obj.locked === true));
}

function isHidden(s, obj, options = {}) {
  // 이미지 비교(image-compare.js): 우측 창은 "그린 것만" 보여야 하므로 모든 이미지 제외.
  // 기본값 off → export 동작은 그대로.
  if (obj.type === "image" && options.excludeAllImages === true) return true;
  if (obj.type === "image" && options.includeReferenceImages === false && isReferenceImage(obj)) return true;
  if (obj.type !== "image" && obj.exportable === false) return true;
  const layer = (s.layers || []).find((l) => l.id === (obj.layerId ?? 1));
  return layer && layer.visible === false;
}

/* ----- trigger a browser download for a blob ----- */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----- choose where to save (File System Access API, with safe fallback) -----
 * In Chromium/Edge, showSaveFilePicker lets the user pick the folder + filename.
 * Return values are a small protocol the callers act on:
 *   handle  → user picked a location; write the blob there (writeHandle).
 *   null    → user cancelled the picker; the caller aborts the export silently.
 *   undefined → API unsupported (or non-abort error); the caller falls back to a
 *               normal browser download with the suggested filename.
 * Must be called synchronously at the start of the export (before any other
 * await) so it runs inside the click's transient user activation. */
async function pickSaveHandle(filename, { mime, ext, description }) {
  if (!window.showSaveFilePicker) return undefined;
  try {
    return await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description, accept: { [mime]: [ext] } }],
    });
  } catch (e) {
    if (e && e.name === "AbortError") return null; // user cancelled
    return undefined;                               // permission/other → fall back
  }
}

async function writeHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/* ----- resolve the world rectangle to export ----- */
// Default = the artboard region (centered at origin). When `bounds` is given
// (selected-area capture), export exactly that world rectangle instead.
function exportRegion(s, bounds) {
  if (bounds && bounds.w > 0 && bounds.h > 0) {
    return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
  }
  const { w, h } = s.artboard;
  return { x: -w / 2, y: -h / 2, w, h };
}

/* ----- build the standalone export <svg> for the current state ----- */
// Background stays transparent here; PNG export adds its own white rect.
// `bounds` (optional) = a world-coordinate {x,y,w,h} rectangle to crop to.
export function buildExportSvg(s, bounds = null, options = {}) {
  const { x, y, w, h } = exportRegion(s, bounds);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  // Physical size so word processors place it at true mm dimensions.
  svg.setAttribute("width", `${w}mm`);
  svg.setAttribute("height", `${h}mm`);
  // viewBox = artboard region exactly ??off-page content is cropped.
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);

  // ----- defs: 웹폰트 @font-face(있으면) + artboard clip + per-object fill patterns -----
  const defs = document.createElementNS(SVG_NS, "defs");

  if (_fontCss) {
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = _fontCss;
    defs.appendChild(style);
  }

  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.setAttribute("id", "artboard-clip");
  const clipRect = document.createElementNS(SVG_NS, "rect");
  clipRect.setAttribute("x", x);
  clipRect.setAttribute("y", y);
  clipRect.setAttribute("width", w);
  clipRect.setAttribute("height", h);
  clip.appendChild(clipRect);
  defs.appendChild(clip);

  for (const obj of s.objects) {
    if (isHidden(s, obj, options)) continue;
    const pat = makeFillPattern(obj);
    if (pat) defs.appendChild(pat);
  }
  svg.appendChild(defs);

  // ----- drawing objects, clipped to the artboard, z-order = array order -----
  // No active-layer dimming here: this is the final artwork, not the editor view.
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("clip-path", "url(#artboard-clip)");
  for (const obj of s.objects) {
    if (isHidden(s, obj, options)) continue;
    const el = renderObject(obj);
    if (el) g.appendChild(el);
  }
  svg.appendChild(g);

  return svg;
}

/* ----- exportSvg: serialize the export SVG and trigger a download ----- */
// `bounds` (optional): world {x,y,w,h} rectangle for selected-area capture.
export async function exportSvg(state, filename, bounds = null, options = {}) {
  const name = filename || getDefaultExportFilename("svg");
  // Ask for the save location first, while still inside the user gesture.
  const handle = await pickSaveHandle(name, { mime: "image/svg+xml", ext: ".svg", description: "SVG 이미지" });
  if (handle === null) return; // user cancelled the save dialog
  await ensureEmbeddedFonts(); // 편집 화면과 같은 웹폰트로 내보내지도록 임베딩 준비
  const svg = buildExportSvg(state.get(), bounds, options);
  const source = new XMLSerializer().serializeToString(svg);
  // XML prolog keeps the file valid as a standalone .svg document.
  const doc = `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;
  const blob = new Blob([doc], { type: "image/svg+xml" });
  if (handle) {
    try { await writeHandle(handle, blob); }
    catch (_) { downloadBlob(blob, name); } // write failed → fall back to download
  } else {
    downloadBlob(blob, name);
  }
}

/* ----- rasterizeExportCanvas: SVG → white-background canvas at a DPI ----- */
// The shared raster core. exportPng encodes the returned canvas to a PNG blob;
// the exam preview (exam-preview.js) composites it over a background image at
// true mm size. Both go through THIS one path, so the preview shows exactly what
// export produces — same font substitution, same clipping — with no drift.
// Resolves { canvas, widthMm, heightMm }; rejects if the SVG fails to decode.
export function rasterizeExportCanvas(s, { dpi = 300, bounds = null, options = {} } = {}) {
  const { x, y, w, h } = exportRegion(s, bounds);

  // mm → px at the requested DPI (25.4mm = 1 inch).
  const pixelW = Math.round((w / MM_PER_INCH) * dpi);
  const pixelH = Math.round((h / MM_PER_INCH) * dpi);

  const svg = buildExportSvg(s, bounds, options);

  // White background first (PNG with white bg is standard for print/hwp).
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", x);
  bg.setAttribute("y", y);
  bg.setAttribute("width", w);
  bg.setAttribute("height", h);
  bg.setAttribute("fill", "white");
  svg.insertBefore(bg, svg.querySelector("g"));

  // Pixel dimensions for the rasterized canvas (override the mm width/height).
  svg.setAttribute("width", pixelW);
  svg.setAttribute("height", pixelH);

  const source = new XMLSerializer().serializeToString(svg);
  const doc = `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;
  const url = URL.createObjectURL(new Blob([doc], { type: "image/svg+xml;charset=utf-8" }));

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelW;
      canvas.height = pixelH;
      const ctx = canvas.getContext("2d");
      // Belt-and-suspenders white fill in case the SVG rect ever falls short.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pixelW, pixelH);
      ctx.drawImage(img, 0, 0, pixelW, pixelH);
      URL.revokeObjectURL(url);
      resolve({ canvas, widthMm: w, heightMm: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG rasterization failed"));
    };
    img.src = url;
  });
}

/* ----- exportPng: rasterize the export SVG at a DPI onto a white canvas ----- */
// `bounds` (optional): world {x,y,w,h} rectangle for selected-area capture.
/* 현재 아트보드를 PNG로 래스터라이즈해 클립보드에 복사한다.
 * 한글(HWP)·PPT 등에서 바로 Ctrl+V 가능. localhost/HTTPS + 사용자 제스처 필요.
 * 성공 시 true. (SVG는 클립보드 규격상 지원되지 않아 PNG만) */
export async function copyPngToClipboard(state, dpi = 300, bounds = null, options = {}) {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
  await ensureEmbeddedFonts();
  const result = await rasterizeExportCanvas(state.get(), { dpi, bounds, options });
  const rawBlob = await new Promise((res) => result.canvas.toBlob(res, "image/png"));
  if (!rawBlob) return false;
  const blob = await pngBlobWithDpi(rawBlob, dpi); // 실제 DPI(pHYs) 기록
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  return true;
}

export async function exportPng(state, filename, dpi, bounds = null, options = {}) {
  const name = filename || getDefaultExportFilename("png");
  // Ask for the save location first, while still inside the user gesture (before
  // the async rasterization below, which would otherwise lose the activation).
  const handle = await pickSaveHandle(name, { mime: "image/png", ext: ".png", description: "PNG 이미지" });
  if (handle === null) return; // user cancelled the save dialog

  await ensureEmbeddedFonts();
  let result;
  try {
    result = await rasterizeExportCanvas(state.get(), { dpi, bounds, options });
  } catch (_) {
    alert("PNG로 내보내는 중 오류가 발생했습니다.");
    return;
  }
  result.canvas.toBlob(async (rawBlob) => {
    if (!rawBlob) return;
    const blob = await pngBlobWithDpi(rawBlob, dpi); // 실제 DPI(pHYs) 기록 → HWP/워드 삽입 크기 정상
    if (handle) {
      writeHandle(handle, blob).catch(() => downloadBlob(blob, name));
    } else {
      downloadBlob(blob, name);
    }
  }, "image/png");
}
