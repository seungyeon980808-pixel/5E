import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { vectorizeImage } from "../js/image-vectorize.js";
import { fixtureBytes } from "../tests/fixtures/local-converter-fixtures.mjs";

const repetitions = 5;
const outputFlag = process.argv.indexOf("--output");
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : null;
const phaseFlag = process.argv.indexOf("--phase");
const phase = phaseFlag >= 0 ? process.argv[phaseFlag + 1] : "unspecified";

function percentile(values, proportion) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * proportion) - 1];
}

function denseInkRatio(fixture) {
  let ink = 0;
  let opaque = 0;
  for (let index = 0; index < fixture.data.length; index += 4) {
    if (fixture.data[index + 3] < 16) continue;
    opaque += 1;
    const luminance = (0.299 * fixture.data[index]) + (0.587 * fixture.data[index + 1]) + (0.114 * fixture.data[index + 2]);
    if (luminance < 128) ink += 1;
  }
  return opaque ? ink / opaque : 0;
}

function boundsOf(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of points) {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

function rounded(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function geometry(result) {
  const normalize = ([x0, y0, x1, y1]) => [
    rounded(x0 / result.width),
    rounded(y0 / result.height),
    rounded(x1 / result.width),
    rounded(y1 / result.height),
  ];
  const components = result.components.map((component) => {
    const loops = component.loops ?? [];
    const strokes = component.strokes ?? [];
    return {
      kind: component.ellipse ? "ellipse" : component.rect ? "rect" : component.strokedRegion ? "stroked-region" : strokes.length ? "strokes" : "loops",
      bbox: normalize(component.bbox),
      holes: loops.filter((loop) => loop.isHole).length + (component.ellipse?.strokeWidthPx > 0 && component.ellipse?.fillLevel >= 245 ? 1 : 0),
      contourBounds: loops.map((loop) => normalize(boundsOf(loop.points))),
      strokeBounds: strokes.map((strokePath) => normalize(boundsOf(strokePath.points))),
    };
  });
  return {
    componentCount: components.length,
    holeCount: components.reduce((total, component) => total + component.holes, 0),
    components,
  };
}

function convert(fixture) {
  return vectorizeImage({ width: fixture.width, height: fixture.height, data: fixture.data }, fixture.options);
}

const fixtures = [];
for (const fixture of fixtureBytes()) {
  const ratio = denseInkRatio(fixture);
  if (ratio > 0.55) {
    fixtures.push({
      name: fixture.name,
      width: fixture.width,
      height: fixture.height,
      rgbaSha256: fixture.sha256,
      options: fixture.options,
      gate: { rejected: true, reason: "dense-ink", ratio: rounded(ratio) },
      pureConversionMs: { warmup: null, samples: [], p50: null, p95: null },
      geometry: null,
    });
    continue;
  }

  const iterationsPerSample = fixture.width * fixture.height >= 1_000_000 ? 2 : 100;
  const warmupStart = performance.now();
  let result;
  for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) result = convert(fixture);
  const warmup = (performance.now() - warmupStart) / iterationsPerSample;
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    for (let iteration = 0; iteration < iterationsPerSample; iteration += 1) result = convert(fixture);
    samples.push((performance.now() - startedAt) / iterationsPerSample);
  }
  fixtures.push({
    name: fixture.name,
    width: fixture.width,
    height: fixture.height,
    rgbaSha256: fixture.sha256,
    options: fixture.options,
    iterationsPerSample,
    gate: { rejected: false, reason: null, ratio: rounded(ratio) },
    pureConversionMs: {
      warmup: rounded(warmup),
      samples: samples.map(rounded),
      p50: rounded(percentile(samples, 0.5)),
      p95: rounded(percentile(samples, 0.95)),
    },
    geometry: geometry(result),
  });
}

const report = {
  schemaVersion: 1,
  phase,
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  repetitions,
  timingLabels: {
    pureConversionMs: "vectorizeImage only; excludes decode, preview Path2D/paint, and insertion",
    previewMs: "not measured by this DOM-free benchmark; recorded separately through CUA",
    insertionMs: "not measured by this DOM-free benchmark; recorded separately through CUA",
  },
  fixtures,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, serialized, "utf8");
process.stdout.write(serialized);
