#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { createWorker, OEM, PSM } from "tesseract.js";

import { scoreOcrText } from "./metrics.mjs";
import { MODEL_PROFILES, modelDirectory } from "./models.mjs";

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
  return {
    cases: cases.length,
    exactCases: cases.filter(item => item.score.exact).length,
    exactAccuracy: Number((cases.filter(item => item.score.exact).length / cases.length).toFixed(6)),
    expectedCharacters,
    editDistance,
    characterAccuracy: Number(Math.max(0, 1 - editDistance / expectedCharacters).toFixed(6)),
    characterErrorRate: Number((editDistance / expectedCharacters).toFixed(6)),
  };
}

const profile = argument("--profile");
const language = argument("--language");
const output = argument("--output");
const iterations = Number.parseInt(argument("--iterations", "3"), 10);
if (!MODEL_PROFILES[profile]) throw new RangeError(`Unknown profile: ${profile}`);
if (!new Set(["kor", "kor+eng"]).has(language)) throw new RangeError(`Unknown language: ${language}`);
if (!output) throw new Error("--output is required");
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) throw new RangeError("--iterations must be 1..20");

const fixtureManifests = await Promise.all([
  "tests/fixtures/image-ocr/manifest.json",
  "tests/fixtures/image-ocr/supplemental/manifest.json",
].map(async file => JSON.parse(await readFile(path.join(repositoryRoot, file), "utf8"))));
const fixtures = fixtureManifests.flatMap(manifest => manifest.fixtures);
const packageMetadata = JSON.parse(await readFile(path.join(experimentDirectory, "node_modules/tesseract.js/package.json"), "utf8"));
const languageCodes = language === "kor+eng" ? ["kor", "eng"] : ["kor"];
const baselineMemory = memorySnapshot();
const usageBefore = process.resourceUsage();
const benchmarkStarted = performance.now();
const initializationStarted = performance.now();
const worker = await createWorker(languageCodes, OEM.LSTM_ONLY, {
  langPath: path.join(modelDirectory, profile),
  gzip: false,
  cacheMethod: "none",
});
await worker.setParameters({
  tessedit_pageseg_mode: PSM.SINGLE_LINE,
  preserve_interword_spaces: "1",
  user_defined_dpi: "300",
});
const initializationMs = performance.now() - initializationStarted;
const initializedMemory = memorySnapshot();
const cases = [];

try {
  for (const fixture of fixtures) {
    const image = await readFile(path.join(repositoryRoot, "tests/fixtures/image-ocr", fixture.png));
    const runs = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = performance.now();
      const result = await worker.recognize(image);
      runs.push({
        runtimeMs: rounded(performance.now() - started),
        text: result.data.text,
        confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
      });
    }
    const score = scoreOcrText(fixture.expected, runs[0].text);
    cases.push({
      id: fixture.id,
      categories: fixture.categories,
      expected: fixture.expected,
      actual: score.actualText,
      confidence: runs[0].confidence,
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
  await worker.terminate();
}

const finalMemory = memorySnapshot();
const usageAfter = process.resourceUsage();
const categories = {};
for (const category of [...new Set(cases.flatMap(item => item.categories))].sort()) {
  categories[category] = aggregate(cases.filter(item => item.categories.includes(category)));
}
const profileSpecification = MODEL_PROFILES[profile];
const report = {
  schema: "5e-image-ocr-candidate-run@1",
  candidate: `tesseract-js-${profile}/${language}`,
  engine: `tesseract.js@${packageMetadata.version}`,
  profile,
  language,
  languageCodes,
  iterationsPerFixture: iterations,
  pageSegmentationMode: "SINGLE_LINE",
  models: languageCodes.map(code => ({
    language: code,
    bytes: profileSpecification.files[code].bytes,
    sha256: profileSpecification.files[code].sha256,
    repository: profileSpecification.repository,
    revision: profileSpecification.revision,
  })),
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
