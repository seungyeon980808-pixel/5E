import { DEFAULT_TEXT_FONT } from "./state.js?v=1.4.0";

const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y)
  ? { x: Math.max(0, Math.min(1, value.x)), y: Math.max(0, Math.min(1, value.y)) } : null;
const bounds = (value) => value && ["x", "y", "w", "h"].every((key) => Number.isFinite(value[key]))
  ? { x: Math.max(0, Math.min(1, value.x)), y: Math.max(0, Math.min(1, value.y)),
    w: Math.max(.01, Math.min(1, value.w)), h: Math.max(.01, Math.min(1, value.h)) } : null;

function complete(candidate) {
  return Boolean(candidate.text.trim() && candidate.original && candidate.target && candidate.labelPosition);
}

export function createEditableLabelSession(initial = []) {
  let serial = 0;
  const candidates = initial.map((item) => ({ ...structuredClone(item), id: item.id || `label-candidate-${++serial}`, confirmed: false }));
  const find = (id) => candidates.find((item) => item.id === id);
  const mutate = (id, update) => { const item = find(id); if (!item) return null; update(item); item.confirmed = false; return item; };
  return {
    add: ({ text = "", detector = "manual", confidence = null } = {}) => {
      const item = { id: `label-candidate-${++serial}`, text: String(text), detector, confidence,
        original: null, target: null, labelPosition: null, confirmed: false };
      candidates.push(item); return item;
    },
    remove: (id) => { const index = candidates.findIndex((item) => item.id === id); if (index >= 0) candidates.splice(index, 1); },
    updateText: (id, text) => mutate(id, (item) => { item.text = String(text); }),
    setOriginal: (id, value) => mutate(id, (item) => { item.original = bounds(value); }),
    setTarget: (id, value) => mutate(id, (item) => { item.target = point(value); }),
    setLabelPosition: (id, value) => mutate(id, (item) => { item.labelPosition = point(value); }),
    confirm: (id) => { const item = find(id); if (!item || !complete(item)) return false; item.confirmed = true; return true; },
    get: (id) => find(id),
    list: () => candidates.map((item) => structuredClone(item)),
    ready: () => candidates.length > 0 && candidates.every((item) => item.confirmed),
    confirmed: () => candidates.filter((item) => item.confirmed).map((item) => structuredClone(item)),
  };
}

export function labelOverlayDescriptors(candidates = []) {
  return candidates.map((item) => ({
    id: String(item.id || ""),
    text: String(item.text || ""),
    confirmed: item.confirmed === true,
    original: bounds(item.original),
    target: point(item.target),
    labelPosition: point(item.labelPosition),
  }));
}

export function containedImageRect(box, natural) {
  const boxWidth = Math.max(1, Number(box?.width) || 1);
  const boxHeight = Math.max(1, Number(box?.height) || 1);
  const naturalWidth = Math.max(1, Number(natural?.width) || 1);
  const naturalHeight = Math.max(1, Number(natural?.height) || 1);
  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: (Number(box?.left) || 0) + (boxWidth - width) / 2,
    top: (Number(box?.top) || 0) + (boxHeight - height) / 2,
    width, height,
  };
}

export function normalizedContainedPoint(value, rect) {
  const x = Number(value?.x), y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)
      || x < rect.left || x > rect.left + rect.width
      || y < rect.top || y > rect.top + rect.height) return null;
  const rounded = (number) => Math.round(number * 1e12) / 1e12;
  return { x: rounded((x - rect.left) / rect.width), y: rounded((y - rect.top) / rect.height) };
}

export function labelObjectsForImage(candidates, image, bundleId) {
  return candidates.filter((item) => item.confirmed).map((item, index) => ({
    id: `${bundleId}_label_${index + 1}`,
    type: "labeler",
    text: String(item.text),
    p1: { x: image.x + item.target.x * image.w, y: image.y + item.target.y * image.h },
    p2: { x: image.x + item.labelPosition.x * image.w, y: image.y + item.labelPosition.y * image.h },
    labelType: "label", labelSize: 3.7, fontFamily: DEFAULT_TEXT_FONT,
    strokeLevel: 0, strokeWidth: 0.2, locked: false, positionLocked: false,
    layerId: image.layerId, order: image.order + index + 1,
    sourceLabel: {
      schema: "5e-editable-label@1", bundleId, candidateId: item.id,
      original: { text: String(item.text), bounds: { units: "normalized", ...item.original },
        detector: item.detector || "manual", confidence: Number.isFinite(item.confidence) ? item.confidence : null },
      confirmation: { status: "confirmed", confirmedByUser: true },
      connection: { kind: "raster-point", diagramObjectId: image.id,
        anchor: { units: "normalized", ...item.target } },
      sourceReference: image.referenceProvenance ? structuredClone(image.referenceProvenance) : null,
    },
  }));
}
