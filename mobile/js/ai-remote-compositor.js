/* Browser compositor for descriptors from ai-remote-input-plan.js. */

export const REMOTE_COMPOSITOR_VERSION = "remote-compositor-v1";

export const REMOTE_COMPOSITOR_DEFAULTS = Object.freeze({
  mimeType: "image/png",
  quality: 0.92,
  maxCropLongEdge: 1024,
  contactSheetLongEdge: 1536,
  cellWidth: 512,
  cellHeight: 384,
  cellPadding: 12,
  separatorWidth: 1,
  separatorColor: "#8a8a8a",
  backgroundColor: "#ffffff",
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function imageWidth(image) {
  return positive(image?.naturalWidth || image?.videoWidth || image?.width, 0);
}

function imageHeight(image) {
  return positive(image?.naturalHeight || image?.videoHeight || image?.height, 0);
}

function sourceDataUrl(source) {
  return source?.transportDataUrl || source?.aiTransport?.transportDataUrl || source?.data || source?.dataUrl || null;
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultLoadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function") {
      reject(new Error("Browser Image API is unavailable."));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode remote-input image data."));
    image.src = dataUrl;
  });
}

function defaultCreateCanvas(width, height) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("Browser Canvas API is unavailable.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function blobToDataUrl(blob) {
  if (typeof FileReader !== "function") throw new Error("FileReader API is unavailable.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not encode Canvas blob."));
    reader.readAsDataURL(blob);
  });
}

async function defaultEncodeCanvas(canvas, mimeType, quality) {
  if (typeof canvas?.toDataURL === "function") return canvas.toDataURL(mimeType, quality);
  if (typeof canvas?.convertToBlob === "function") {
    return blobToDataUrl(await canvas.convertToBlob({ type: mimeType, quality }));
  }
  throw new Error("Canvas data URL encoding is unavailable.");
}

function normalizeUnit(rect, explicitUnit) {
  const declared = String(explicitUnit || rect?.unit || rect?.coordinateSpace || "auto").toLowerCase();
  if (["pixel", "pixels", "px", "image-pixels"].includes(declared)) return "pixels";
  if (["fraction", "normalized", "ratio", "0..1"].includes(declared)) return "fraction";
  if (["percent", "percentage", "%", "0..100"].includes(declared)) return "percent";
  return "auto";
}

/**
 * Converts percentage, fractional, or pixel comments into clamped natural
 * image pixels. Pixel comments drawn against a preview may provide
 * sourceWidth/sourceHeight (or coordinateWidth/coordinateHeight) and will be
 * scaled to natural dimensions.
 */
export function resolveCropPixelRect(rect = {}, naturalWidth, naturalHeight, {
  unit = null,
} = {}) {
  const width = positive(naturalWidth, 0);
  const height = positive(naturalHeight, 0);
  if (!width || !height) throw new TypeError("Natural image dimensions must be positive.");

  let x = finite(rect.x);
  let y = finite(rect.y);
  let cropWidth = finite(rect.w ?? rect.width);
  let cropHeight = finite(rect.h ?? rect.height);
  let resolvedUnit = normalizeUnit(rect, unit);
  const basisWidth = positive(rect.sourceWidth || rect.coordinateWidth || rect.imageWidth, 0);
  const basisHeight = positive(rect.sourceHeight || rect.coordinateHeight || rect.imageHeight, 0);

  if (resolvedUnit === "auto") {
    const values = [x, y, cropWidth, cropHeight].map(Math.abs);
    if (basisWidth || basisHeight) resolvedUnit = "pixels";
    else if (values.every((value) => value <= 1)) resolvedUnit = "fraction";
    else if (values.some((value) => value > 100)) resolvedUnit = "pixels";
    else resolvedUnit = "percent";
  }

  if (resolvedUnit === "percent") {
    x = x * width / 100;
    y = y * height / 100;
    cropWidth = cropWidth * width / 100;
    cropHeight = cropHeight * height / 100;
  } else if (resolvedUnit === "fraction") {
    x *= width;
    y *= height;
    cropWidth *= width;
    cropHeight *= height;
  } else if (basisWidth || basisHeight) {
    const scaleX = width / positive(basisWidth, width);
    const scaleY = height / positive(basisHeight, height);
    x *= scaleX;
    y *= scaleY;
    cropWidth *= scaleX;
    cropHeight *= scaleY;
  }

  x = clamp(x, 0, Math.max(0, width - 1));
  y = clamp(y, 0, Math.max(0, height - 1));
  cropWidth = clamp(cropWidth, 1, width - x);
  cropHeight = clamp(cropHeight, 1, height - y);
  return {
    x: Math.round(x * 1000) / 1000,
    y: Math.round(y * 1000) / 1000,
    width: Math.round(cropWidth * 1000) / 1000,
    height: Math.round(cropHeight * 1000) / 1000,
    unit: resolvedUnit,
  };
}

