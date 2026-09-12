import { createCropSource, normalizedRect } from "./contract.js";
import { isAnswerChoiceBoxCandidate } from "./page-geometry.js";

const FIGURE_SCHEMA = "pdf-figure-candidates-v1";
const IMAGE_OPERATORS = [
  "paintImageXObject", "paintInlineImageXObject", "paintImageMaskXObject",
  "paintImageXObjectRepeat", "paintImageMaskXObjectRepeat", "paintImageMaskXObjectGroup",
];

function rectangleFromPoints(points, pageWidth, pageHeight) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.max(0, Math.min(...xs));
  const right = Math.min(pageWidth, Math.max(...xs));
  const bottom = Math.max(0, Math.min(...ys));
  const top = Math.min(pageHeight, Math.max(...ys));
  if (right <= left || top <= bottom) return null;
  return [left / pageWidth, (pageHeight - top) / pageHeight, (right - left) / pageWidth, (top - bottom) / pageHeight];
}

function transformedRectangle(pdfjs, matrix, bounds, pageWidth, pageHeight) {
  const [x0, y0, x1, y1] = bounds;
  const transformPoint = (point) => {
    pdfjs.Util.applyTransform(point, matrix);
    return point;
  };
  return rectangleFromPoints([
    transformPoint([x0, y0]), transformPoint([x1, y0]),
    transformPoint([x0, y1]), transformPoint([x1, y1]),
  ], pageWidth, pageHeight);
}

export async function collectPageGraphicMarks({ pdfjs, page }) {
  const viewport = page.getViewport({ scale: 1 });
  const operators = await page.getOperatorList();
  const frames = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let lineWidth = 1;
  const marks = [];
  const imageIds = new Set(IMAGE_OPERATORS.map((name) => pdfjs.OPS[name]).filter(Number.isInteger));
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operator = operators.fnArray[index];
    const args = operators.argsArray[index];
    if (operator === pdfjs.OPS.save) frames.push({ matrix: matrix.slice(), lineWidth });
    else if (operator === pdfjs.OPS.restore) {
      const frame = frames.pop();
      if (frame) { matrix = frame.matrix; lineWidth = frame.lineWidth; }
    }
    else if (operator === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
    else if (operator === pdfjs.OPS.setLineWidth) lineWidth = Math.max(Number(args?.[0]) || 0, 0.25);
    else if (operator === pdfjs.OPS.paintFormXObjectBegin || operator === pdfjs.OPS.beginGroup) {
      frames.push({ matrix: matrix.slice(), lineWidth });
      const transform = operator === pdfjs.OPS.beginGroup ? args?.[0]?.matrix : args?.[0];
      if (transform) matrix = pdfjs.Util.transform(matrix, transform);
    } else if (operator === pdfjs.OPS.paintFormXObjectEnd || operator === pdfjs.OPS.endGroup) {
      const frame = frames.pop();
      if (frame) { matrix = frame.matrix; lineWidth = frame.lineWidth; }
    } else if (imageIds.has(operator)) {
      const rect = transformedRectangle(pdfjs, matrix, [0, 0, 1, 1], viewport.width, viewport.height);
      if (rect) marks.push(Object.freeze({ kind: "image", rect: normalizedRect(rect) }));
    } else if (operator === pdfjs.OPS.constructPath && args?.[2]) {
      const bounds = args[2];
      const halfLine = lineWidth / 2;
      const rect = transformedRectangle(pdfjs, matrix, [
        bounds[0] - (bounds[0] === bounds[2] ? halfLine : 0), bounds[1] - (bounds[1] === bounds[3] ? halfLine : 0),
        bounds[2] + (bounds[0] === bounds[2] ? halfLine : 0), bounds[3] + (bounds[1] === bounds[3] ? halfLine : 0),
      ], viewport.width, viewport.height);
      if (rect) marks.push(Object.freeze({ kind: "path", rect: normalizedRect(rect) }));
    }
  }
  return Object.freeze(marks);
}

function intersection(left, right) {
  const x = Math.max(left[0], right[0]);
  const y = Math.max(left[1], right[1]);
  const rightEdge = Math.min(left[0] + left[2], right[0] + right[2]);
  const bottomEdge = Math.min(left[1] + left[3], right[1] + right[3]);
  return rightEdge > x && bottomEdge > y ? [x, y, rightEdge - x, bottomEdge - y] : null;
}

function union(rectangles) {
  const x = Math.min(...rectangles.map((rect) => rect[0]));
  const y = Math.min(...rectangles.map((rect) => rect[1]));
  const right = Math.max(...rectangles.map((rect) => rect[0] + rect[2]));
  const bottom = Math.max(...rectangles.map((rect) => rect[1] + rect[3]));
  return [x, y, right - x, bottom - y];
}

