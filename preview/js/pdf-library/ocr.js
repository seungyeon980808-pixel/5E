import { createDocumentRecord, createPageRecord } from "./contract.js";
import { detectPageItems } from "./pdf-runtime.js?v=1.6.0-preview-fast-login-0916";

const TESSERACT_MODULE_URL = new URL("../../vendor/ocr/tesseract.esm.min.js", import.meta.url);
const TESSERACT_WORKER_URL = new URL("../../vendor/ocr/worker.min.js", import.meta.url);
const TESSERACT_CORE_URL = new URL("../../vendor/ocr/tesseract-core-simd-lstm.wasm.js", import.meta.url);
const TESSERACT_LANGUAGE_URL = new URL("../../vendor/ocr/lang/", import.meta.url);
const SUPPORTED_LANGUAGES = new Set(["eng", "kor", "kor+eng"]);
const DEFAULT_DPI = 240;
const DEFAULT_MAX_PAGE_PIXELS = 16_000_000;

export function ocrIndexState(result) {
  if (result?.status === "recognized") return Object.freeze({ state: "searchable", diagnostic: null });
  const unsupported = result?.status === "unsupported";
  return Object.freeze({
    state: unsupported ? "needs-ocr" : "failed",
    diagnostic: Object.freeze({
      code: unsupported ? "OCR_NO_TEXT" : "OCR_FAILED",
      message: unsupported ? "문자 인식에서 검색 가능한 텍스트를 찾지 못했습니다." : "문자 인식을 완료하지 못했습니다.",
      stage: "ocr",
      recoverable: true,
    }),
  });
}

function abortError(signal) {
  return signal?.reason ?? new DOMException("Aborted", "AbortError");
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function flattenWords(data) {
  if (Array.isArray(data?.words)) return data.words;
  if (!Array.isArray(data?.blocks)) return [];
  return data.blocks.flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.lines ?? [])
    .flatMap((line) => line.words ?? []);
}

function normalizedWords(data, width, height) {
  const words = [];
  for (const word of flattenWords(data)) {
    const text = typeof word?.text === "string" ? word.text.trim() : "";
    const box = word?.bbox;
    if (!text || !box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) continue;
    const x0 = clamp(box.x0, 0, width);
    const y0 = clamp(box.y0, 0, height);
    const x1 = clamp(box.x1, 0, width);
    const y1 = clamp(box.y1, 0, height);
    if (x1 <= x0 || y1 <= y0) continue;
    words.push({ text, rect: [x0 / width, y0 / height, (x1 - x0) / width, (y1 - y0) / height] });
  }
  return words;
}

async function createBundledWorker({ language, logger }) {
  const module = await import(TESSERACT_MODULE_URL.href);
  const tesseract = module.default ?? module;
  if (typeof tesseract.createWorker !== "function") throw new Error("The bundled OCR runtime is unavailable.");
  return tesseract.createWorker(language.split("+"), 1, {
    workerPath: TESSERACT_WORKER_URL.href,
    corePath: TESSERACT_CORE_URL.href,
    langPath: TESSERACT_LANGUAGE_URL.href,
    gzip: true,
    cacheMethod: "none",
    logger,
  });
}

function parseLanguage(value) {
  const language = value ?? "kor+eng";
  if (!SUPPORTED_LANGUAGES.has(language)) throw new RangeError(`Unsupported OCR language: ${language}`);
  return language;
}

export function createPdfOcrService(options = {}) {
  if (!options.runtime || typeof options.runtime.renderPage !== "function") throw new TypeError("OCR requires a PDF runtime");
  const runtime = options.runtime;
  const workerFactory = options.workerFactory ?? createBundledWorker;
  const dpi = options.dpi ?? DEFAULT_DPI;
  const maxPagePixels = options.maxPagePixels ?? DEFAULT_MAX_PAGE_PIXELS;
  let active = false;

  async function recognizeDocument(input) {
    const document = input?.document;
    const targetPages = document?.pages?.filter((page) => !page.text.trim()) ?? [];
    if (targetPages.length === 0) throw new TypeError("OCR is only available for image-only PDF pages");
    const language = parseLanguage(input.language);
    const signal = input.signal;
    const onProgress = typeof input.onProgress === "function" ? input.onProgress : () => {};
    if (signal?.aborted) throw abortError(signal);
    if (active) throw new Error("OCR is already active");
    active = true;

    let pageNumber = 0;
    let worker;
    let termination;
    const terminate = () => {
      if (!termination && worker) termination = Promise.resolve(worker.terminate());
      return termination ?? Promise.resolve();
    };
    const abort = () => { void terminate(); };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      onProgress(Object.freeze({ stage: "loading", pageNumber: 0, pageCount: document.pageCount, progress: 0 }));
      worker = await workerFactory({
        language,
        logger(message) {
          const progress = Number.isFinite(message?.progress) ? clamp(message.progress, 0, 1) : 0;
          onProgress(Object.freeze({ stage: pageNumber === 0 ? "loading" : "recognizing", pageNumber, pageCount: document.pageCount, progress, status: message?.status ?? "recognizing" }));
        },
      });
      if (signal?.aborted) throw abortError(signal);

      const recognizedRecords = new Map();
      const diagnostics = [];
      for (let targetIndex = 0; targetIndex < targetPages.length; targetIndex += 1) {
        const originalPage = targetPages[targetIndex];
        pageNumber = originalPage.pageNumber;
        if (signal?.aborted) throw abortError(signal);
        const render = await runtime.renderPage({ documentId: document.id, pageNumber, dpi, signal });
        if (render.width * render.height > maxPagePixels) throw new RangeError(`OCR page exceeds pixel budget (${render.width}x${render.height})`);
        const recognition = await worker.recognize(render.bytes, {}, { blocks: true, text: true });
        if (signal?.aborted) throw abortError(signal);
        const words = normalizedWords(recognition.data, render.width, render.height);
        const text = typeof recognition.data?.text === "string" ? recognition.data.text.replace(/\s+/gu, " ").trim() : "";
        const confidence = clamp((Number(recognition.data?.confidence) || 0) / 100, 0, 1);
        const status = text || words.length ? "recognized" : "unsupported";
        const base = { ...originalPage, text, words };
        recognizedRecords.set(pageNumber, createPageRecord({ ...base, items: detectPageItems(base) }));
        diagnostics.push(Object.freeze({ pageNumber, status, confidence }));
        onProgress(Object.freeze({ stage: "page-complete", pageNumber, pageCount: document.pageCount, progress: (targetIndex + 1) / targetPages.length, confidence, status }));
      }

      const recognizedPages = diagnostics.filter((page) => page.status === "recognized");
      const status = recognizedPages.length ? "recognized" : "unsupported";
      const confidence = recognizedPages.length
        ? recognizedPages.reduce((sum, page) => sum + page.confidence, 0) / recognizedPages.length
        : 0;
      const pages = document.pages.map((page) => recognizedRecords.get(page.pageNumber) ?? page);
      const result = Object.freeze({
        document: createDocumentRecord({ ...document, status: pages.some((page) => page.text.trim()) ? "indexed" : "image-only", pages }),
        status, confidence, pages: Object.freeze(diagnostics),
      });
      onProgress(Object.freeze({ stage: "complete", pageNumber: document.pageCount, pageCount: document.pageCount, progress: 1, confidence, status }));
      return result;
    } finally {
      signal?.removeEventListener("abort", abort);
      try {
        await terminate();
      } finally {
        active = false;
      }
    }
  }

  return Object.freeze({ recognizeDocument });
}
