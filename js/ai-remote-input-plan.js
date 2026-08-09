/*
 * Pure planning helpers for the subscription-backed remote image path.
 *
 * This module deliberately does not touch DOM, Canvas, IPC, or storage. It
 * decides which source pixels a compositor should prepare, creates an exact
 * result-cache key, and applies a bounded cache policy. The UI may render the
 * returned crop/contact-sheet descriptors with Canvas or OffscreenCanvas.
 */

export const REMOTE_INPUT_PLAN_VERSION = "remote-input-v2";
export const EXACT_OUTPUT_CACHE_SCHEMA = "5e-ai-output-v2";

export const DEFAULT_REMOTE_INPUT_OPTIONS = Object.freeze({
  maxOutgoingImages: 4,
  maxDirectCrops: 2,
  maxContactSheetTiles: 8,
  cropPaddingRatio: 0.08,
});

export const DEFAULT_EXACT_OUTPUT_CACHE_POLICY = Object.freeze({
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  maxEntries: 48,
  maxBytes: 256 * 1024 * 1024,
  maxEntryBytes: 20 * 1024 * 1024,
});

const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function rotateRight(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}

function utf8Bytes(value) {
  const text = String(value ?? "");
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
  const encoded = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
  return bytes;
}

/** Portable synchronous SHA-256, used only for local identity/cache keys. */
export function sha256Hex(value) {
  const input = utf8Bytes(value);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item ?? null)).join(",")}]`;
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

const imageHashMemo = new WeakMap();

function outgoingImageData(item) {
  return item?.transportDataUrl || item?.aiTransport?.transportDataUrl || item?.data || null;
}

function exactImageHash(item) {
  if (!item) return null;
  if (item.exactImageHash) return String(item.exactImageHash);
  const declaredExact = item.transportHash || item.aiTransport?.transportHash;
  if (declaredExact) return String(declaredExact);
  const imageData = outgoingImageData(item);
  if (typeof imageData === "string" && imageData) {
    if (typeof item === "object") {
      const memo = imageHashMemo.get(item);
      if (memo?.data === imageData) return memo.hash;
      const hash = `sha256:${sha256Hex(imageData)}`;
      imageHashMemo.set(item, { data: imageData, hash });
      return hash;
    }
    return `sha256:${sha256Hex(imageData)}`;
  }
  const declared = item.contentHash || item.exactHash || item.latestResultHash || item.sourceHash
    || item.transportSignature
    || item.sourceSignature || item.signature;
  return declared ? String(declared) : null;
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return utf8Bytes(dataUrl).length;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(header)) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  }
  return utf8Bytes(payload).length;
}

function normalizePrompt(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function normalizeCommentText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function roundCoordinate(value) {
  return Math.round(finiteNumber(value) * 1000) / 1000;
}

export function normalizeCropRect(comment, paddingRatio = 0) {
  const x = Math.max(0, Math.min(100, finiteNumber(comment?.x)));
  const y = Math.max(0, Math.min(100, finiteNumber(comment?.y)));
  const width = Math.max(0, Math.min(100 - x, finiteNumber(comment?.w ?? comment?.width)));
  const height = Math.max(0, Math.min(100 - y, finiteNumber(comment?.h ?? comment?.height)));
  const paddingX = width * Math.max(0, finiteNumber(paddingRatio));
  const paddingY = height * Math.max(0, finiteNumber(paddingRatio));
  const paddedX = Math.max(0, x - paddingX);
  const paddedY = Math.max(0, y - paddingY);
  return {
    x: roundCoordinate(paddedX),
    y: roundCoordinate(paddedY),
    w: roundCoordinate(Math.min(100 - paddedX, width + paddingX * 2)),
    h: roundCoordinate(Math.min(100 - paddedY, height + paddingY * 2)),
  };
}

function commentIdentity(comment) {
  const rect = normalizeCropRect(comment);
  return stableStringify({ rect, text: normalizeCommentText(comment?.text) });
}

function mergeComments(left = [], right = []) {
  const merged = [];
  const seen = new Set();
  for (const comment of [...left, ...right]) {
    const identity = commentIdentity(comment);
    if (!normalizeCommentText(comment?.text) || seen.has(identity)) continue;
    seen.add(identity);
    merged.push(comment);
  }
  return merged;
}

function attachmentPreference(item, latestHash) {
  const comments = (item?.comments || []).filter((comment) => normalizeCommentText(comment?.text)).length;
  return (item?.primary ? 1_000_000 : 0)
    + (exactImageHash(item) === latestHash ? 500_000 : 0)
    + comments * 10_000
    + finiteNumber(item?.updatedAt ?? item?.createdAt, 0) / 1e12;
}

/**
 * Removes invalid, explicitly stale, superseded generated, and duplicate
 * sources without mutating UI-owned cards. Duplicate cards retain the richer
 * card's metadata and merge unique, non-empty comments.
 */
export function pruneOutgoingAttachments(items = [], {
  latestResult = null,
  includeGenerated = false,
  now = Date.now(),
} = {}) {
  const latestHash = exactImageHash(latestResult);
  const kept = [];
  const removed = [];
  const byHash = new Map();
  const hashByData = new Map();

  for (const item of items || []) {
    if (!item || typeof item !== "object") {
      removed.push({ item, reason: "invalid" });
      continue;
    }
    const imageData = outgoingImageData(item);
    const hash = typeof imageData === "string" && hashByData.has(imageData)
      ? hashByData.get(imageData)
      : exactImageHash(item);
    if (typeof imageData === "string" && imageData) hashByData.set(imageData, hash);
    if (!hash) {
      removed.push({ item, reason: "missing-image" });
      continue;
    }
    if (item.active === false || item.removed || item.stale || item.superseded
      || (Number.isFinite(Number(item.expiresAt)) && Number(item.expiresAt) <= now)) {
      removed.push({ item, reason: "stale" });
      continue;
    }
    if (item.kind === "generated" && !includeGenerated && hash !== latestHash) {
      removed.push({ item, reason: "superseded-generated" });
      continue;
    }

    const duplicate = byHash.get(hash);
    if (!duplicate) {
      const copy = { ...item, comments: [...(item.comments || [])], exactImageHash: hash };
      byHash.set(hash, copy);
      kept.push(copy);
      continue;
    }

    const itemWins = attachmentPreference(item, latestHash) > attachmentPreference(duplicate, latestHash);
    const winner = itemWins
      ? { ...item, comments: mergeComments(duplicate.comments, item.comments), exactImageHash: hash }
      : { ...duplicate, comments: mergeComments(duplicate.comments, item.comments), exactImageHash: hash };
    const index = kept.indexOf(duplicate);
    if (index >= 0) kept[index] = winner;
    byHash.set(hash, winner);
    removed.push({ item: itemWins ? duplicate : item, reason: "duplicate", keptId: winner.id ?? null });
  }

  return {
    items: kept,
    removed,
    metrics: {
      inputCount: Array.isArray(items) ? items.length : 0,
      keptCount: kept.length,
      removedCount: removed.length,
      duplicateCount: removed.filter((entry) => entry.reason === "duplicate").length,
      staleCount: removed.filter((entry) => entry.reason === "stale" || entry.reason === "superseded-generated").length,
      sourceBytes: kept.reduce((sum, item) => sum + estimateDataUrlBytes(outgoingImageData(item)), 0),
    },
  };
}

function tokenize(value) {
  return new Set(normalizeCommentText(value).toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2));
}

function textOverlapScore(left, right) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  let score = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) score += Math.min(12, token.length);
  return score;
}

function collectRelatedComments(items, prompt, paddingRatio) {
  const comments = [];
  for (const [sourceIndex, item] of items.entries()) {
    for (const [commentIndex, comment] of (item.comments || []).entries()) {
      const text = normalizeCommentText(comment?.text);
      if (!text) continue;
      comments.push({
        id: comment.id || `${item.id || sourceIndex}:comment:${comment.number ?? commentIndex + 1}`,
        number: comment.number ?? commentIndex + 1,
        text,
        sourceId: item.id || null,
        sourceHash: item.exactImageHash || exactImageHash(item),
        sourceIndex,
        source: item,
        rect: normalizeCropRect(comment, paddingRatio),
        score: (comment.focusOnRender ? 1000 : 0) + textOverlapScore(text, prompt) + 100 - commentIndex,
      });
    }
  }
  return comments.sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex);
}

function selectPrimaryReference(items, comments, primaryReferenceId) {
  if (!items.length) return null;
  const explicit = items.find((item) => primaryReferenceId && item.id === primaryReferenceId)
    || items.find((item) => item.primary);
  if (explicit) return explicit;
  const commentScores = new Map();
  for (const comment of comments) {
    commentScores.set(comment.sourceHash, (commentScores.get(comment.sourceHash) || 0) + comment.score);
  }
  return items
    .map((item, index) => ({ item, index, score: commentScores.get(item.exactImageHash) || 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0].item;
}

function overviewDescriptor(item, role) {
  return {
    kind: "overview",
    role,
    sourceId: item.id || null,
    sourceHash: item.exactImageHash || exactImageHash(item),
    source: item,
  };
}

function cropDescriptor(comment) {
  return {
    kind: "crop",
    role: "comment-crop",
    sourceId: comment.sourceId,
    sourceHash: comment.sourceHash,
    source: comment.source,
    commentId: comment.id,
    commentNumber: comment.number,
    commentText: comment.text,
    rect: comment.rect,
  };
}

/**
 * Produces a bounded visual-input plan. Default output is at most four images:
 * latest result (revision only), one primary overview, up to two direct crops,
 * and one contact sheet for secondary references/overflow crops.
 */
export function createRemoteImageInputPlan({
  references = [],
  latestResult = null,
  prompt = "",
  primaryReferenceId = null,
  options = {},
  now = defaultNow,
} = {}) {
  const startedAt = now();
  const settings = {
    ...DEFAULT_REMOTE_INPUT_OPTIONS,
    ...options,
  };
  settings.maxOutgoingImages = positiveInteger(settings.maxOutgoingImages, DEFAULT_REMOTE_INPUT_OPTIONS.maxOutgoingImages);
  settings.maxDirectCrops = nonnegativeInteger(settings.maxDirectCrops, DEFAULT_REMOTE_INPUT_OPTIONS.maxDirectCrops);
  settings.maxContactSheetTiles = positiveInteger(settings.maxContactSheetTiles, DEFAULT_REMOTE_INPUT_OPTIONS.maxContactSheetTiles);

  const cleaned = pruneOutgoingAttachments(references, { latestResult, includeGenerated: false });
  const dedupedAt = now();
  const latestCleaned = latestResult
    ? pruneOutgoingAttachments([latestResult], { latestResult, includeGenerated: true }).items[0] || null
    : null;
  const referenceComments = collectRelatedComments(cleaned.items, prompt, settings.cropPaddingRatio);
  const primary = selectPrimaryReference(cleaned.items, referenceComments, primaryReferenceId);
  const latestComments = latestCleaned
    ? collectRelatedComments([latestCleaned], prompt, settings.cropPaddingRatio)
      .map((comment) => ({ ...comment, score: comment.score + 2_000, latestResult: true }))
    : [];
  const relatedComments = [...latestComments, ...referenceComments]
    .sort((left, right) => right.score - left.score || left.sourceIndex - right.sourceIndex);
  const rankedAt = now();

  const visuals = [];
  if (latestCleaned) visuals.push(overviewDescriptor(latestCleaned, "latest-result"));
  if (primary && visuals.length < settings.maxOutgoingImages) visuals.push(overviewDescriptor(primary, "primary-reference"));

  const reserveContactSheet = cleaned.items.length > (primary ? 1 : 0)
    || relatedComments.length > settings.maxDirectCrops;
  const slotsBeforeSheet = Math.max(0, settings.maxOutgoingImages - visuals.length - (reserveContactSheet ? 1 : 0));
  const directCropCount = Math.min(settings.maxDirectCrops, slotsBeforeSheet, relatedComments.length);
  const directComments = relatedComments.slice(0, directCropCount);
  visuals.push(...directComments.map(cropDescriptor));

  const directCommentIds = new Set(directComments.map((comment) => comment.id));
  const secondary = cleaned.items.filter((item) => item !== primary);
  const contactCandidates = [
    ...relatedComments.filter((comment) => !directCommentIds.has(comment.id)).map(cropDescriptor),
    ...secondary.map((item) => overviewDescriptor(item, "secondary-reference")),
  ];
  const uniqueContactCandidates = [];
  const contactKeys = new Set();
  for (const candidate of contactCandidates) {
    const key = candidate.kind === "crop"
      ? `crop:${candidate.sourceHash}:${stableStringify(candidate.rect)}:${candidate.commentText}`
      : `overview:${candidate.sourceHash}`;
    if (contactKeys.has(key)) continue;
    contactKeys.add(key);
    uniqueContactCandidates.push(candidate);
  }

  if (uniqueContactCandidates.length && visuals.length < settings.maxOutgoingImages) {
    visuals.push({
      kind: "contact-sheet",
      role: "context-contact-sheet",
      columns: uniqueContactCandidates.length <= 4 ? 2 : 3,
      tiles: uniqueContactCandidates.slice(0, settings.maxContactSheetTiles),
      omittedTileCount: Math.max(0, uniqueContactCandidates.length - settings.maxContactSheetTiles),
    });
  }
  const plannedAt = now();

  const representedHashes = new Set();
  for (const visual of visuals) {
    if (visual.sourceHash) representedHashes.add(visual.sourceHash);
    for (const tile of visual.tiles || []) if (tile.sourceHash) representedHashes.add(tile.sourceHash);
  }
  return {
    version: REMOTE_INPUT_PLAN_VERSION,
    primaryReference: primary,
    latestResult: latestCleaned,
    references: cleaned.items,
    relatedComments,
    visuals,
    removed: cleaned.removed,
    metrics: {
      ...cleaned.metrics,
      latestResultBytes: estimateDataUrlBytes(outgoingImageData(latestCleaned)),
      totalSourceBytes: cleaned.metrics.sourceBytes + estimateDataUrlBytes(outgoingImageData(latestCleaned)),
      totalSourceCount: cleaned.items.length + (latestCleaned ? 1 : 0),
      dedupeMs: Math.max(0, dedupedAt - startedAt),
      rankingMs: Math.max(0, rankedAt - dedupedAt),
      planningMs: Math.max(0, plannedAt - rankedAt),
      totalMs: Math.max(0, plannedAt - startedAt),
      plannedImageCount: visuals.length,
      directCropCount,
      contactSheetTileCount: visuals.find((visual) => visual.kind === "contact-sheet")?.tiles.length || 0,
      representedSourceCount: representedHashes.size,
      droppedSourceCount: Math.max(0, cleaned.items.length + (latestCleaned ? 1 : 0) - representedHashes.size),
    },
  };
}

function canonicalComment(comment, sourceHash) {
  return {
    sourceHash,
    number: comment?.number ?? null,
    rect: normalizeCropRect(comment),
    text: normalizeCommentText(comment?.text),
  };
}

/**
 * Includes every output-affecting input required by the exact-cache contract.
 */
export function buildExactOutputCacheDescriptor({
  styleVersion,
  mode,
  prompt,
  references = [],
  comments = [],
  latestResult = null,
  latestResultHash = null,
  model = null,
  effort = null,
  serviceTier = null,
  outputOptions = {},
  inputPlanOptions = DEFAULT_REMOTE_INPUT_OPTIONS,
  primaryReferenceId = null,
  engineVersion = REMOTE_INPUT_PLAN_VERSION,
} = {}) {
  const cleaned = pruneOutgoingAttachments(references, { latestResult, includeGenerated: false });
  const referenceSignatures = cleaned.items.map((item, index) => ({
    order: index,
    role: item.primary || (primaryReferenceId && item.id === primaryReferenceId) ? "primary" : "reference",
    signature: item.exactImageHash || exactImageHash(item),
  }));
  const itemComments = cleaned.items.flatMap((item) => (item.comments || [])
    .filter((comment) => normalizeCommentText(comment?.text))
    .map((comment) => canonicalComment(comment, item.exactImageHash || exactImageHash(item))));
  const externalComments = (comments || [])
    .filter((comment) => normalizeCommentText(comment?.text))
    .map((comment) => canonicalComment(comment, String(comment.sourceHash || comment.referenceSignature || "external")));
  const latestHash = latestResultHash ? String(latestResultHash) : exactImageHash(latestResult);
  const latestComments = (latestResult?.comments || [])
    .filter((comment) => normalizeCommentText(comment?.text))
    .map((comment) => canonicalComment(comment, latestHash || "latest-result"));
  const uniqueComments = new Map();
  for (const comment of [...itemComments, ...latestComments, ...externalComments]) {
    uniqueComments.set(stableStringify(comment), comment);
  }
  const canonicalComments = [...uniqueComments.values()]
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));

  return {
    schema: EXACT_OUTPUT_CACHE_SCHEMA,
    engineVersion: String(engineVersion || REMOTE_INPUT_PLAN_VERSION),
    styleVersion: String(styleVersion || "unversioned"),
    mode: String(mode || "diagram"),
    prompt: normalizePrompt(prompt),
    referenceSignatures,
    comments: canonicalComments,
    latestResultHash: latestHash,
    generation: {
      model: model ? String(model) : null,
      effort: effort ? String(effort) : null,
      serviceTier: serviceTier ? String(serviceTier) : null,
    },
    inputPlanOptions: { ...DEFAULT_REMOTE_INPUT_OPTIONS, ...(inputPlanOptions || {}) },
    outputOptions,
  };
}

export function createExactOutputCacheKey(input) {
  const descriptor = input?.schema === EXACT_OUTPUT_CACHE_SCHEMA
    ? input
    : buildExactOutputCacheDescriptor(input);
  return `${EXACT_OUTPUT_CACHE_SCHEMA}:${sha256Hex(stableStringify(descriptor))}`;
}

function outputBytes(output) {
  if (!output) return 0;
  if (Number.isFinite(Number(output.bytes))) return Math.max(0, Number(output.bytes));
  if (typeof output.data === "string") return estimateDataUrlBytes(output.data);
  if (typeof output.dataUrl === "string") return estimateDataUrlBytes(output.dataUrl);
  if (Array.isArray(output.images)) return output.images.reduce((sum, item) => sum + outputBytes(item), 0);
  return 0;
}

export function createExactOutputCacheEntry({
  key,
  descriptor,
  output,
  status = "complete",
  now = Date.now(),
  policy = DEFAULT_EXACT_OUTPUT_CACHE_POLICY,
} = {}) {
  const resolvedDescriptor = descriptor?.schema === EXACT_OUTPUT_CACHE_SCHEMA
    ? descriptor
    : buildExactOutputCacheDescriptor(descriptor || {});
  const resolvedKey = key || createExactOutputCacheKey(resolvedDescriptor);
  const bytes = outputBytes(output);
  if (status !== "complete") return { cacheable: false, reason: "incomplete" };
  if (!output || bytes <= 0) return { cacheable: false, reason: "missing-output" };
  if (bytes > positiveInteger(policy.maxEntryBytes, DEFAULT_EXACT_OUTPUT_CACHE_POLICY.maxEntryBytes)) {
    return { cacheable: false, reason: "entry-too-large", bytes };
  }
  return {
    cacheable: true,
    schema: EXACT_OUTPUT_CACHE_SCHEMA,
    key: resolvedKey,
    descriptorHash: sha256Hex(stableStringify(resolvedDescriptor)),
    output,
    bytes,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + positiveInteger(policy.ttlMs, DEFAULT_EXACT_OUTPUT_CACHE_POLICY.ttlMs),
  };
}

export function evaluateExactOutputCacheEntry(entry, expectedKey, {
  now = Date.now(),
} = {}) {
  if (!entry) return { hit: false, reason: "missing" };
  if (entry.schema !== EXACT_OUTPUT_CACHE_SCHEMA) return { hit: false, reason: "schema-mismatch" };
  if (entry.key !== expectedKey) return { hit: false, reason: "key-mismatch" };
  if (!entry.output || finiteNumber(entry.bytes) <= 0) return { hit: false, reason: "corrupt" };
  if (finiteNumber(entry.expiresAt) <= now) return { hit: false, reason: "expired" };
  return { hit: true, reason: "hit", output: entry.output, bytes: entry.bytes };
}

/** LRU + TTL + byte/count pruning; storage remains the caller's responsibility. */
export function pruneExactOutputCacheEntries(entries = [], {
  now = Date.now(),
  policy = DEFAULT_EXACT_OUTPUT_CACHE_POLICY,
} = {}) {
  const maxEntries = positiveInteger(policy.maxEntries, DEFAULT_EXACT_OUTPUT_CACHE_POLICY.maxEntries);
  const maxBytes = positiveInteger(policy.maxBytes, DEFAULT_EXACT_OUTPUT_CACHE_POLICY.maxBytes);
  const candidates = [];
  const evicted = [];
  const byKey = new Map();

  for (const entry of entries || []) {
    if (!entry || entry.schema !== EXACT_OUTPUT_CACHE_SCHEMA || !entry.output || finiteNumber(entry.bytes) <= 0) {
      evicted.push({ entry, reason: "invalid" });
      continue;
    }
    if (finiteNumber(entry.expiresAt) <= now) {
      evicted.push({ entry, reason: "expired" });
      continue;
    }
    const existing = byKey.get(entry.key);
    if (existing) {
      const winner = finiteNumber(entry.lastAccessedAt ?? entry.createdAt) > finiteNumber(existing.lastAccessedAt ?? existing.createdAt)
        ? entry : existing;
      const loser = winner === entry ? existing : entry;
      byKey.set(entry.key, winner);
      evicted.push({ entry: loser, reason: "duplicate-key" });
    } else {
      byKey.set(entry.key, entry);
    }
  }
  candidates.push(...byKey.values());
  candidates.sort((left, right) => finiteNumber(right.lastAccessedAt ?? right.createdAt)
    - finiteNumber(left.lastAccessedAt ?? left.createdAt));

  const kept = [];
  let bytes = 0;
  for (const entry of candidates) {
    if (kept.length >= maxEntries || bytes + entry.bytes > maxBytes) {
      evicted.push({ entry, reason: kept.length >= maxEntries ? "count-limit" : "byte-limit" });
      continue;
    }
    kept.push(entry);
    bytes += entry.bytes;
  }
  return { kept, evicted, bytes, entryCount: kept.length };
}

/** Generic instrumentation for synchronous or asynchronous local preparation. */
export async function measurePreparationStage(name, operation, {
  now = defaultNow,
  onMeasurement = null,
} = {}) {
  const startedAt = now();
  try {
    const value = await operation();
    const measurement = { name, durationMs: Math.max(0, now() - startedAt), ok: true };
    onMeasurement?.(measurement);
    return { value, measurement };
  } catch (error) {
    const measurement = { name, durationMs: Math.max(0, now() - startedAt), ok: false };
    onMeasurement?.(measurement);
    error.measurement = measurement;
    throw error;
  }
}
