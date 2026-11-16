import './stream-iterator-polyfill.mjs';
import * as pdfjs from './vendor/pdfjs/pdf.mjs';
import { driveFilePath } from './data.mjs?v=library-release-20261011-3';
import { downloadDriveFile } from './drive-source.mjs';
import { equationTextItems } from './pdf-text-geometry.mjs';
import { PREVIEW_VERTICAL_PADDING_PT, previewCropBounds, previewPaperEnd, previewQuestionBox } from './preview-crop.mjs?v=preview-crop-20261004-1';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf-worker.mjs', import.meta.url).href;

const documentCache = new Map();
const documentUsers = new Map();
const byteCache = new Map();
const renderedPages = new Map();
const downloadQueue = [];
let activeDownloads = 0;
function scheduleDownload(path, needed) {
  return new Promise((resolve, reject) => {
    downloadQueue.push({ path, needed, resolve, reject });
    pumpDownloads();
  });
}
function pumpDownloads() {
  while (activeDownloads < 2 && downloadQueue.length) {
    const job = downloadQueue.shift(); activeDownloads++;
    Promise.resolve().then(() => {
      if (!job.needed()) throw new DOMException('원본 선택이 변경되었습니다.', 'AbortError');
      return downloadDriveFile(job.path);
    }).then(job.resolve, job.reject).finally(() => { activeDownloads--; pumpDownloads(); });
  }
}
const options = {
  cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
  // ExamPool: 기출 그림 상당수가 JBIG2·JPX 비트맵이다. 디코더(wasm)가 없으면 pdf.js가 그림을 통째로 건너뛴다.
  // 같은 pdf.js 6.3.289를 쓰는 5E 본체의 vendor/pdfjs/wasm/을 함께 쓴다.
  wasmUrl: new URL('../../../../vendor/pdfjs/wasm/', import.meta.url).href,
};

function trimDocumentCache() {
  for (const [name, promise] of documentCache) {
    if (documentCache.size <= 4) break;
    if (documentUsers.get(name)) continue;
    documentCache.delete(name); byteCache.delete(name);
    // pdf.js 6.3.289의 문서 객체에는 destroy()가 없어(오류는 삼켜짐) 문서와 Web Worker가 쌓였다(M30). 불러오기 작업을 끝낸다.
    void promise.then(doc => doc.loadingTask.destroy()).catch(() => {});
  }
}
function acquirePdf(name) {
  documentUsers.set(name, (documentUsers.get(name) || 0) + 1);
  const promise = openPdf(name);
  let released = false;
  return { promise, release() {
    if (released) return; released = true;
    const users = (documentUsers.get(name) || 1) - 1;
    if (users) documentUsers.set(name, users); else documentUsers.delete(name);
    trimDocumentCache();
  } };
}
// ExamPool: PDF 바이트를 넘겨주는 곳(5E 라이브러리·로컬 파일). 없으면 원래대로 공개 게이트웨이에서 받는다.
// 변환기 모듈이 ?v= 주소로 여러 번 읽혀도 같은 출처를 쓰도록 전역에 둔다.
export function setPdfSource(source) { globalThis.__examPoolPdfSource = typeof source === 'function' ? source : null; documentCache.clear(); byteCache.clear(); }
function openPdf(name) {
  if (!documentCache.has(name)) {
    const pdfSource = globalThis.__examPoolPdfSource;
    const bytes = pdfSource ? Promise.resolve(pdfSource(name)).then((value) => value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
      : scheduleDownload(driveFilePath(name), () => byteCache.get(name) === bytes && (documentUsers.get(name) || 0) > 0);
    byteCache.set(name, bytes);
    const promise = bytes
      .then((data) => pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), ...options }).promise);
    documentCache.set(name, promise);
    promise.catch(() => {
      if (documentCache.get(name) === promise) documentCache.delete(name);
      if (byteCache.get(name) === bytes) byteCache.delete(name);
    });
  }
  const promise = documentCache.get(name);
  documentCache.delete(name); documentCache.set(name, promise);
  return promise;
}

