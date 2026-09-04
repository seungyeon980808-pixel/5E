import { getDocument, GlobalWorkerOptions } from "../vendor/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const documents = new Map();
const standardFontDataUrl = new URL("../vendor/pdfjs/standard_fonts/", import.meta.url).href;
const cMapUrl = new URL("../vendor/pdfjs/cmaps/", import.meta.url).href;

function sourceKey(source) {
  return `${source.id}:${source.size || 0}:${source.modifiedAt || 0}`;
}

async function loadDocument(source) {
  const key = sourceKey(source);
  if (!documents.has(key)) {
    const pending = Promise.resolve(source.read()).then((data) => {
      const view = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      const bytes = new Uint8Array(view);
      return getDocument({ data: bytes, standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;
    });
    documents.set(key, pending);
    pending.catch(() => { if (documents.get(key) === pending) documents.delete(key); });
  }
  return documents.get(key);
}

function pageText(content) {
  let text = "";
  for (const item of content.items || []) {
    if (!("str" in item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function metadataScalar(value) {
  if (typeof value === "string") return value.slice(0, 1000);
  return typeof value === "number" && Number.isFinite(value) ? String(value).slice(0, 1000) : "";
}

export function normalizePdfMetadata(info) {
  const custom = info?.Custom || {};
  return {
    title: metadataScalar(info?.Title),
    author: metadataScalar(info?.Author),
    subject: metadataScalar(info?.Subject),
    keywords: metadataScalar(info?.Keywords),
    creator: metadataScalar(info?.Creator),
    producer: metadataScalar(info?.Producer),
    exam: metadataScalar(custom.Exam),
    question: metadataScalar(custom.Question),
  };
}

export async function extractPdfPageInventory(source, onProgress) {
  const pdf = await loadDocument(source);
  const { info } = await pdf.getMetadata();
  const metadata = normalizePdfMetadata(info);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = pageText(await page.getTextContent());
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      id: `${source.id}:${pageNumber}`,
      sourceId: source.id,
      name: source.name,
      relativePath: source.relativePath || source.name,
      pageNumber,
      text,
      searchable: Boolean(text),
      metadata,
      rotation: page.rotate,
      width: viewport.width,
      height: viewport.height,
      source,
    });
    onProgress?.({ pageNumber, pageCount: pdf.numPages, searchable: Boolean(text) });
  }
  return pages;
}

export async function extractPdfPages(source, onProgress) {
  return (await extractPdfPageInventory(source, onProgress)).filter((page) => page.searchable);
}

export async function renderPdfPage(source, pageNumber, maxWidth = 1400) {
  const pdf = await loadDocument(source);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2.5, maxWidth / Math.max(base.width, 1)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
  return canvas.toDataURL("image/png");
}

export async function renderPdfPageImageData(source, pageNumber, maxWidth = 1200) {
  const pdf = await loadDocument(source);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, maxWidth / Math.max(base.width, 1)) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  await page.render({ canvasContext: context, viewport }).promise;
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export async function renderPdfRegion(source, pageNumber, box, maxWidth = 1800) {
  const pdf = await loadDocument(source);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxWidth / Math.max(base.width * box.w, 1));
  const viewport = page.getViewport({ scale });
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = Math.ceil(viewport.width);
  pageCanvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: pageCanvas.getContext("2d", { alpha: false }), viewport }).promise;
  const sx = Math.max(0, Math.round(box.x * pageCanvas.width));
  const sy = Math.max(0, Math.round(box.y * pageCanvas.height));
  const sw = Math.max(1, Math.min(pageCanvas.width - sx, Math.round(box.w * pageCanvas.width)));
  const sh = Math.max(1, Math.min(pageCanvas.height - sy, Math.round(box.h * pageCanvas.height)));
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  output.getContext("2d", { alpha: false }).drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return output.toDataURL("image/png");
}

export function clearPdfDocumentCache() {
  const pending = Array.from(documents.values(), async (document) => (await document).destroy());
  documents.clear();
  return Promise.allSettled(pending);
}
