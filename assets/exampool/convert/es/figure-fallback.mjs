import { readQuestionPdf, renderFigureImage } from './pdf-viewer.mjs?v=library-release-20261011-3';
import { drawingPrimitives, figureRegions, textItemBox, insideFigure } from './pdf-drawings.mjs?v=readability-20261004-4';

const validBox = (box) => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite)
  && box[2] > box[0] && box[3] > box[1];

/** Removing optional images must not remove the native text beside them. */
export function withoutFigures(prepared) {
  if (!Array.isArray(prepared.blocks)) return prepared;
  return { ...prepared,
    ...(Array.isArray(prepared.notes) ? { notes: prepared.notes.filter((note) => !/영역만 원본 이미지로 넣었습니다/u.test(note)) } : {}),
    blocks: prepared.blocks.flatMap((block) => {
    if (block.kind === 'figure') return [];
    if (block.kind === 'table' && Array.isArray(block.rows)) return [{ ...block,
      rows: block.rows.map((row) => row.map((runs) => Array.isArray(runs) ? runs.filter((run) => run?.kind !== 'figure') : runs)) }];
    if (!Array.isArray(block.runs)) return [block];
    return [{ ...block, runs: block.runs.filter((run) => run?.kind !== 'figure') }];
  }) };
}

function aborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason?.name === 'AbortError') throw signal.reason;
  throw new DOMException('문서 생성을 취소했습니다.', 'AbortError');
}

// A PDF renderer may ignore abort while awaiting a font or image. Racing it keeps an
// optional illustration from holding the native document indefinitely.
async function boundedFigureTask(task, dependencies) {
  aborted(dependencies.signal);
  const controller = new AbortController();
  const timeout = Number.isFinite(dependencies.figureTimeoutMs)
    ? Math.max(1, dependencies.figureTimeoutMs) : 8000;
  let timer, onAbort;
  const stop = new Promise((_, reject) => {
    onAbort = () => {
      const error = dependencies.signal?.reason?.name === 'AbortError' ? dependencies.signal.reason
        : new DOMException('문서 생성을 취소했습니다.', 'AbortError');
      controller.abort(error);
      reject(error);
    };
    dependencies.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new DOMException(`그림 처리 시간이 ${timeout / 1000}초를 초과했습니다.`, 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, timeout);
  });
  try { return await Promise.race([Promise.resolve().then(() => task(controller.signal)), stop]); }
  finally {
    clearTimeout(timer);
    dependencies.signal?.removeEventListener('abort', onAbort);
  }
}

function validateFigureBox(figure, question) {
  const parent = figure.sourceBox || question.box;
  if (!validBox(figure.box) || !validBox(parent) || figure.box.some((v, i) => i < 2 ? v < parent[i] : v > parent[i])
    || (figure.box[2] - figure.box[0]) * (figure.box[3] - figure.box[1]) >= (parent[2] - parent[0]) * (parent[3] - parent[1]) * .85) {
    throw new Error('그림 크롭이 문항 전체 또는 원본 영역 밖을 포함합니다.');
  }
  return parent;
}

function validateImage(image) {
  if (!(image?.bytes instanceof Uint8Array) || !image.bytes.length || !Number.isFinite(image.width)
    || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) throw new Error('그림을 읽지 못했습니다.');
}

