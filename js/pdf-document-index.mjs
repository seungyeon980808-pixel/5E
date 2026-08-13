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
    documents.set(key, Promise.resolve(source.read()).then((data) => {
      const view = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      const bytes = new Uint8Array(view);
      return getDocument({ data: bytes, standardFontDataUrl, cMapUrl, cMapPacked: true }).promise;
    }));
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

export async function extractPdfPages(source, onProgress) {
  const pdf = await loadDocument(source);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = pageText(await page.getTextContent());
    if (text) {
      pages.push({
        id: `${source.id}:${pageNumber}`,
        sourceId: source.id,
        name: source.name,
        relativePath: source.relativePath || source.name,
        pageNumber,
        text,
        source,
      });
    }
    onProgress?.({ pageNumber, pageCount: pdf.numPages });
  }
  return pages;
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

export function clearPdfDocumentCache() {
  documents.clear();
}
