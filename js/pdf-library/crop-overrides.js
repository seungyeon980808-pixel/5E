const STORAGE_KEY = "5e-pdf-crop-overrides-v1";
const MAX_OVERRIDES = 1000;

function validRect(value) {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)) return null;
  const [x, y, width, height] = value;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return [...value];
}

export function cropOverrideKey(result) {
  const source = result?.source ?? {};
  const documentId = source.documentId ?? result?.documentId;
  const documentIdentity = result?.documentSourceHash ?? source.sha256 ?? result?.sourceSha256 ?? documentId;
  const pageNumber = source.pageNumber ?? result?.pageNumber ?? result?.page;
  const resultIdentity = result?.id ?? result?.candidateId ?? result?.itemId ?? "page";
  return `${documentIdentity}:${pageNumber}:${resultIdentity}`;
}

export function createCropOverrideStore(storage = globalThis.localStorage) {
  let values = {};
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) values = parsed;
  } catch {
    values = {};
  }
  return Object.freeze({
    get(result) { return validRect(values[cropOverrideKey(result)]); },
    set(result, rect) {
      const normalized = validRect(rect);
      if (!normalized) throw new TypeError("crop override is invalid");
      const next = { ...values, [cropOverrideKey(result)]: normalized };
      values = Object.fromEntries(Object.entries(next).slice(-MAX_OVERRIDES));
      storage?.setItem(STORAGE_KEY, JSON.stringify(values));
    },
  });
}