/** A crop must be a drawing region, never a substitute for the complete question. */
export function questionFigures(question, pdf, regions) {
  if (!validBox(question.box)) return [];
  if (!regions) regions = pdf.operations && pdf.OPS
    ? figureRegions(drawingPrimitives(pdf.operations, pdf.OPS, pdf.pageHeight), pdf.content.items, pdf.pageHeight) : [];
  const source = question.box;
  const hasProse = (box, owners) => pdf.content.items.some((item) => {
    if (!item.str?.trim() || !item.transform || insideFigure(item, owners, pdf.pageHeight)) return false;
    const b = textItemBox(item, pdf.pageHeight)?.box;
    if (!b) return false;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return cx > box[0] && cx < box[2] && cy > box[1] && cy < box[3]
      && (/^\s*(?:\d{1,2}\.|[ㄱㄴㄷ]\.|[①②③④⑤]|[<〈]\s*보)/u.test(item.str)
        || (item.str.match(/[가-힣]/gu) || []).length >= 12);
  });
  const found = regions.flatMap((region) => {
    const box = region.box.map((value, index) => index < 2
      ? Math.max(source[index], value - 2) : Math.min(source[index], value + 2));
    const center = [(region.ink[0] + region.ink[2]) / 2, (region.ink[1] + region.ink[3]) / 2];
    if (!validBox(box) || center[0] < source[0] || center[0] > source[2]
      || center[1] < source[1] || center[1] > source[3]
      || (box[2] - box[0]) * (box[3] - box[1]) >= (source[2] - source[0]) * (source[3] - source[1]) * .85) return [];
    // Bounding boxes can span disjoint artwork. Reject a crop that would duplicate running prose.
    const prose = hasProse(box, [region]);
    return prose ? [] : [{ box, page: question.page, sourceBox: [...source], kind: region.kind }];
  });
  // Adjacent panels of one illustration retain their printed arrangement in one small crop.
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < found.length; i += 1) for (let j = i + 1; j < found.length; j += 1) {
      const a = found[i].box, b = found[j].box;
      const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      const gap = Math.max(0, a[0] - b[2], b[0] - a[2]);
      const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
      if (overlap < Math.min(a[3] - a[1], b[3] - b[1]) * .35 || gap > (source[2] - source[0]) * .25
        || hasProse(box, regions) || (box[2] - box[0]) * (box[3] - box[1]) >= (source[2] - source[0]) * (source[3] - source[1]) * .85) continue;
      found[i] = { ...found[i], box };
      found.splice(j, 1); changed = true; break outer;
    }
  }
  return found.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]).flatMap((figure) => {
    if (!pdf.figureSourceRegions) return [figure];
    const [x, y] = [(figure.box[0] + figure.box[2]) / 2, (figure.box[1] + figure.box[3]) / 2];
    const origin = pdf.figureSourceRegions.find(({ flowBox }) => x >= flowBox[0] && x <= flowBox[2] && y >= flowBox[1] && y <= flowBox[3]);
    if (!origin) return [];
    const box = figure.box.map((v, index) => v - (index % 2 ? origin.dy : origin.dx));
    return [{ ...figure, flowBox: figure.box, box, page: origin.page || question.page, sourceBox: origin.sourceBox }];
  });
}

