#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { PaddleOcrService } from "ppu-paddle-ocr";

import { scoreOcrText } from "./metrics.mjs";
import { PADDLE_MODEL_PROFILE, paddleModelPath } from "./models.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDirectory, "../..");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function rounded(value) {
  return Number(value.toFixed(3));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  };
}

function aggregate(cases) {
  const expectedCharacters = cases.reduce((sum, item) => sum + item.score.expectedCharacters, 0);
  const editDistance = cases.reduce((sum, item) => sum + item.score.editDistance, 0);
  const exactCases = cases.filter(item => item.score.exact).length;
  return {
    cases: cases.length,
    exactCases,
    exactAccuracy: Number((exactCases / cases.length).toFixed(6)),
    expectedCharacters,
    editDistance,
    characterAccuracy: Number(Math.max(0, 1 - editDistance / expectedCharacters).toFixed(6)),
    characterErrorRate: Number((editDistance / expectedCharacters).toFixed(6)),
  };
}

const output = argument("--output");
const iterations = Number.parseInt(argument("--iterations", "3"), 10);
if (!output) throw new Error("--output is required");
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) {
  throw new RangeError("--iterations must be 1..20");
}

const fixtureManifests = await Promise.all([
  "tests/fixtures/image-ocr/manifest.json",
  "tests/fixtures/image-ocr/supplemental/manifest.json",
].map(async file => JSON.parse(await readFile(path.join(repositoryRoot, file), "utf8"))));
const fixtures = fixtureManifests.flatMap(manifest => manifest.fixtures);
const packageMetadata = JSON.parse(await readFile(path.join(experimentDirectory, "node_modules/ppu-paddle-ocr/package.json"), "utf8"));
const baselineMemory = memorySnapshot();
const usageBefore = process.resourceUsage();
const benchmarkStarted = performance.now();
const initializationStarted = performance.now();
const service = new PaddleOcrService({
  model: {
    detection: paddleModelPath("detection"),
    recognition: paddleModelPath("recognition"),
    charactersDictionary: paddleModelPath("dictionary"),
  },
  processing: { engine: "canvas-native" },
  recognition: { strategy: "per-line", minimumConfidence: 0 },
  session: {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    executionMode: "sequential",
    interOpNumThreads: 1,
    intraOpNumThreads: 4,
  },
});
await service.initialize();
const initializationMs = performance.now() - initializationStarted;
const initializedMemory = memorySnapshot();
const cases = [];

try {
  for (const fixture of fixtures) {
    const image = path.join(repositoryRoot, "tests/fixtures/image-ocr", fixture.png);
    const runs = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance.now();
      const result = await service.recognize(image, { flatten: true, noCache: true });
      runs.push({
        runtimeMs: rounded(performance.now() - started),
        text: result.text,
        confidence: Number.isFinite(result.confidence) ? result.confidence : null,
      });
    }
    const score = scoreOcrText(fixture.expected, runs[0].text);
    cases.push({
      id: fixture.id,
      categories: fixture.categories,
      expected: fixture.expected,
      actual: score.actualText,
      confidence: runs[0].confidence,
      confidenceScale: "0..1",
      outputStable: runs.every(run => scoreOcrText(fixture.expected, run.text).actualText === score.actualText),
      runtimeMs: {
        samples: runs.map(run => run.runtimeMs),
        median: rounded(median(runs.map(run => run.runtimeMs))),
        min: Math.min(...runs.map(run => run.runtimeMs)),
        max: Math.max(...runs.map(run => run.runtimeMs)),
      },
      score: {
        exact: score.exact,
        expectedCharacters: score.expectedCharacters,
        actualCharacters: score.actualCharacters,
        editDistance: score.editDistance,
        characterAccuracy: score.characterAccuracy,
        characterErrorRate: score.characterErrorRate,
        misreads: score.misreads,
      },
    });
  }
} finally {
  await service.destroy();
}

const finalMemory = memorySnapshot();
const usageAfter = process.resourceUsage();
const categories = {};
for (const category of [...new Set(cases.flatMap(item => item.categories))].sort()) {
  categories[category] = aggregate(cases.filter(item => item.categories.includes(category)));
}
const models = Object.entries(PADDLE_MODEL_PROFILE.files).map(([name, specification]) => ({
  name,
  bytes: specification.bytes,
  sha256: specification.sha256,
  repository: PADDLE_MODEL_PROFILE.repository,
  revision: PADDLE_MODEL_PROFILE.revision,
  path: specification.path,
}));
const report = {
  schema: "5e-image-ocr-candidate-run@1",
  candidate: "ppu-paddle-ocr-v5-korean/canvas-native",
  engine: `ppu-paddle-ocr@${packageMetadata.version} + onnxruntime-node@1.23.2`,
  profile: "PP-OCRv5 Korean mobile",
  language: "kor+eng",
  iterationsPerFixture: iterations,
  processingEngine: "canvas-native",
  inferenceProvider: "cpu",
  models,
  aggregate: aggregate(cases),
  categories,
  cases,
  runtime: {
    initializationMs: rounded(initializationMs),
    recognitionMedianSumMs: rounded(cases.reduce((sum, item) => sum + item.runtimeMs.median, 0)),
    totalWallMs: rounded(performance.now() - benchmarkStarted),
    userCpuMs: rounded((usageAfter.userCPUTime - usageBefore.userCPUTime) / 1000),
    systemCpuMs: rounded((usageAfter.systemCPUTime - usageBefore.systemCPUTime) / 1000),
  },
  memory: {
    baseline: baselineMemory,
    afterInitialization: initializedMemory,
    afterTermination: finalMemory,
    processPeakRssBytes: usageAfter.maxRSS * 1024,
    processPeakRssUnitSource: "process.resourceUsage().maxRSS KiB",
  },
  download: {
    modelBytes: models.reduce((sum, model) => sum + model.bytes, 0),
    note: "Exact pinned detection, Korean recognition, and dictionary bytes; package/runtime transfer size is reported separately.",
  },
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0]?.model || null,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