// Preview and conversion share the download and open document. Cancelling one
// consumer releases its wait without destroying resources another consumer needs.
function waitForPdf(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([promise, cancelled]).finally(() => signal.removeEventListener('abort', abort));
}

function trimPreviewPaper(canvas, scale, box, paperEnd) {
  const { width, height } = canvas;
  if (!width || !height) return canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const [left, top, right, bottom] = previewCropBounds(context.getImageData(0, 0, width, height),
    { scale, box, paperEnd });
  const padding = Math.ceil(PREVIEW_VERTICAL_PADDING_PT * scale);
  const cropped = document.createElement('canvas');
  cropped.width = right - left;
  cropped.height = bottom - top + padding * 2;
  const output = cropped.getContext('2d', { alpha: false });
  output.fillStyle = '#fff';
  output.fillRect(0, 0, cropped.width, cropped.height);
  // Copy only the detected content so adjacent source text cannot leak into the added frame.
  output.drawImage(canvas, left, top, right - left, bottom - top,
    0, padding, right - left, bottom - top);
  return cropped;
}

export async function readQuestionPdf(item, { signal } = {}) {
  signal?.throwIfAborted();
  const lease = acquirePdf(item.pdfFile);
  try {
  const documentPromise = lease.promise;
  const bytesPromise = byteCache.get(item.pdfFile);
  await waitForPdf(documentPromise, signal);
  signal?.throwIfAborted();
  const bytes = await waitForPdf(bytesPromise, signal);
  signal?.throwIfAborted();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)),
    fontExtraProperties: true, ...options });
  const abort = () => { Promise.resolve(task.destroy()).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(item.page);
    const [content, operations] = await Promise.all([
      page.getTextContent({ disableNormalization: true }), page.getOperatorList(),
    ]);
    signal?.throwIfAborted();
    const fonts = Object.fromEntries(Object.keys(content.styles).map((key) => {
      const font = page.commonObjs.get(key);
      return [key, { name: font.name || '', fontMatrix: font.fontMatrix,
        data: font.data ? Uint8Array.from(font.data) : null }];
    }));
    const glyphs = [];
    let fontId = '';
    for (let index = 0; index < operations.fnArray.length; index += 1) {
      const operation = operations.fnArray[index];
      const args = operations.argsArray[index];
      if (operation === pdfjs.OPS.setFont) fontId = args[0];
      if (operation !== pdfjs.OPS.showText) continue;
      for (const glyph of args[0]) {
        if (glyph && typeof glyph === 'object' && glyph.unicode) {
          glyphs.push({ fontId, codepoint: glyph.unicode.codePointAt(0),
            glyphId: glyph.originalCharCode, advance: glyph.width });
        }
      }
    }
    return { pageNumber: item.page, content, fonts, glyphs, equationItems: equationTextItems(operations, pdfjs.OPS, fonts),
      operations: { fnArray: operations.fnArray, argsArray: operations.argsArray }, OPS: pdfjs.OPS,
      pageHeight: page.getViewport({ scale: 1 }).height, pageWidth: page.getViewport({ scale: 1 }).width };
  } finally {
    signal?.removeEventListener('abort', abort);
    await task.destroy();
  }
  } finally { lease.release(); }
}

