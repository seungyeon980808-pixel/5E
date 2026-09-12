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

export function textBeforeFooter(text, words) {
  if (footerBoundary(words) === null) return String(text ?? "");
  return String(text ?? "")
    .replace(/\s*이\s+문제지에\s+관한\s+저작권은[\s\S]*$/u, "")
    .replace(/^\s*\d{1,3}\s+(?=\d{1,2}\.)/u, "")
    .trim();
}
