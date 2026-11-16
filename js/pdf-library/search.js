import { createCropSource } from "./contract.js?v=1.7.0-four-session-integration";
import { deriveExamMetadata } from "../library/exam-code.js?v=1.7.0-four-session-integration";
export { applyItemCorrections, resolveItemOrPageResult } from "./corrections.js?v=1.7.0-four-session-integration";

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

// 11-08: 검색마다 8천여 쪽 본문을 처음부터 다시 정규화하던 것을 쪽(entry)마다 한 번만 하고 재사용한다.
const searchableCache = new WeakMap();
function searchableText(entry) {
  let value = searchableCache.get(entry);
  if (value === undefined) {
    value = normalizedText(entry.normalized ?? entry.text).replace(/\s+/gu, "");
    searchableCache.set(entry, value);
  }
  return value;
}
const wordRunsCache = new WeakMap();

const BASE_HIGHLIGHT_COLORS = Object.freeze(["#ffcf4a", "#5fd3ff", "#ff7ab8", "#83e377", "#b59cff", "#ff9866", "#63e6be", "#f783ff"]);

function stableTermId(term) {
  let hash = 2166136261;
  for (const character of term) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return `term-${(hash >>> 0).toString(36)}`;
}

export function queryHighlightTerms(query) {
  const labels = new Map();
  for (const raw of normalizedText(query).match(/[\p{L}\p{N}]+/gu) ?? []) {
    const term = raw.replace(/\s+/gu, "");
    if (term && !labels.has(term)) labels.set(term, raw);
  }
  const ordered = [...labels.keys()].sort((left, right) => left.localeCompare(right, "ko"));
  const colors = new Map(ordered.map((term, index) => [term, BASE_HIGHLIGHT_COLORS[index] ?? `hsl(${Math.round((index * 137.508) % 360)}deg ${68 + index % 3 * 4}% ${48 + index % 4 * 3}%)`]));
  return Object.freeze([...labels].map(([term, label]) => Object.freeze({ termId: stableTermId(term), term, label, color: colors.get(term) })));
}

export function mapQueryHighlights(entry, queryOrTerms) {
  const terms = Array.isArray(queryOrTerms) ? queryOrTerms : queryHighlightTerms(queryOrTerms);
  // 11-12: 검색어가 없으면(과목 칩만 누름) 형광도 없다 — 문항마다 낱말 줄을 다시 세던 것(칩 한 번에 수십 ms)을 건너뛴다.
  if (!terms.length) return Object.freeze({ terms, highlights: Object.freeze([]), misses: Object.freeze([]) });
  const runs = entryWordRuns(entry);
  return highlightsFromRuns(entry, terms, runs);
}