/** Attach small figure controls between native text blocks. No whole-question image fallback. */
export async function restoreFigures(question, prepared, dependencies = {}) {
  aborted(dependencies.signal);
  const bestEffort = dependencies.bestEffort === true;
  if (!validBox(question.box)) {
    if (!bestEffort) return prepared;
    const native = withoutFigures(prepared);
    const hasImages = prepared.figureFallbacks?.length || prepared.blocks?.some((block) => block.kind === 'figure'
      || block.runs?.some((run) => run?.kind === 'figure'));
    return { ...native, notes: [...(native.notes || []),
      ...(hasImages ? ['그림·도표를 제외했습니다: 원본 문항의 그림 크롭 범위를 확인할 수 없습니다.'] : [])] };
  }
  const notes = [...(prepared.notes || [])];
  const excluded = (reason, index) => notes.push(`그림·도표${index ? ` ${index}번을` : '를'} 제외했습니다: ${reason instanceof Error ? reason.message : String(reason)}`);
  // Even an already embedded image is optional. Validate it separately so one corrupt
  // prepared illustration cannot invalidate the native question.
  if (bestEffort && Array.isArray(prepared.blocks)) prepared = { ...prepared, blocks: prepared.blocks.flatMap((block) => {
    if (block.kind !== 'figure') {
      if (!block.runs?.some((run) => run?.kind === 'figure')) return [block];
      excluded('독립된 그림 영역이 아닌 본문 속 그림 객체입니다.');
      return [{ ...block, runs: block.runs.filter((run) => run?.kind !== 'figure') }];
    }
    try {
      if (block.runs?.length !== 1 || block.runs[0]?.kind !== 'figure') throw new Error('잘못된 그림 영역입니다.');
      const run = block.runs[0];
      validateFigureBox({ box: run.sourceBox }, question);
      validateImage(run.image);
      return [block];
    } catch (error) { excluded(error); return []; }
  }) };
  let figures = prepared.figureFallbacks;
  if (!figures) {
    try {
      dependencies.onPhase?.('그림·도표 영역을 찾는 중');
      const detect = async (signal) => {
        const pdf = await (dependencies.readQuestionPdf || readQuestionPdf)(question, { signal });
        return questionFigures(question, pdf);
      };
      figures = bestEffort ? await boundedFigureTask(detect, dependencies) : await detect(dependencies.signal);
    } catch (error) {
      aborted(dependencies.signal);
      if (!bestEffort) throw error;
      excluded(error);
      return { ...prepared, notes };
    }
  }
  if (!Array.isArray(figures)) {
    if (!bestEffort) throw new Error('잘못된 그림 영역 목록입니다.');
    excluded('잘못된 그림 영역 목록입니다.');
    return { ...prepared, notes };
  }
  const additions = new Map();
  const fallback = prepared.blocks.findIndex((block) => ['ask', 'bogi', 'choice'].includes(block.role));
  let restored = 0;
  for (const [index, figure] of figures.entries()) {
    aborted(dependencies.signal);
    try {
      dependencies.onPhase?.(`그림 처리 ${index + 1} / ${figures.length}개`);
      // Validate descriptors as well as detected regions (prepared JSON may be externally supplied).
      const parent = validateFigureBox(figure, question);
      const render = (signal) => (dependencies.renderFigure || renderFigureImage)({ ...question,
        page: figure.page || question.page, box: figure.box, displayBox: figure.box }, 2, { signal });
      const image = bestEffort ? await boundedFigureTask(render, dependencies) : await render(dependencies.signal);
      aborted(dependencies.signal);
      validateImage(image);
      let at = Number.isInteger(figure.afterBlock) ? Math.min(prepared.blocks.length, Math.max(0, figure.afterBlock + 1))
        : fallback < 0 ? prepared.blocks.length : fallback;
      // Side illustrations finish beside the question sentence; do not split that sentence or 보기.
      if (['ask', 'bogi'].includes(prepared.blocks[at - 1]?.role)) {
        const role = prepared.blocks[at - 1].role;
        while (at > 0 && prepared.blocks[at - 1]?.role === role) at -= 1;
      }
      const block = { kind: 'figure', role: 'figure', label: '',
        runs: [{ kind: 'figure', image, scale: 2, sourceColumnWidth: parent[2] - parent[0], sourceBox: figure.box, sourcePage: figure.page || question.page }] };
      additions.set(at, [...(additions.get(at) || []), block]);
      restored += 1;
    } catch (error) {
      aborted(dependencies.signal);
      if (!bestEffort) throw error;
      excluded(error, index + 1);
      // A renderer that has stalled once is usually waiting on a shared PDF resource.
      // Finish the native question now instead of repeating the timeout for every crop.
      if (error?.name === 'TimeoutError') {
        const remaining = figures.length - index - 1;
        if (remaining) notes.push(`그림 처리가 지연되어 남은 그림·도표 ${remaining}개를 제외했습니다.`);
        break;
      }
    }
  }
  const blocks = prepared.blocks.flatMap((block, index) => [...(additions.get(index) || []), block]);
  blocks.push(...(additions.get(prepared.blocks.length) || []));
  return { ...prepared, blocks, notes: [...notes.filter((note) => !restored || !/그림·도표는 생략/u.test(note)),
    ...(restored ? [`편집 객체로 복원하지 못한 그림·도표 ${restored}개 영역만 원본 이미지로 넣었습니다.`] : [])] };
}