function expandedWithin(rect, bounds, marginX, marginY) {
  const x = Math.max(bounds[0], rect[0] - marginX);
  const y = Math.max(bounds[1], rect[1] - marginY);
  const right = Math.min(bounds[0] + bounds[2], rect[0] + rect[2] + marginX);
  const bottom = Math.min(bounds[1] + bounds[3], rect[1] + rect[3] + marginY);
  return [x, y, right - x, bottom - y];
}

function nearby(left, right, gapX, gapY) {
  return left[0] <= right[0] + right[2] + gapX && right[0] <= left[0] + left[2] + gapX
    && left[1] <= right[1] + right[3] + gapY && right[1] <= left[1] + left[3] + gapY;
}

function clusterMarks(marks, gapX, gapY) {
  const clusters = [];
  for (const mark of marks) {
    const touching = clusters.filter((cluster) => nearby(union(cluster.map((entry) => entry.rect)), mark.rect, gapX, gapY));
    if (touching.length === 0) clusters.push([mark]);
    else {
      const merged = [mark, ...touching.flat()];
      for (const cluster of touching) clusters.splice(clusters.indexOf(cluster), 1);
      clusters.push(merged);
    }
  }
  return clusters;
}

function fallback(documentId, pageNumber, item) {
  if (item) return Object.freeze({ kind: "question", source: item.source ?? createCropSource({ documentId, pageNumber, rect: item.rect, fullPageFallback: false }) });
  return Object.freeze({ kind: "page", source: createCropSource({ documentId, pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true }) });
}

export function detectFigureCandidates(input) {
  const documentId = input.item?.documentId ?? input.documentId;
  const pageNumber = input.item?.pageNumber ?? input.pageNumber;
  const safeFallback = fallback(documentId, pageNumber, input.item);
  if (!input.item) return Object.freeze({ schemaVersion: FIGURE_SCHEMA, candidates: Object.freeze([]), fallback: safeFallback, reason: "missing-question-boundary" });
  const itemRect = normalizedRect(input.item.rect);
  const contained = [];
  for (const mark of input.marks ?? []) {
    const rect = normalizedRect(mark.rect);
    const clipped = intersection(rect, itemRect);
    if (!clipped || clipped[2] * clipped[3] < rect[2] * rect[3] * 0.96) continue;
    contained.push(Object.freeze({ kind: mark.kind, rect: clipped }));
  }
  const gapX = 18 / input.pageWidthPoints;
  const gapY = 18 / input.pageHeightPoints;
  const marginX = 6 / input.pageWidthPoints;
  const marginY = 6 / input.pageHeightPoints;
  const candidates = clusterMarks(contained, gapX, gapY).map((cluster) => {
    const graphicRect = union(cluster.map((mark) => mark.rect));
    const imageCount = cluster.filter((mark) => mark.kind === "image").length;
    const pathCount = cluster.length - imageCount;
    if ((imageCount === 0 && pathCount < 3) || graphicRect[2] * input.pageWidthPoints < 32 || graphicRect[3] * input.pageHeightPoints < 32) return null;
    if (graphicRect[2] * graphicRect[3] > itemRect[2] * itemRect[3] * 0.85) return null;
    const attachmentArea = expandedWithin(graphicRect, itemRect, marginX, marginY);
    const attachedWords = (input.words ?? []).map((word) => normalizedRect(word.rect)).filter((rect) => {
      const clipped = intersection(rect, itemRect);
      return clipped && clipped[2] * clipped[3] >= rect[2] * rect[3] * 0.96 && intersection(rect, attachmentArea);
    });
    const contentRect = attachedWords.length ? union([graphicRect, ...attachedWords]) : graphicRect;
    const rect = expandedWithin(contentRect, itemRect, marginX, marginY);
    const candidate = { rect, source: { rect }, evidence: { imageCount, pathCount } };
    return isAnswerChoiceBoxCandidate(candidate, input.words) ? null : { rect, imageCount, pathCount };
  }).filter(Boolean).sort((left, right) => left.rect[1] - right.rect[1] || left.rect[0] - right.rect[0]);
  const records = candidates.map((candidate, index) => Object.freeze({
    kind: "figure-candidate-v1", id: `${input.item.id}:figure:${index + 1}`, candidateNumber: index + 1,
    documentId, pageNumber, itemId: input.item.id, itemNumber: input.item.itemNumber,
    rect: normalizedRect(candidate.rect), source: createCropSource({ documentId, pageNumber, rect: candidate.rect, fullPageFallback: false }),
    evidence: Object.freeze({ imageCount: candidate.imageCount, pathCount: candidate.pathCount }),
  }));
  return Object.freeze({
    schemaVersion: FIGURE_SCHEMA, candidates: Object.freeze(records), fallback: safeFallback,
    reason: records.length === 0 ? "no-confident-graphics" : null,
  });
}

export async function detectPageFigureCandidates({ pdfjs, page, pageRecord, item }) {
  const marks = await collectPageGraphicMarks({ pdfjs, page });
  return detectFigureCandidates({ item, marks, words: pageRecord.words, pageWidthPoints: pageRecord.widthPoints, pageHeightPoints: pageRecord.heightPoints });
}
