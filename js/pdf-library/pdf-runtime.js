import { readPageTextContent } from "./pdf-text-content.js?v=1.6.0-preview-labeler-0917-1111";
import {
  createCropSource,
  createDocumentRecord,
  createItemRecord,
  createPageRecord,
  createRenderResult,
} from "./contract.js?v=1.6.0-preview-labeler-0917-1111";
import { collectPageGraphicMarks, detectFigureCandidates as detectGraphics } from "./figure-candidates.js?v=1.6.0-preview-labeler-0917-1111";
import { trimQuestionRectAtFooter } from "./page-geometry.js?v=1.6.0-preview-labeler-0917-1111";

const PDFJS_MODULE_URL = new URL("../../vendor/pdfjs/pdf.mjs", import.meta.url); const PDFJS_WORKER_URL = new URL("../../vendor/pdfjs/pdf.worker.mjs", import.meta.url);
const DEFAULT_RENDER_PIXELS = 48_000_000; const DEFAULT_RENDER_DIMENSION = 16_384;
const DEFAULT_CACHE_BYTES = 64_000_000;

export function pdfOpenDiagnostic(error) {
  const message = error instanceof Error && error.message ? error.message : "PDF 문서를 열 수 없습니다.";
  return Object.freeze({ code: "PDF_OPEN_FAILED", message: message.slice(0, 2000), stage: "open", recoverable: true });
}

function resourceDirectory(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return globalThis.process?.versions?.node ? decodeURIComponent(url.pathname) : url.href;
}

function pageWordRecords(pdfjs, content, viewport) {
  const words = [];
  for (const item of content.items) {
    if (typeof item.str !== "string" || !item.transform) continue;
    const segments = [...item.str.matchAll(/\S+/gu)];
    if (segments.length === 0) continue;
    const transform = pdfjs.Util.transform(viewport.transform, item.transform);
    const itemHeight = Math.max(Math.abs(transform[3]), Number(item.height) || 0, 1);
    const itemWidth = Math.max(Number(item.width) || 0, 1);
    for (const segment of segments) {
      const startRatio = segment.index / item.str.length;
      const widthRatio = segment[0].length / item.str.length;
      const rect = [
        Math.max(0, transform[4] + itemWidth * startRatio) / viewport.width,
        Math.max(0, transform[5] - itemHeight) / viewport.height,
        Math.min(itemWidth * widthRatio, viewport.width) / viewport.width,
        Math.min(itemHeight, viewport.height) / viewport.height,
      ];
      const [x, y, width, height] = rect;
      if (x + width <= 1 && y + height <= 1) words.push({ text: segment[0], rect });
    }
  }
  return words;
}

