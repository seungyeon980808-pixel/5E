import { normalizedRect } from "./contract.js?v=1.7.0-four-session-integration";

const FOOTER_MIN_Y = 0.85;
const FOOTER_MARKERS = ["문제지에", "저작권", "한국교육과정평가원"];
const CHOICE_LABEL = /^[ㄱ-ㅎ][.)]?$/u;

function wordCenter(word) {
  const rect = normalizedRect(word.rect);
  return [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2];
}

function wordsInside(rect, words) {
  const [x, y, width, height] = normalizedRect(rect);
  const right = x + width;
  const bottom = y + height;
  return (words ?? []).filter((word) => {
    const [centerX, centerY] = wordCenter(word);
    return centerX >= x && centerX <= right && centerY >= y && centerY <= bottom;
  });
}

// 11-12 밤샘: 검색할 때마다 같은 쪽의 아래 경계를 다시 셌다(검색 한 번 CPU 270ms). 같은 낱말 배열이면 저장해 둔 값을 쓴다.
const footerBoundaryCache = new WeakMap();
function footerBoundary(words) {
  if (words && typeof words === 'object') {
    if (footerBoundaryCache.has(words)) return footerBoundaryCache.get(words);
    const value = computeFooterBoundary(words);
    footerBoundaryCache.set(words, value);
    return value;
  }
  return computeFooterBoundary(words);
}
function computeFooterBoundary(words) {
  const footerWords = (words ?? []).filter((word) => {
    const text = String(word.text ?? "").normalize("NFKC");
    return word.rect?.[1] >= FOOTER_MIN_Y && FOOTER_MARKERS.some((marker) => text.includes(marker));
  });
  const markerCount = new Set(footerWords.flatMap((word) => {
    const text = String(word.text ?? "").normalize("NFKC");
    return FOOTER_MARKERS.filter((marker) => text.includes(marker));
  })).size;
  if (markerCount < 2) return null;
  const legalLineY = Math.min(...footerWords.map((word) => word.rect[1]));
  const pageNumbers = (words ?? []).filter((word) =>
    /^\d{1,3}$/u.test(String(word.text ?? "").trim())
    && word.rect?.[1] >= FOOTER_MIN_Y
    && word.rect[1] < legalLineY
    && legalLineY - word.rect[1] <= 0.04);
  const firstFooterY = Math.min(legalLineY, ...pageNumbers.map((word) => word.rect[1]));
  const nearbyHeights = [...footerWords, ...pageNumbers].map((word) => Number(word.rect?.[3]) || 0);
  return firstFooterY - Math.max(0.012, Math.max(...nearbyHeights, 0) * 1.5);
}

export function trimQuestionRectAtFooter(rect, words) {
  const parsed = normalizedRect(rect);
  const boundary = footerBoundary(words);
  const bottom = parsed[1] + parsed[3];
  if (boundary === null || boundary <= parsed[1] || boundary >= bottom) return parsed;
  return normalizedRect([parsed[0], parsed[1], parsed[2], boundary - parsed[1]]);
}

// 11-12: 미리 정한 문항 상자는 쪽 아래 한계에 맞춰 잘려 있어, 마지막 줄(선지 ①~⑤)이 조금 낮으면 글자 아랫부분이
// 잘린 채 미리보기·작업대·시험지로 들어갔다(예: 생명Ⅰ 27년 6평 6번, 줄이 상자 아래로 0.0012 삐져나옴).
// 상자 안에서 시작한 글자 줄이 아래로 삐져나가면 그 줄 끝 + 여백까지 늘린다. 쪽 아래 글(footer)과
// 다음 문항(상자 아래에서 시작하는 줄)은 넘보지 않고, 늘리는 폭은 최대 2%.
export const QUESTION_BOTTOM_PAD = 0.004;
export const QUESTION_MAX_EXTEND = 0.02;
const QUESTION_LINE_MAX_HEIGHT = 0.03;
export function extendQuestionRectToWords(rect, words) {
  const parsed = normalizedRect(rect);
  const [x, y, width, height] = parsed, right = x + width, bottom = y + height;
  const overflowing = (words ?? []).filter((word) => {
    const r = word?.rect;
    return Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[3] > 0
      && r[0] < right && r[0] + r[2] > x && r[1] >= y && r[1] + r[3] > bottom
      // 줄 대부분(가운데)이 상자 안인 것만 — 아래 문항 첫 줄이 살짝 걸친 것·옆 단 세로 띠(「화학」 같은 긴 상자)는 뺀다.
      && r[1] + r[3] / 2 < bottom && r[3] <= QUESTION_LINE_MAX_HEIGHT;
  });
  // 옆 단 띠(「화」「학」「II」가 한 글자씩 세로로 쌓인 것)는 좁고 같은 높이에 다른 글이 없다 — 그런 외톨이 글자는 뺀다.
  // 쪽 아래 「※ 확인 사항」·저작권 줄은 문항 글이 아니다.
  const lines = overflowing.filter((word) => !/확인\s*사항|문제지에|저작권|한국교육과정평가원/u.test(String(word.text ?? "").normalize("NFKC"))).filter((word) => word.rect[2] >= 0.03 || (words ?? []).some((other) => other !== word
    && Array.isArray(other?.rect) && other.rect[0] < right && other.rect[0] + other.rect[2] > x
    && Math.min(other.rect[1] + other.rect[3], word.rect[1] + word.rect[3]) - Math.max(other.rect[1], word.rect[1]) > word.rect[3] / 2));
  if (!lines.length) return parsed;
  const boundary = footerBoundary(words);
  const limit = Math.min(1, bottom + QUESTION_MAX_EXTEND, boundary !== null && boundary > bottom ? boundary : 1);
  const wanted = Math.max(...lines.map((word) => word.rect[1] + word.rect[3])) + QUESTION_BOTTOM_PAD;
  // 상자 아래에서 시작하는 다른 글(다음 줄·다음 문항) 바로 위까지만 — 늘린 자리에 아래 줄 윗부분이 걸치지 않게.
  const below = (words ?? []).filter((word) => Array.isArray(word?.rect) && word.rect[0] < right && word.rect[0] + word.rect[2] > x
    && word.rect[1] >= bottom && !lines.includes(word)).map((word) => word.rect[1] - 0.001);
  const next = Math.min(limit, wanted, ...below);
  return next > bottom ? normalizedRect([x, y, width, next - y]) : parsed;
}

