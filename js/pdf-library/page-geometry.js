import { normalizedRect } from "./contract.js";

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

function footerBoundary(words) {
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