const rasterQueue = [];
let activeRasters = 0;
function scheduleRaster(work, priority) {
  return new Promise((resolve, reject) => {
    const job = { work, resolve, reject };
    if (priority) rasterQueue.unshift(job); else rasterQueue.push(job);
    pumpRasters();
  });
}
function pumpRasters() {
  while (activeRasters < 2 && rasterQueue.length) {
    const job = rasterQueue.shift(); activeRasters++;
    // Start on the next microtask so the first consumer can acquire its reference.
    Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => { activeRasters--; pumpRasters(); });
  }
}
function trimRasterCache() {
  const settled = [...renderedPages].filter(([,record]) => record.settled);
  for (const [key] of settled.slice(0, Math.max(0, settled.length - 2))) renderedPages.delete(key);
}
async function renderedPage(item, scale, signal) {
  signal?.throwIfAborted();
  const key = JSON.stringify([item.pdfFile, item.page, scale]);
  let record = renderedPages.get(key);
  if (record) { renderedPages.delete(key); renderedPages.set(key, record); }
  else {
    record = { users: 0, settled: false, promise: null };
    record.promise = scheduleRaster(async () => {
      // Rapidly replaced selections must not start queued downloads/renders.
      if (!record.users) throw new DOMException('미리보기가 변경되었습니다.', 'AbortError');
      const lease = acquirePdf(item.pdfFile);
      try {
        const doc = await lease.promise;
        const page = await doc.getPage(item.page);
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const rendering = page.render({canvasContext:canvas.getContext('2d',{alpha:false}),canvas,viewport});
        const timeout = setTimeout(() => rendering.cancel(), 10000);
        try { await rendering.promise; } finally { clearTimeout(timeout); }
        const content = await page.getTextContent().catch(() => null);
        const pageHeight = viewport.height / scale;
        return {canvas,content,pageHeight,paperEnd:previewPaperEnd(content,pageHeight,viewport.width/scale)};
      } finally { lease.release(); }
    }, !!signal);
    renderedPages.set(key,record);
    void record.promise.then(() => { record.settled = true; trimRasterCache(); }).catch(() => {
      if (renderedPages.get(key) === record) renderedPages.delete(key);
    });
  }
  record.users++;
  try { return await waitForPdf(record.promise,signal); }
  finally { record.users--; }
}

async function questionCanvas(item, scale, preview = false, signal) {
  signal?.throwIfAborted();
  const source = await renderedPage(item, scale, signal);
  signal?.throwIfAborted();
  const box = preview ? previewQuestionBox(item, source.content, source.pageHeight) : item.displayBox || item.box;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)
    || box[2] <= box[0] || box[3] <= box[1]) throw new Error('문항의 크롭 영역이 올바르지 않습니다.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((box[2] - box[0]) * scale);
  canvas.height = Math.ceil((box[3] - box[1]) * scale);
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source.canvas, -box[0] * scale, -box[1] * scale);
  return preview ? trimPreviewPaper(canvas, scale, box, source.paperEnd) : canvas;
}

export async function renderQuestion(item, scale = 3, { signal } = {}) {
  const canvas = await questionCanvas(item, scale, true, signal);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('문항 이미지를 생성하지 못했습니다.');
  signal?.throwIfAborted();
  return URL.createObjectURL(blob);
}

// ExamPool: 그림 찾기(figures.js)가 픽셀을 직접 보도록 자르지 않은 캔버스를 준다(item.box 영역, 흰 바탕).
export async function renderFigureCanvas(item, scale = 4, { signal } = {}) {
  return questionCanvas(item, scale, false, signal);
}

export async function renderFigureImage(item, scale = 2, { signal } = {}) {
  signal?.throwIfAborted();
  const canvas = await questionCanvas(item, scale, false, signal);
  signal?.throwIfAborted();
  const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  // Remove only white outer paper. Figure labels are retained as ink.
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    const offset = (y * canvas.width + x) * 4;
    if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new Error('문항 영역에서 인쇄된 내용을 찾지 못했습니다.');
  const padding = Math.ceil(3 * scale);
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(canvas.width - 1, right + padding); bottom = Math.min(canvas.height - 1, bottom + padding);
  const cropped = document.createElement('canvas');
  cropped.width = right - left + 1; cropped.height = bottom - top + 1;
  cropped.getContext('2d', { alpha: false }).drawImage(canvas, -left, -top);
  const blob = await new Promise((resolve) => cropped.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('문항 이미지를 생성하지 못했습니다.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  signal?.throwIfAborted();
  return { bytes, width: cropped.width, height: cropped.height };
}

export async function renderFileThumbnail(name) {
  const lease = acquirePdf(name);
  try {
  const doc = await lease.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 240 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.72));
  if (!blob) throw new Error('시험지 미리보기를 생성하지 못했습니다.');
  return URL.createObjectURL(blob);
  } finally { lease.release(); }
}