export function isAnswerChoiceBoxCandidate(candidate, words) {
  if ((Number(candidate?.evidence?.imageCount) || 0) > 0 || (Number(candidate?.evidence?.pathCount) || 0) < 4) return false;
  const contained = wordsInside(candidate.source?.rect ?? candidate.rect, words);
  const compact = contained.map((word) => String(word.text ?? "").normalize("NFKC")).join("").replace(/\s+/gu, "");
  const choiceCount = new Set(contained.map((word) => String(word.text ?? "").normalize("NFC").trim())
    .filter((text) => CHOICE_LABEL.test(text))).size;
  return compact.includes("<보기>") && choiceCount >= 2 && contained.length >= 6;
}

export function trimImageCandidateAtExternalCaption(candidate, words) {
  const rect = normalizedRect(candidate?.source?.rect ?? candidate?.rect);
  if ((Number(candidate?.evidence?.imageCount) || 0) < 1) return rect;
  const rawGraphicRect = candidate?.evidence?.graphicRect
    ? normalizedRect(candidate.evidence.graphicRect)
    : null;
  if (!rawGraphicRect) return rect;
  const [x, y, width, height] = rect;
  const right = x + width;
  const bottom = y + height;
  const lowerBand = y + height * 0.6;
  const horizontalWords = (words ?? []).map((word) => normalizedRect(word.rect)).filter((wordRect) =>
    wordRect[0] < right && wordRect[0] + wordRect[2] > x && wordRect[1] + wordRect[3] > lowerBand);
  const overflow = horizontalWords.filter((wordRect) => wordRect[1] < bottom && wordRect[1] + wordRect[3] > bottom);
  if (overflow.length === 0) return rect;
  let captionTop = Math.min(...overflow.map((wordRect) => wordRect[1]));
  const overflowBottom = Math.max(...overflow.map((wordRect) => wordRect[1] + wordRect[3]));
  let hasAdjacentLine = horizontalWords.some((wordRect) => {
    const gap = wordRect[1] - overflowBottom;
    return gap > 0 && gap <= Math.max(wordRect[3], 0.002) * 0.75;
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const wordRect of horizontalWords) {
      const gap = captionTop - (wordRect[1] + wordRect[3]);
      if (wordRect[1] >= captionTop || gap < 0 || gap > Math.max(wordRect[3], 0.002) * 0.75) continue;
      captionTop = wordRect[1];
      hasAdjacentLine = true;
      changed = true;
    }
  }
  if (!hasAdjacentLine || captionTop <= lowerBand) return rect;
  const protectedRect = candidate?.evidence?.protectedRect
    ? normalizedRect(candidate.evidence.protectedRect)
    : rawGraphicRect;
  const protectedBottom = protectedRect[1] + protectedRect[3];
  const repairedBottom = Math.max(protectedBottom, captionTop);
  if (repairedBottom >= bottom) return rect;
  return normalizedRect([x, y, width, repairedBottom - y]);
}

export function textBeforeFooter(text, words) {
  if (footerBoundary(words) === null) return String(text ?? "");
  return String(text ?? "")
    .replace(/\s*이\s+문제지에\s+관한\s+저작권은[\s\S]*$/u, "")
    .replace(/^\s*\d{1,3}\s+(?=\d{1,2}\.)/u, "")
    .trim();
}