function scaleInside(width, height, maxWidth, maxHeight, allowUpscale = false) {
  const scale = Math.min(maxWidth / width, maxHeight / height, allowUpscale ? Infinity : 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function getContext(canvas) {
  const context = canvas?.getContext?.("2d", { alpha: true });
  if (!context) throw new Error("2D Canvas context is unavailable.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

function fillBackground(context, width, height, color) {
  if (!color || color === "transparent") {
    context.clearRect?.(0, 0, width, height);
    return;
  }
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
}

async function resolveDrawable(descriptor, dependencies, imageMemo) {
  const source = descriptor?.source;
  const dataUrl = sourceDataUrl(source);
  if (!dataUrl) throw new Error(`Visual descriptor ${descriptor?.kind || "unknown"} has no source image.`);
  let imagePromise = imageMemo.get(dataUrl);
  if (!imagePromise) {
    imagePromise = Promise.resolve(dependencies.loadImage(dataUrl));
    imageMemo.set(dataUrl, imagePromise);
  }
  const image = await imagePromise;
  const width = imageWidth(image);
  const height = imageHeight(image);
  if (!width || !height) throw new Error("Decoded source has invalid natural dimensions.");
  const crop = descriptor.kind === "crop"
    ? resolveCropPixelRect(descriptor.rect, width, height, {
      unit: descriptor.rectUnit || descriptor.coordinateSpace || source?.commentCoordinateSpace,
    })
    : { x: 0, y: 0, width, height, unit: "pixels" };
  return { image, dataUrl, ...crop };
}

function drawContained(context, drawable, targetX, targetY, targetWidth, targetHeight, padding = 0) {
  const usableWidth = Math.max(1, targetWidth - padding * 2);
  const usableHeight = Math.max(1, targetHeight - padding * 2);
  const size = scaleInside(drawable.width, drawable.height, usableWidth, usableHeight, false);
  const x = targetX + (targetWidth - size.width) / 2;
  const y = targetY + (targetHeight - size.height) / 2;
  context.drawImage(
    drawable.image,
    drawable.x,
    drawable.y,
    drawable.width,
    drawable.height,
    Math.round(x),
    Math.round(y),
    size.width,
    size.height,
  );
}

function drawSeparators(context, columns, rows, cellWidth, cellHeight, settings) {
  context.save?.();
  context.strokeStyle = settings.separatorColor;
  context.lineWidth = settings.separatorWidth;
  context.beginPath();
  for (let column = 1; column < columns; column += 1) {
    const x = column * cellWidth + 0.5;
    context.moveTo(x, 0);
    context.lineTo(x, rows * cellHeight);
  }
  for (let row = 1; row < rows; row += 1) {
    const y = row * cellHeight + 0.5;
    context.moveTo(0, y);
    context.lineTo(columns * cellWidth, y);
  }
  context.stroke();
  context.restore?.();
}

function scaledCanvasDimensions(width, height, maxLongEdge) {
  const scale = Math.min(1, positive(maxLongEdge, Math.max(width, height)) / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Renders one overview/crop/contact-sheet descriptor to a data URL. */
export async function composeRemoteVisual(descriptor, options = {}) {
  if (!descriptor || !["overview", "crop", "contact-sheet"].includes(descriptor.kind)) {
    throw new TypeError("Expected an overview, crop, or contact-sheet descriptor.");
  }
  const settings = { ...REMOTE_COMPOSITOR_DEFAULTS, ...options };
  const dependencies = {
    loadImage: options.loadImage || defaultLoadImage,
    createCanvas: options.createCanvas || defaultCreateCanvas,
    encodeCanvas: options.encodeCanvas || defaultEncodeCanvas,
    now: options.now || defaultNow,
  };
  const imageMemo = options.imageMemo || new Map();
  const startedAt = dependencies.now();

  // Reusing an overview preserves bytes and avoids a decode/encode round trip.
  if (descriptor.kind === "overview" && options.reencodeOverview !== true) {
    const dataUrl = sourceDataUrl(descriptor.source);
    if (!dataUrl) throw new Error("Overview descriptor has no source image.");
    return {
      dataUrl,
      kind: descriptor.kind,
      role: descriptor.role,
      sourceIds: descriptor.sourceId ? [descriptor.sourceId] : [],
      reusedSource: true,
      width: descriptor.source?.naturalWidth || descriptor.source?.width || null,
      height: descriptor.source?.naturalHeight || descriptor.source?.height || null,
      durationMs: Math.max(0, dependencies.now() - startedAt),
    };
  }

  if (descriptor.kind === "crop") {
    const drawable = await resolveDrawable(descriptor, dependencies, imageMemo);
    const output = scaledCanvasDimensions(drawable.width, drawable.height, settings.maxCropLongEdge);
    const canvas = dependencies.createCanvas(output.width, output.height);
    const context = getContext(canvas);
    fillBackground(context, output.width, output.height, settings.backgroundColor);
    context.drawImage(
      drawable.image,
      drawable.x,
      drawable.y,
      drawable.width,
      drawable.height,
      0,
      0,
      output.width,
      output.height,
    );
    return {
      dataUrl: await dependencies.encodeCanvas(canvas, settings.mimeType, settings.quality),
      kind: descriptor.kind,
      role: descriptor.role,
      sourceIds: descriptor.sourceId ? [descriptor.sourceId] : [],
      reusedSource: false,
      width: output.width,
      height: output.height,
      sourceRect: {
        x: drawable.x,
        y: drawable.y,
        width: drawable.width,
        height: drawable.height,
        unit: drawable.unit,
      },
      durationMs: Math.max(0, dependencies.now() - startedAt),
    };
  }

  const tiles = Array.isArray(descriptor.tiles) ? descriptor.tiles : [];
  if (!tiles.length) throw new Error("Contact sheet requires at least one tile.");
  const columns = Math.max(1, Math.min(tiles.length, Math.round(positive(descriptor.columns, 2))));
  const rows = Math.ceil(tiles.length / columns);
  const rawWidth = columns * positive(settings.cellWidth, 512);
  const rawHeight = rows * positive(settings.cellHeight, 384);
  const output = scaledCanvasDimensions(rawWidth, rawHeight, settings.contactSheetLongEdge);
  const cellWidth = output.width / columns;
  const cellHeight = output.height / rows;
  const canvas = dependencies.createCanvas(output.width, output.height);
  const context = getContext(canvas);
  fillBackground(context, output.width, output.height, settings.backgroundColor);
  const drawables = await Promise.all(tiles.map((tile) => resolveDrawable(tile, dependencies, imageMemo)));
  for (const [index, drawable] of drawables.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawContained(
      context,
      drawable,
      column * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
      positive(settings.cellPadding, 12) * output.scale,
    );
  }
  // Deliberately no fillText/strokeText: source identity belongs in the prompt,
  // not in the reference pixels or generated diagram.
  drawSeparators(context, columns, rows, cellWidth, cellHeight, settings);
  return {
    dataUrl: await dependencies.encodeCanvas(canvas, settings.mimeType, settings.quality),
    kind: descriptor.kind,
    role: descriptor.role,
    sourceIds: [...new Set(tiles.map((tile) => tile.sourceId).filter(Boolean))],
    reusedSource: false,
    width: output.width,
    height: output.height,
    tileCount: tiles.length,
    columns,
    rows,
    durationMs: Math.max(0, dependencies.now() - startedAt),
  };
}

/** Renders every planned visual in parallel while sharing decoded images. */
export async function composeRemoteImageInputPlan(plan, options = {}) {
  const visuals = Array.isArray(plan?.visuals) ? plan.visuals : [];
  const imageMemo = new Map();
  const now = options.now || defaultNow;
  const startedAt = now();
  const outputs = await Promise.all(visuals.map((visual, index) => composeRemoteVisual(visual, {
    ...options,
    imageMemo,
  }).then((output) => ({
    ...output,
    name: `ai-input-${index + 1}-${visual.kind}.png`,
    descriptor: visual,
  }))));
  return {
    outputs,
    attachments: outputs.map((output) => ({ name: output.name, data: output.dataUrl })),
    metrics: {
      inputDescriptorCount: visuals.length,
      outputCount: outputs.length,
      decodedSourceCount: imageMemo.size,
      reusedOverviewCount: outputs.filter((output) => output.reusedSource).length,
      composedCount: outputs.filter((output) => !output.reusedSource).length,
      totalMs: Math.max(0, now() - startedAt),
    },
  };
}
