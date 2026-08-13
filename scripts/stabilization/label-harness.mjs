import { applyLoaded, migrate, serialize } from "../../js/project-io.js";
import { renderObject, singleObjBBox } from "../../js/render.js";
import { createStore } from "../../js/store.js";
import { translateObject } from "../../js/transform.js";
import { createInspectorContext } from "../../js/inspector/context.js";

const UNCERTAIN_CONFIDENCE = 0.6;

export function compareCropPixels(sourcePixels, transmittedPixels) {
  const length = Math.max(sourcePixels.length, transmittedPixels.length);
  let differingBytes = Math.abs(sourcePixels.length - transmittedPixels.length);
  const shared = Math.min(sourcePixels.length, transmittedPixels.length);
  for (let index = 0; index < shared; index += 1) {
    if (sourcePixels[index] !== transmittedPixels[index]) differingBytes += 1;
  }
  return { pixelMatch: differingBytes === 0 && length === shared, differingBytes };
}

export function cropRgba(source, crop) {
  if (source.rgba.length !== source.width * source.height * 4) throw new RangeError("RGBA source size mismatch");
  if (crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1
      || crop.x + crop.width > source.width || crop.y + crop.height > source.height) {
    throw new RangeError("Crop lies outside source pixels");
  }
  const pixels = [];
  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    const start = (y * source.width + crop.x) * 4;
    pixels.push(...source.rgba.slice(start, start + crop.width * 4));
  }
  return pixels;
}

export function normalizeOcrLabels(items, image) {
  return items.map((item) => ({
    text: String(item.text),
    bounds: [
      item.box[0] / image.width,
      item.box[1] / image.height,
      item.box[2] / image.width,
      item.box[3] / image.height,
    ],
    target: [item.target[0] / image.width, item.target[1] / image.height],
    uncertain: item.confidence < UNCERTAIN_CONFIDENCE,
  }));
}

export function createEditableLabelObjects(labels, image) {
  return labels.map((label, index) => {
    const number = index + 1;
    const p2 = {
      x: (label.bounds[0] + label.bounds[2] / 2) * image.width,
      y: (label.bounds[1] + label.bounds[3] / 2) * image.height,
    };
    const text = label.uncertain ? `${label.text} (?)` : label.text;
    return {
      id: `label-${number}`, type: "labeler", text,
      p1: { x: label.target[0] * image.width, y: label.target[1] * image.height },
      p2, labelType: "label", labelSize: 3.7, strokeLevel: 0, strokeWidth: 0.2,
      uncertain: label.uncertain, locked: false, positionLocked: false,
      layerId: 1, order: index,
    };
  });
}

export function applyLabelEdits(state, edits) {
  const inspector = createInspectorContext(state);
  const paths = [];
  for (const edit of edits) {
    if (edit.kind === "delete") {
      state.update((live) => { live.objects = live.objects.filter(({ id }) => id !== edit.id); });
      paths.push("store-delete");
      continue;
    }
    state.update((live) => { live.selectedIds = [edit.id]; });
    if (edit.kind === "edit") {
      inspector.commitSelectedObject((object) => {
        if (object.text === edit.text) return false;
        object.text = edit.text;
        return true;
      });
      paths.push("inspector");
      continue;
    }
    if (edit.kind === "move") {
      state.update((live) => { translateObject(live.objects.find(({ id }) => id === edit.id), edit.dx, edit.dy); });
      paths.push("transform");
      continue;
    }
    throw new TypeError(`Unsupported label edit: ${edit.kind}`);
  }
  return { objects: structuredClone(state.get().objects), paths };
}

export function recoveryStates(attempts) {
  const states = [];
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].ok) { states.push("ready"); break; }
    states.push("failed");
    if (index + 1 < attempts.length) states.push("retrying");
  }
  return states;
}

export function runSyntheticLabelCase(fixture) {
  const ocr = normalizeOcrLabels(fixture.ocr, fixture.image);
  const objects = createEditableLabelObjects(ocr, fixture.image);
  const pageId = "synthetic-label-page";
  const state = createStore({ activeLayerId: 1 });
  applyLoaded(state, migrate({
    version: "0.17", activePageId: pageId,
    pages: [{ id: pageId, name: "Synthetic", objects, guides: [], layers: [{ id: 1, name: "Labels" }], artboard: fixture.image }],
  }));
  const persisted = structuredClone(serialize(state.get()).pages[0].objects);
  const nodes = persisted.map((object) => renderObject(object));
  const edits = applyLabelEdits(state, fixture.edits);
  const sourceCropPixels = cropRgba(fixture.pixelSource, fixture.crop);
  return {
    crop: compareCropPixels(sourceCropPixels, fixture.transmittedPixels),
    request: {
      mode: "diagram", labelPolicy: "omit", labels: [], sourceId: fixture.sourceId,
      transportPixels: [...fixture.transmittedPixels],
    },
    ocr,
    generated: objects,
    objects: persisted,
    persisted,
    rendered: nodes.map((node) => ({ tag: node.tagName, leaders: node.querySelectorAll("line").length, text: node.textContent })),
    inspectorBounds: persisted.map((object) => singleObjBBox(object, null)),
    edited: edits.objects,
    editPaths: edits.paths,
    comparison: { sourceId: fixture.sourceId, resultId: fixture.resultId, layout: "side-by-side" },
    recovery: recoveryStates(fixture.attempts),
  };
}
