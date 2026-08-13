import { readWebImage } from "./local-reference-sources.mjs";

export const REFERENCE_SOURCES = Object.freeze({
  PARTS: "parts",
  EXAM: "exam",
  LOCAL: "local",
});

const LOCAL_SOURCE_KINDS = new Set(["local", "local-pdf", "local-pdf-crop"]);
const CONFIRMED_LOCAL_SOURCE_KINDS = new Set(
  Array.from(LOCAL_SOURCE_KINDS, (sourceKind) => `${sourceKind}-confirmed`),
);

export async function activateReferenceSource(source, {
  loadRemote, onRemoteLoad, onSourceActivate, currentSource, selection,
} = {}) {
  if (source !== currentSource) selection?.clear();
  onSourceActivate?.();
  switch (source) {
    case REFERENCE_SOURCES.LOCAL:
      return source;
    case REFERENCE_SOURCES.PARTS:
    case REFERENCE_SOURCES.EXAM:
      onRemoteLoad?.();
      await loadRemote();
      return source;
    default:
      throw new RangeError(`Unknown reference source: ${source}`);
  }
}

export async function loadRemoteReferenceCatalog(request = fetch) {
  const responses = await Promise.all([
    request("assets/parts-library/manifest.json", { cache: "no-store" }),
    request("assets/exam-library/manifest.json", { cache: "no-store" }),
  ]);
  if (responses.some((response) => !response.ok)) {
    throw new Error("이미지 검색 목록을 불러오지 못했습니다.");
  }
  const manifests = await Promise.all(responses.map((response) => response.json()));
  return {
    parts: Array.isArray(manifests[0].items) ? manifests[0].items : [],
    exams: Array.isArray(manifests[1].items) ? manifests[1].items : [],
  };
}

export function remoteReferenceUrl(source, item) {
  const base = source === REFERENCE_SOURCES.EXAM
    ? "assets/exam-library/images/"
    : "assets/parts-library/svg/";
  return `${base}${encodeURIComponent(item.file)}`;
}

export async function remoteReferenceToDataUrl(source, item, request = fetch) {
  const response = await request(remoteReferenceUrl(source, item));
  if (!response.ok) throw new Error(`이미지를 불러오지 못했습니다. (HTTP ${response.status})`);
  return readWebImage({ file: await response.blob() });
}

export function handoffLocalReference(reference, decision, onAdd) {
  if (decision !== "confirmed") return false;
  const sourceKind = LOCAL_SOURCE_KINDS.has(reference.sourceKind)
    ? `${reference.sourceKind}-confirmed`
    : reference.sourceKind;
  onAdd?.({ ...reference, sourceKind });
  return true;
}

export function referenceMayTransmit(reference) {
  const sourceKind = String(reference?.sourceKind || "");
  return !sourceKind.startsWith("local") || CONFIRMED_LOCAL_SOURCE_KINDS.has(sourceKind);
}