export function detectPageItems(page) {
  const marginX = 8 / page.widthPoints;
  const marginY = 8 / page.heightPoints;
  const columnTolerance = 30 / page.widthPoints;
  const minHeight = 60 / page.heightPoints;
  const bottom = 1 - 30 / page.heightPoints;
  const numbered = page.words
    .map((word) => ({ match: /^(\d{1,2})\.$/u.exec(word.text), x: word.rect[0], y: word.rect[1] }))
    .filter((mark) => mark.match)
    .map((mark) => ({ number: Number(mark.match[1]), x: mark.x, y: mark.y }));
  const pageText = String(page.text ?? "").normalize("NFKC");
  const hasQuestionPrompt = /[?？]|옳은|고른|것은|구하(?:시오|라)|계산하(?:시오|라)|쓰시오|말하시오|서술하시오|다음\s*중/u.test(pageText);
  const hasAnswerKeyEvidence = /답안|(?:^|\s)답(?=\s|$)/u.test(pageText);
  const hasQuestionEvidence = !pageText.trim() || hasQuestionPrompt || numbered.length >= 3
    || page.words.some((word) => /^[①②③④⑤]$/u.test(word.text));
  if ((hasAnswerKeyEvidence && !hasQuestionPrompt) || !hasQuestionEvidence) return Object.freeze([]);
  const uniqueNumbers = new Map();
  for (const mark of numbered.sort((left, right) => left.x - right.x)) {
    if (!uniqueNumbers.has(mark.number)) uniqueNumbers.set(mark.number, mark);
  }
  const marks = [...uniqueNumbers.values()];
  if (marks.length === 0) return Object.freeze([]);

  const groups = [];
  for (const mark of [...marks].sort((left, right) => left.x - right.x)) {
    const group = groups.at(-1);
    if (!group || mark.x - group.at(-1).x > columnTolerance) groups.push([mark]);
    else group.push(mark);
  }
  const starts = groups.map((group) => Math.min(...group.map((mark) => mark.x)));
  const aligned = marks.map((mark) => {
    let column = 0;
    for (let index = starts.length - 1; index >= 0; index -= 1) {
      if (mark.x >= starts[index] - columnTolerance / 2) { column = index; break; }
    }
    return { ...mark, column };
  }).filter((mark) => Math.abs(mark.x - starts[mark.column]) <= columnTolerance / 2);

  const items = [];
  for (let column = 0; column < starts.length; column += 1) {
    const columnMarks = aligned.filter((mark) => mark.column === column).sort((left, right) => left.y - right.y);
    const right = column + 1 < starts.length ? starts[column + 1] - marginX : 1 - marginX;
    for (let index = 0; index < columnMarks.length; index += 1) {
      const mark = columnMarks[index];
      const y = Math.max(0, mark.y - marginY);
      const nextY = columnMarks[index + 1]?.y;
      const itemBottom = Math.min(1, nextY === undefined ? bottom : nextY - marginY);
      if (itemBottom - y < minHeight) continue;
      const rect = trimQuestionRectAtFooter(
        [Math.max(0, starts[column] - marginX), y, right - Math.max(0, starts[column] - marginX), itemBottom - y],
        page.words,
      );
      const source = createCropSource({ documentId: page.documentId, pageNumber: page.pageNumber, rect, fullPageFallback: false });
      items.push(createItemRecord({
        id: `${page.documentId}:p${page.pageNumber}:q${mark.number}`, itemNumber: mark.number,
        label: `${mark.number}`, confidence: 1, source,
      }));
    }
  }
  return Object.freeze(items.sort((left, right) => left.rect[0] - right.rect[0] || left.rect[1] - right.rect[1]));
}

function inputBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  throw new TypeError("PDF data must be an ArrayBuffer or Uint8Array view");
}

