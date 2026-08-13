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
  return labels.flatMap((label, index) => {
    const number = index + 1;
    const center = [
      (label.bounds[0] + label.bounds[2] / 2) * image.width,
      (label.bounds[1] + label.bounds[3] / 2) * image.height,
    ];
    const text = label.uncertain ? `${label.text} (?)` : label.text;
    return [
      {
        id: `label-${number}-text`, type: "text", text,
        x: center[0], y: center[1], fontSize: 3.7, uncertain: label.uncertain,
        locked: false, positionLocked: false,
      },
      {
        id: `label-${number}-leader`, type: "labeler", text,
        p1: [label.target[0] * image.width, label.target[1] * image.height],
        p2: center, labelType: "label", labelSize: 3.7,
        uncertain: label.uncertain, locked: false, positionLocked: false,
      },
    ];
  });
}

export function applyLabelEdits(objects, edits) {
  let result = objects.map((object) => structuredClone(object));
  for (const edit of edits) {
    if (edit.kind === "delete") {
      result = result.filter(({ id }) => id !== edit.id);
      continue;
    }
    result = result.map((object) => {
      if (object.id !== edit.id) return object;
      if (edit.kind === "edit") return { ...object, text: edit.text };
      if (edit.kind === "move") {
        const moved = { ...object };
        if (Array.isArray(object.p2)) moved.p2 = [object.p2[0] + edit.dx, object.p2[1] + edit.dy];
        else { moved.x = object.x + edit.dx; moved.y = object.y + edit.dy; }
        return moved;
      }
      throw new TypeError(`Unsupported label edit: ${edit.kind}`);
    });
  }
  return result;
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
  const sourceCropPixels = cropRgba(fixture.pixelSource, fixture.crop);
  return {
    crop: compareCropPixels(sourceCropPixels, fixture.transmittedPixels),
    request: {
      mode: "diagram", labelPolicy: "omit", labels: [], sourceId: fixture.sourceId,
      transportPixels: [...fixture.transmittedPixels],
    },
    ocr,
    objects,
    edited: applyLabelEdits(objects, fixture.edits),
    comparison: { sourceId: fixture.sourceId, resultId: fixture.resultId, layout: "side-by-side" },
    recovery: recoveryStates(fixture.attempts),
  };
}