export async function renderFilePages(name, container, firstPage = 1, isCurrent = () => true, selectedPages = null, { signal } = {}) {
  signal?.throwIfAborted();
  const lease = acquirePdf(name);
  let doc;
  try { doc = await waitForPdf(lease.promise, signal); } catch (error) { lease.release(); throw error; }
  if (!isCurrent()) { lease.release(); return; }
  let stopped = false, running = 0;
  const entries = [], queue = [], visible = new Set(), tasks = new Map();
  for (let number = 1; number <= doc.numPages; number += 1) {
    if (selectedPages && !selectedPages.includes(number)) continue;
    const section = document.createElement('section');
    section.className = 'file-page'; section.dataset.page = String(number);
    const label = document.createElement('span'); label.className = 'file-page-label';
    label.textContent = `${number} / ${doc.numPages}쪽`;
    const canvas = document.createElement('canvas'); canvas.className = 'file-page-canvas';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${name} ${number}쪽 원본`);
    canvas.style.aspectRatio = '0.71'; canvas.width = 1; canvas.height = 1;
    section.append(label, canvas); entries.push(section);
  }
  container.replaceChildren(...entries);
  const target = entries.find(entry => Number(entry.dataset.page) === firstPage) || entries[0];
  if (target) container.scrollTop = target.offsetTop - container.offsetTop;
  function current() { return !stopped && isCurrent(); }
  function releaseRaster(section) {
    const canvas = section.querySelector('canvas');
    if (!canvas) return;
    canvas.width = canvas.height = 1; delete canvas.dataset.rendered;
  }
  function pump() {
    while (current() && running < 2 && queue.length) {
      const section = queue.shift();
      if (!visible.has(section) || tasks.has(section) || section.querySelector('canvas')?.dataset.rendered === 'true') continue;
      running++;
      const canvas = section.querySelector('canvas');
      void (async () => {
        const page = await doc.getPage(Number(section.dataset.page));
        if (!current() || !visible.has(section)) return;
        const base = page.getViewport({scale:1});
        const width = Math.max(1, container.clientWidth - 36);
        const scale = Math.min(2.3, width / base.width * Math.min(devicePixelRatio || 1, 2));
        const viewport = page.getViewport({scale});
        canvas.style.aspectRatio = String(base.width / base.height);
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const task = page.render({canvasContext:canvas.getContext('2d', {alpha:false}),canvas,viewport});
        tasks.set(section,task);
        await task.promise;
        if (current() && visible.has(section)) canvas.dataset.rendered = 'true';
      })().catch(error => {
        if (current() && visible.has(section) && error.name !== 'RenderingCancelledException') {
          const note = section.querySelector('.file-page-error') || document.createElement('span');
          note.className = 'file-page-error'; note.textContent = '페이지를 표시하지 못했습니다. PDF 원본으로 확인해 주세요.';
          section.append(note);
        }
      }).finally(() => {
        tasks.delete(section); running--;
        if (!current() || !visible.has(section)) releaseRaster(section);
        else if (canvas.dataset.rendered !== 'true' && !section.querySelector('.file-page-error')) queue.push(section);
        if (stopped && !running) lease.release();
        pump();
      });
    }
  }
  const observer = new IntersectionObserver(observed => {
    for (const entry of observed) {
      if (entry.isIntersecting && current()) { visible.add(entry.target); queue.push(entry.target); }
      else { visible.delete(entry.target); const task = tasks.get(entry.target); if (task) task.cancel(); else releaseRaster(entry.target); }
    }
    pump();
  }, {root:container,rootMargin:'350px 0px'});
  entries.forEach(entry=>observer.observe(entry));
  const stop = () => {
    if (stopped) return;
    signal?.removeEventListener('abort', stop);
    stopped = true; observer.disconnect(); queue.length = 0; visible.clear();
    for (const task of tasks.values()) task.cancel();
    for (const section of entries) if (!tasks.has(section)) releaseRaster(section);
    if (!running) lease.release();
  };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