async function pngBytes(canvas) {
  if (typeof canvas.encode === "function") return new Uint8Array(await canvas.encode("png"));
  if (typeof canvas.toBlob !== "function") throw new TypeError("Canvas must support encode or toBlob");
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function copyRenderResult(result) {
  return createRenderResult({ ...result, bytes: result.bytes.slice() });
}

export function createPdfRuntime(options = {}) {
  const canvasFactory = options.canvasFactory ?? {
    create(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      return canvas;
    },
  };
  const maxRenderPixels = options.maxRenderPixels ?? DEFAULT_RENDER_PIXELS;
  const maxRenderDimension = options.maxRenderDimension ?? DEFAULT_RENDER_DIMENSION;
  const maxCacheBytes = options.maxCacheBytes ?? DEFAULT_CACHE_BYTES;
  const maxOpenDocuments = options.maxOpenDocuments ?? 4;
  const opened = new Map();
  const generations = new Map();
  const renders = new Map();
  let renderCacheBytes = 0;
  let pdfjsPromise;

  async function pdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_MODULE_URL.href).then((module) => {
        module.GlobalWorkerOptions.workerSrc = options.workerSrc ?? PDFJS_WORKER_URL.href;
        return module;
      });
    }
    return pdfjsPromise;
  }

  function getOpened(documentId) {
    const value = opened.get(documentId);
    if (!value) throw new RangeError(`PDF document is not open: ${documentId}`);
    opened.delete(documentId); opened.set(documentId, value);
    return value;
  }

  function removeCachedDocument(documentId) {
    for (const [key, value] of renders) {
      if (!key.startsWith(`${documentId}:`)) continue;
      renders.delete(key); renderCacheBytes -= value.bytes.byteLength;
    }
  }

  async function closeDocument(documentId) {
    generations.set(documentId, (generations.get(documentId) ?? 0) + 1);
    const value = opened.get(documentId);
    if (!value) return false;
    opened.delete(documentId); removeCachedDocument(documentId);
    await value.task.destroy();
    return true;
  }

  async function openDocument(input) {
    if (!input || (input.data === undefined) === (input.url === undefined)) throw new TypeError("Provide exactly one PDF data or url source");
    if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
    const generation = (generations.get(input.id) ?? 0) + 1;
    generations.set(input.id, generation);
    const module = await pdfjs();
    const task = module.getDocument({
      ...(input.data === undefined ? { url: input.url } : { data: inputBytes(input.data) }),
      cMapUrl: options.cMapUrl ?? resourceDirectory("../../vendor/pdfjs/cmaps/"), cMapPacked: true,
      standardFontDataUrl: options.standardFontDataUrl ?? resourceDirectory("../../vendor/pdfjs/standard_fonts/"),
      wasmUrl: options.wasmUrl ?? resourceDirectory("../../vendor/pdfjs/wasm/"),
      isEvalSupported: false, useWorkerFetch: false,
    });
    const abort = () => task.destroy();
    let previous;
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise;
      if (generations.get(input.id) !== generation) throw new DOMException("PDF open was superseded", "AbortError");
      previous = opened.get(input.id) ?? null;
      const metadataRecord = Object.freeze({
        id: input.id, title: input.title, source: input.source, pageCount: pdf.numPages,
        status: "unindexed", pages: Object.freeze([]),
      });
      opened.set(input.id, { pdf, record: metadataRecord, task });
      await input.onMetadata?.(metadataRecord);
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const content = await readPageTextContent(page, { disableNormalization: false });
        const words = pageWordRecords(module, content, viewport);
        const base = { documentId: input.id, pageNumber, widthPoints: viewport.width, heightPoints: viewport.height, rotation: viewport.rotation, text: content.items.map((item) => item.str ?? "").join(" "), words };
        pages.push(createPageRecord({ ...base, items: detectPageItems(base) }));
        page.cleanup();
      }
      const record = createDocumentRecord({
        id: input.id, title: input.title, source: input.source, pageCount: pdf.numPages,
        status: pages.some((page) => page.text.trim()) ? "indexed" : "image-only", pages,
      });
      if (generations.get(record.id) !== generation) throw new DOMException("PDF open was superseded", "AbortError");
      opened.set(record.id, { pdf, record, task });
      removeCachedDocument(record.id);
      if (previous && previous.task !== task) await previous.task.destroy();
      while (opened.size > maxOpenDocuments) await closeDocument(opened.keys().next().value);
      return record;
    } catch (error) {
      const current = opened.get(input.id);
      if (current?.task === task) {
        opened.delete(input.id);
        if (previous) opened.set(input.id, previous);
      }
      await task.destroy();
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abort);
    }
  }

  async function openDocumentResource(input, record) {
    if (!input || (input.data === undefined) === (input.url === undefined)) throw new TypeError("Provide exactly one PDF data or url source");
    if (!record || record.id !== input.id || !Array.isArray(record.pages)) throw new TypeError("A matching persisted PDF record is required");
    if (input.signal?.aborted) throw input.signal.reason ?? new DOMException("Aborted", "AbortError");
    const generation = (generations.get(input.id) ?? 0) + 1;
    generations.set(input.id, generation);
    const module = await pdfjs();
    const task = module.getDocument({
      ...(input.data === undefined ? { url: input.url } : { data: inputBytes(input.data) }),
      cMapUrl: options.cMapUrl ?? resourceDirectory("../../vendor/pdfjs/cmaps/"), cMapPacked: true,
      standardFontDataUrl: options.standardFontDataUrl ?? resourceDirectory("../../vendor/pdfjs/standard_fonts/"),
      wasmUrl: options.wasmUrl ?? resourceDirectory("../../vendor/pdfjs/wasm/"),
      isEvalSupported: false, useWorkerFetch: false,
    });
    const abort = () => task.destroy();
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages !== record.pageCount) throw new Error("Persisted PDF page count does not match the source resource");
      if (generations.get(record.id) !== generation) throw new DOMException("PDF open was superseded", "AbortError");
      const previous = opened.get(record.id);
      opened.set(record.id, { pdf, record, task });
      removeCachedDocument(record.id);
      if (previous) await previous.task.destroy();
      while (opened.size > maxOpenDocuments) await closeDocument(opened.keys().next().value);
      return record;
    } catch (error) {
      await task.destroy();
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abort);
    }
  }

  async function ensurePageRecord(documentId, pageNumber) {
    const value = getOpened(documentId);
    const existing = value.record.pages.find(page => page.pageNumber === pageNumber);
    if (existing) return existing;
    const page = await value.pdf.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await readPageTextContent(page, { disableNormalization: false });
      const base = { documentId, pageNumber, widthPoints: viewport.width, heightPoints: viewport.height,
        rotation: viewport.rotation, text: content.items.map(item => item.str ?? "").join(" "),
        words: pageWordRecords(await pdfjs(), content, viewport) };
      const record = createPageRecord({ ...base, items: detectPageItems(base) });
      value.record = Object.freeze({ ...value.record, pages: Object.freeze([...value.record.pages, record]) });
      return record;
    } finally { page.cleanup(); }
  }

  async function render(source, dpi, signal, targetPixelWidth) {
    const parsedSource = createCropSource(source);
    const key = `${parsedSource.documentId}:${parsedSource.pageNumber}:${parsedSource.rect.join(",")}:${dpi}:${targetPixelWidth ?? ""}`;
    const cached = renders.get(key);
    if (cached) { renders.delete(key); renders.set(key, cached); return copyRenderResult(cached); }
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const { pdf } = getOpened(parsedSource.documentId);
    const page = await pdf.getPage(parsedSource.pageNumber);
    const [x, y, widthRatio, heightRatio] = parsedSource.rect;
    if (Number.isFinite(targetPixelWidth) && targetPixelWidth > 0) {
      const base = page.getViewport({ scale: 1 });
      const cropWidth = base.width * widthRatio;
      const cropHeight = base.height * heightRatio;
      const budgetScale = Math.min((maxRenderDimension - 1) / cropWidth, (maxRenderDimension - 1) / cropHeight,
        Math.sqrt(maxRenderPixels / ((cropWidth + 1) * (cropHeight + 1))));
      dpi = Math.max(1, Math.min(Math.ceil(Math.max(dpi, 72 * targetPixelWidth / cropWidth)), Math.floor(72 * budgetScale)));
    }
    const viewport = page.getViewport({ scale: dpi / 72 });
    const width = Math.max(1, Math.ceil(viewport.width * widthRatio));
    const height = Math.max(1, Math.ceil(viewport.height * heightRatio));
    if (width > maxRenderDimension || height > maxRenderDimension || width * height > maxRenderPixels) {
      page.cleanup();
      throw new RangeError(`PDF render exceeds pixel budget (${width}x${height})`);
    }
    const canvas = canvasFactory.create(width, height);
    const context = canvas.getContext("2d");
    const task = page.render({ canvasContext: context, viewport, transform: [1, 0, 0, 1, -viewport.width * x, -viewport.height * y], background: "#ffffff" });
    const cancel = () => task.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await task.promise;
      const result = createRenderResult({ bytes: await pngBytes(canvas), width, height, dpi, source: parsedSource });
      if (result.bytes.byteLength <= maxCacheBytes) {
        while (renderCacheBytes + result.bytes.byteLength > maxCacheBytes && renders.size) {
          const oldest = renders.keys().next().value;
          renderCacheBytes -= renders.get(oldest).bytes.byteLength; renders.delete(oldest);
        }
        renders.set(key, copyRenderResult(result)); renderCacheBytes += result.bytes.byteLength;
      }
      return result;
    } finally {
      signal?.removeEventListener("abort", cancel); page.cleanup();
    }
  }

  return Object.freeze({
    openDocument, openDocumentResource, ensurePageRecord, closeDocument,
    getDocument(documentId) { return opened.get(documentId)?.record ?? null; },
    async detectFigureCandidates(input) {
      const value = getOpened(input.documentId); const pageRecord = await ensurePageRecord(input.documentId, input.pageNumber);
      if (!pageRecord) throw new RangeError(`PDF page is unavailable: ${input.pageNumber}`);
      const page = await value.pdf.getPage(input.pageNumber);
      try { return detectGraphics({ item: input.item, marks: await collectPageGraphicMarks({ pdfjs: await pdfjs(), page }), words: pageRecord.words, pageWidthPoints: pageRecord.widthPoints, pageHeightPoints: pageRecord.heightPoints }); } finally { page.cleanup(); }
    },
    renderPage(input) { return render({ documentId: input.documentId, pageNumber: input.pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true }, Math.max(36, input.dpi ?? 110), input.signal); },
    renderCrop(input) { return render(input.source, Math.max(36, input.dpi ?? 300), input.signal, input.targetPixelWidth); },
    async clearCache() {
      renders.clear(); renderCacheBytes = 0;
      const ids = [...opened.keys()];
      for (const id of ids) await closeDocument(id);
      generations.clear();
    },
  });
}