// 11-11 사용자 「색인 위치가 부정확하다」: 낱말 상자를 글자마다 폭 비율(한글 1, 띄어쓰기 0.33, 문장부호 0.35 …)로 나눠
// 띄어쓰기를 뺀 글자 i의 왼쪽·오른쪽 끝을 낱말 폭 대비 비율로 돌려준다.
// 1.7.1(B16): 영문 대문자를 0.55로 보면 좁아 그 뒤 글자 형광이 왼쪽으로 쏠렸다(학평 실측 약 0.75~0.8) — 대문자·소문자·숫자를 나눈다.
const characterWidth = (ch) => /\s/u.test(ch) ? 0.33
  : /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3\u3000-\u9fff\uff00-\uffef]/u.test(ch) ? 1
  : /[A-Z]/.test(ch) ? 0.75 : /[a-z]/.test(ch) ? 0.5 : /[0-9]/.test(ch) ? 0.55
  : /[.,:;'"!?·()\[\]{}<>~\-]/.test(ch) ? 0.35 : 0.6;
// hangulUnits(선택) = 이 덩어리 폭을 한글 한 칸 폭으로 잰 값. 주면 띄어쓰기 폭을 고정값(0.33) 대신 「남는 폭 ÷ 띄어쓰기 수」로 푼다
// — 평가원 시험지는 양쪽 맞춤이라 줄마다 띄어쓰기 폭이 0.1~1칸으로 달라, 고정값으로는 줄 뒤쪽 낱말 형광이 반 칸씩 밀렸다.
function characterEdges(full, hangulUnits) {
  const chars = [...full];
  const spaces = chars.filter((ch) => /\s/u.test(ch)).length;
  const glyphUnits = chars.reduce((sum, ch) => sum + (/\s/u.test(ch) ? 0 : characterWidth(ch)), 0);
  const solved = Number.isFinite(hangulUnits) && hangulUnits > 0 && spaces
    ? Math.min(1.5, Math.max(0.12, (hangulUnits - glyphUnits) / spaces)) : null;
  const widthOf = (ch) => /\s/u.test(ch) ? solved ?? characterWidth(ch) : characterWidth(ch);
  const total = chars.reduce((sum, ch) => sum + widthOf(ch), 0) || 1;
  const left = [], right = []; let at = 0;
  for (const ch of chars) { const w = widthOf(ch); if (!/\s/u.test(ch)) { left.push(at / total); right.push((at + w) / total); } at += w; }
  return { left, right };
}

// 1.7.1(B16): 낱말 상자가 글자와 어긋나는 모양이 출처마다 다르다(1.7.0 미리보기 실측, 2단계 BL5 보고서).
// - 학평(맥 Vision OCR): 상자 위는 글자 위와 맞고 아래가 글자보다 약 0.25칸 더 내려가 형광이 아래로 처진다.
// - 그 밖(PDF 글자층, js/pdf-library/pdf-runtime.js pageWordRecords): 상자가 「기준선 - 글자 크기」부터 글자 크기만큼이라
//   한글 잉크(기준선 아래로 조금 내려옴)보다 위로 떠 있다. 또 한 글자 덩어리(item) 안 낱말 위치를 글자 수 비율로 잘라
//   「B와 자석」처럼 앞에 좁은 글자·띄어쓰기가 있으면 뒤 낱말 상자가 오른쪽으로 밀려 있다.
const OCR_DOCUMENT_PREFIXES = Object.freeze(["5e.hakpyeong::"]);
const isOcrWordSource = (entry) => OCR_DOCUMENT_PREFIXES.some((prefix) => String(entry?.documentId ?? "").startsWith(prefix));
// 상자 보정(단위 = 상자 높이): 위 끝을 top만큼 내리고 높이를 height배로 — 잉크 위아래에 약 0.06칸 여백이 남게.
// 학평 OCR 상자는 가로로도 잉크보다 왼쪽에서 약 0.45칸 먼저 시작하고 오른쪽은 0.15칸 모자라(자르기·쪽 보기 모두 같음)
// 왼 끝을 left만큼 오른쪽으로, 폭을 trim만큼 줄인다. 높이 단위를 가로 비율로 바꿀 때 학평 쪽(A4·B4) 세로÷가로 √2를 쓴다.
const BOX_FIT = Object.freeze({
  ocr: Object.freeze({ top: -0.03, height: 0.84, left: 0.4, trim: 0.18, aspect: Math.SQRT2 }),
  pdf: Object.freeze({ top: 0.12, height: 1.05, left: 0, trim: 0, aspect: 1 }),
});

// PDF 글자층 낱말을 한 덩어리(item)로 다시 묶는다: 같은 덩어리에서 나온 낱말은 y·높이가 같고 「폭 ÷ 글자 수」가 같으며
// 낱말 사이 틈이 그 단위의 정수배(띄어쓰기 수)다. 묶은 덩어리 전체 폭을 글자별 폭 비율로 다시 나눈다.
function sameItemSpaces(previous, word) {
  const [px, py, pw, ph] = previous.rect, [x, y, w, h] = word.rect;
  const pu = pw / previous.characters.length, u = w / word.characters.length;
  const tolerance = 0.00025;
  if (Math.abs(py - y) > tolerance || Math.abs(ph - h) > tolerance) return 0;
  if (Math.abs(pu - u) > tolerance + Math.max(pu, u) * 0.01) return 0;
  const spaces = (x - (px + pw)) / u, rounded = Math.round(spaces);
  return rounded >= 1 && rounded <= 3 && Math.abs(spaces - rounded) <= 0.2 ? rounded : 0;
}

// 한글 한 칸 폭 ÷ 상자 높이: 같은 문서(같은 글꼴·크기 비율) 안에서는 거의 일정하다(평가원 색인 244문서, 문서 안 흩어짐 0.3%).
// 띄어쓰기가 없는 3글자 이상·한글 위주 덩어리에서 재어 이 쪽(문항)의 가운데값을 쓴다. 잴 덩어리가 없으면 null(고정 폭으로).
function hangulWidthPerHeight(groups) {
  const samples = [];
  for (const { full, width, height } of groups) {
    const chars = [...full];
    if (chars.length < 3 || /\s/u.test(full) || !(height > 0)) continue;
    const hangul = chars.filter((ch) => /[\uac00-\ud7a3]/u.test(ch)).length;
    if (hangul / chars.length < 0.6) continue;
    samples.push(width / height / chars.reduce((sum, ch) => sum + characterWidth(ch), 0));
  }
  if (!samples.length) return null;
  samples.sort((left, right) => left - right);
  return samples[samples.length >> 1];
}

function assignCharacterEdges(words, ocr) {
  if (ocr) { for (const word of words) word.edges = characterEdges(word.full); return; }
  const groups = [];
  for (const word of words) {
    const group = groups.at(-1), spaces = group ? sameItemSpaces(group.words.at(-1), word) : 0;
    if (spaces) { group.words.push(word); group.gaps.push(spaces); } else groups.push({ words: [word], gaps: [] });
  }
  for (const group of groups) {
    const first = group.words[0], last = group.words.at(-1);
    group.left = first.rect[0]; group.width = last.rect[0] + last.rect[2] - group.left; group.height = first.rect[3];
    group.full = group.words.map((word, index) => (index ? " ".repeat(group.gaps[index - 1]) : "") + word.full).join("");
  }
  const ratio = hangulWidthPerHeight(groups);
  for (const group of groups) {
    const edges = characterEdges(group.full, ratio ? group.width / (ratio * group.height) : undefined);
    let at = 0;
    for (const word of group.words) {
      const count = word.characters.length, [x, , width] = word.rect;
      const toWord = (value) => (group.left + group.width * value - x) / width;
      word.edges = { left: edges.left.slice(at, at + count).map(toWord), right: edges.right.slice(at, at + count).map(toWord) };
      at += count;
    }
  }
}

function entryWordRuns(entry) {
  // 11-12: 부르는 쪽(provider.js)이 검색마다 새 entry 객체를 만들어 캐시가 늘 빗나갔다 — 바뀌지 않는 낱말 배열을 열쇠로.
  const cacheKey = Array.isArray(entry?.words) ? entry.words : entry;
  const cached = cacheKey && typeof cacheKey === "object" ? wordRunsCache.get(cacheKey) : undefined;
  if (cached) return cached;
  const ocr = isOcrWordSource(entry);
  const words = (entry.words ?? []).flatMap((word) => {
    const full = normalizedText(word.text);
    const text = full.replace(/\s+/gu, "");
    // 폭은 대소문자를 살린 글로 잰다(검색용 글은 소문자라 대문자 폭이 사라졌다). 글자 수가 달라지면 소문자 글로.
    const cased = String(word.text ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
    return text ? [{ text, full: [...cased].length === [...full].length ? cased : full, characters: [...text], rect: word.rect }] : [];
  });
  assignCharacterEdges(words, ocr);
  const runs = [];
  for (const word of words) {
    const previous = runs.at(-1)?.words.at(-1);
    const horizontalGap = previous ? word.rect[0] - (previous.rect[0] + previous.rect[2]) : Infinity;
    const maximumAdjacentGap = previous ? Math.max(
      previous.rect[2] / previous.characters.length,
      word.rect[2] / word.characters.length,
    ) * 2.5 : 0;
    const sameLine = previous
      && Math.abs((previous.rect[1] + previous.rect[3] / 2) - (word.rect[1] + word.rect[3] / 2)) <= Math.max(previous.rect[3], word.rect[3]) * 0.65
      && horizontalGap >= -Math.max(previous.rect[2], word.rect[2]) * 0.1
      && horizontalGap <= maximumAdjacentGap;
    if (!sameLine) runs.push({ words: [], stream: "", offsets: [], length: 0 });
    const run = runs.at(-1);
    // 11-08: 줄 글자 수를 매번 처음부터 세던 것(단어마다 [...stream])을 누적 수로 — 긴 줄에서 제곱으로 느려졌다.
    const start = run.length;
    run.words.push(word);
    run.stream += word.text;
    run.length += word.characters.length;
    run.offsets.push({ word, start, end: start + word.characters.length });
  }
  runs.fit = ocr ? BOX_FIT.ocr : BOX_FIT.pdf;
  if (cacheKey && typeof cacheKey === "object") wordRunsCache.set(cacheKey, runs);
  return runs;
}

function highlightsFromRuns(entry, terms, runs) {
  const highlights = [];
  const misses = [];
  const fit = runs.fit ?? BOX_FIT.pdf;
  for (const term of terms) {
    let found = false;
    const termLength = [...term.term].length;
    for (const run of runs) {
      let start = run.stream.indexOf(term.term);
      while (start >= 0) {
        found = true;
        const end = start + termLength;
        for (const part of run.offsets.filter((offset) => offset.end > start && offset.start < end)) {
          const localStart = Math.max(0, start - part.start);
          const localEnd = Math.min(part.word.characters.length, end - part.start);
          const [rawX, y, rawWidth, height] = part.word.rect;
          const x = rawX + height * fit.aspect * fit.left, width = Math.max(rawWidth * 0.5, rawWidth - height * fit.aspect * fit.trim);
          const edges = part.word.edges, count = part.word.characters.length;
          const from = edges?.left?.[localStart] ?? localStart / count, to = edges?.right?.[localEnd - 1] ?? localEnd / count;
          const rect = [x + width * from, y + height * fit.top, width * Math.max(0, to - from), height * fit.height];
          highlights.push(Object.freeze({
            ...term, coordinateSpace: "page-normalized",
            documentId: entry.documentId, pageNumber: entry.pageNumber,
            cropId: entry.itemId ?? `${entry.documentId}:p${entry.pageNumber}`, rect: Object.freeze(rect),
          }));
        }
        start = run.stream.indexOf(term.term, start + 1);
      }
    }
    if (!found) misses.push(term.termId);
  }
  return Object.freeze({ terms, highlights: Object.freeze(highlights), misses: Object.freeze(misses) });
}

function wordCenterIsInside(word, rect) {
  const centerX = word.rect[0] + word.rect[2] / 2;
  const centerY = word.rect[1] + word.rect[3] / 2;
  return centerX >= rect[0] && centerX <= rect[0] + rect[2] && centerY >= rect[1] && centerY <= rect[1] + rect[3];
}

function createEntry(document, page, item) {
  const words = item ? page.words.filter((word) => wordCenterIsInside(word, item.rect)) : page.words;
  const text = words.map((word) => word.text).join(" ") || page.text;
  const metadata = deriveExamMetadata({ metadata: document.metadata, source: document.source });
  return Object.freeze({
    documentId: document.id, documentTitle: document.title, pageNumber: page.pageNumber,
    itemId: item?.id ?? null, itemNumber: item?.itemNumber ?? null, text, normalized: normalizedText(text), words,
    source: item?.source ?? createCropSource({ documentId: document.id, pageNumber: page.pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true }),
    ...(metadata ? { metadata } : {}),
    ...(item?.contentSource ? { contentSource: item.contentSource } : {}),
    ...(item?.figureCandidates?.length ? { figureCandidates: Object.freeze([...item.figureCandidates]) } : {}),
  });
}

export function buildSearchIndex(documents) {
  const entries = [];
  for (const document of documents) {
    for (const page of document.pages) {
      if (page.items.length === 0) entries.push(createEntry(document, page, null));
      else for (const item of page.items) entries.push(createEntry(document, page, item));
    }
  }
  return Object.freeze({ schemaVersion: "pdf-search-index-v1", entries: Object.freeze(entries) });
}

// 11-08: 색인을 새로 만든 직후(일꾼 안·한가할 때) 쪽마다 정규화한 글을 미리 만들어, 첫 검색도 바로 끝나게 한다.
export function warmSearchIndex(index) {
  for (const entry of index?.entries ?? []) searchableText(entry);
}

export function searchIndex(index, options) {
  const terms = queryHighlightTerms(options?.query ?? "");
  if (terms.length === 0) return Object.freeze([]);
  const allowed = options.documentIds ? new Set(options.documentIds) : null;
  const filters = options?.filters ?? {};
  const limit = options?.limit === null ? Number.POSITIVE_INFINITY
    : Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const candidates = [];
  for (const entry of index.entries) {
    if (allowed && !allowed.has(entry.documentId)) continue;
    if (filters.academicYear && String(entry.metadata?.academicYear) !== String(filters.academicYear)) continue;
    if (filters.administration && entry.metadata?.administration !== filters.administration) continue;
    if (filters.subject && entry.metadata?.subject !== filters.subject) continue;
    const searchable = searchableText(entry);
    if (!terms.every(({ term }) => searchable.includes(term))) continue;
    const firstOffset = Math.min(...terms.map(({ term }) => searchable.indexOf(term)).filter((offset) => offset >= 0));
    const start = Math.max(0, firstOffset - 48);
    const occurrences = terms.reduce((sum, { term }) => sum + searchable.split(term).length - 1, 0);
    // 11-09: 낱말이 친 순서대로 붙어 있는 쪽·문항을 맨 위로(provider.js examSearchScore와 같은 규칙).
    const adjacent = terms.length > 1 && searchable.includes(terms.map(({ term }) => term).join("")) ? 1000 : 0;
    candidates.push({ entry, score: adjacent + occurrences / terms.length, snippet: entry.text.slice(start, start + 160).trim() });
  }
  candidates.sort((left, right) => right.score - left.score || left.entry.pageNumber - right.entry.pageNumber);
  const results = candidates.slice(0, limit).map(({ entry, score, snippet }) => {
    const mapped = mapQueryHighlights(entry, terms);
    const legacyHighlights = mapped.highlights.length || !entry.matchRects?.length ? [] : entry.matchRects.map((rect) => Object.freeze({
      ...terms[0], coordinateSpace: "page-normalized", legacy: true,
      documentId: entry.documentId, pageNumber: entry.pageNumber,
      cropId: entry.itemId ?? `${entry.documentId}:p${entry.pageNumber}`, rect: Object.freeze([...rect]),
    }));
    const highlights = mapped.highlights.length ? mapped.highlights : Object.freeze(legacyHighlights);
    const misses = legacyHighlights.length ? Object.freeze(terms.slice(1).map((term) => term.termId)) : mapped.misses;
    return Object.freeze({
      documentId: entry.documentId, documentTitle: entry.documentTitle, pageNumber: entry.pageNumber,
      itemId: entry.itemId, itemNumber: entry.itemNumber, score,
      snippet, terms, highlights, misses,
      matchRects: Object.freeze(highlights.map((highlight) => highlight.rect)), source: entry.source,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      ...(entry.contentSource ? { contentSource: entry.contentSource } : {}),
      ...(entry.figureCandidates?.length ? { figureCandidates: entry.figureCandidates } : {}),
    });
  });
  return Object.freeze(results);
}
