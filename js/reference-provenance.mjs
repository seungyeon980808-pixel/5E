const SCHEMA = "5e-reference-provenance@1";

function scalar(value, limit = 240) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function fileNameOf(item) {
  const direct = scalar(item?.name);
  if (direct) return direct.split(/[\\/]/).at(-1);
  return scalar(item?.relativePath).split(/[\\/]/).at(-1) || "PDF";
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizedCrop(crop) {
  const x = Math.max(0, Math.min(1, finite(crop.x)));
  const y = Math.max(0, Math.min(1, finite(crop.y)));
  return {
    units: "normalized",
    x, y,
    w: Math.max(0, Math.min(1 - x, finite(crop.w))),
    h: Math.max(0, Math.min(1 - y, finite(crop.h))),
    selectionKind: scalar(crop.selectionKind, 40) || "manual",
    sourceWidth: Math.max(1, Math.round(finite(crop.sourceWidth, 1))),
    sourceHeight: Math.max(1, Math.round(finite(crop.sourceHeight, 1))),
  };
}

export function buildReferenceProvenance(item, crop = null) {
  const question = scalar(item?.metadata?.question, 80);
  const result = {
    schema: SCHEMA,
    sourceKind: item?.kind === "pdf-page" ? (crop ? "local-pdf-crop" : "local-pdf") : "local-image",
    documentId: scalar(item?.sourceId || item?.id, 120) || null,
    fileName: fileNameOf(item),
    pageNumber: Number.isInteger(item?.pageNumber) ? item.pageNumber : null,
    questionInfo: question ? { value: question, source: "pdf-metadata", confirmedByUser: false } : null,
    crop: null,
  };
  if (crop) result.crop = normalizedCrop(crop);
  return result;
}

export function buildDiagramOutputProvenance(reference, settings = {}) {
  if (!reference) return null;
  return {
    ...structuredClone(reference),
    transform: {
      mode: settings.mode === "complete" ? "complete" : "diagram",
      outputEngine: "raster",
      qualityMode: ["simple", "standard", "complex"].includes(settings.qualityMode) ? settings.qualityMode : "standard",
      examPalette: true,
      transparentBackground: true,
    },
  };
}
