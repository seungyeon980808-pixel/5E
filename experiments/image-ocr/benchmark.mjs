#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  unavailablePaddleCandidate,
  unavailableTesseractCandidate,
} from "./benchmark-failures.mjs";
import {
  DEFAULT_CANDIDATE_TIMEOUT_MS,
  MAX_CANDIDATE_TIMEOUT_MS,
  runCandidateProcess,
} from "./benchmark-process.mjs";
import { createBenchmarkResourceInspector } from "./benchmark-resources.mjs";
import { MODEL_PROFILES, prepareModels, preparePaddleModels } from "./models.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDirectory, "../..");
const temporaryDirectory = path.join(experimentDirectory, ".tmp");
const { browserAsset, packageInventory } = createBenchmarkResourceInspector(experimentDirectory);

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runCandidate({ profile, language, iterations, output, timeoutMs }) {
  return runCandidateProcess(path.join(experimentDirectory, "benchmark-candidate.mjs"), [
    "--profile", profile,
    "--language", language,
    "--iterations", String(iterations),
    "--output", output,
  ], { cwd: repositoryRoot, timeoutMs });
}

function runPaddleCandidate({ iterations, output, timeoutMs }) {
  return runCandidateProcess(path.join(experimentDirectory, "benchmark-paddle-candidate.mjs"), [
    "--iterations", String(iterations),
    "--output", output,
  ], { cwd: repositoryRoot, timeoutMs });
}

const outputArgument = argument("--output", "benchmarks/image-ocr/track-e-results.json");
const outputFile = path.resolve(repositoryRoot, outputArgument);
const profiles = argument("--profiles", "fast,best").split(",").filter(Boolean);
const languages = argument("--languages", "kor,kor+eng").split(",").filter(Boolean);
const iterations = Number.parseInt(argument("--iterations", "3"), 10);
const candidateTimeoutMs = Number.parseInt(
  argument("--candidate-timeout-ms", String(DEFAULT_CANDIDATE_TIMEOUT_MS)),
  10,
);
const offline = process.argv.includes("--offline");
if (!profiles.length || profiles.some(profile => !MODEL_PROFILES[profile])) throw new RangeError("--profiles contains an unknown profile");
if (!languages.length || languages.some(language => !new Set(["kor", "kor+eng"]).has(language))) throw new RangeError("--languages contains an unknown language");
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) throw new RangeError("--iterations must be 1..20");
if (!Number.isInteger(candidateTimeoutMs) || candidateTimeoutMs < 1 || candidateTimeoutMs > MAX_CANDIDATE_TIMEOUT_MS) {
  throw new RangeError(`--candidate-timeout-ms must be 1..${MAX_CANDIDATE_TIMEOUT_MS}`);
}

await mkdir(temporaryDirectory, { recursive: true });
const candidateReports = [];
try {
  for (const profile of profiles) {
    try {
      await prepareModels([profile], { offline });
    } catch (error) {
      for (const language of languages) {
        const unavailable = unavailableTesseractCandidate(
          profile,
          language,
          { wallMs: 0, stderr: "", spawnError: error.message, exitCode: null, signal: null },
          error,
          "model-prepare",
        );
        candidateReports.push(unavailable);
        console.error(`Recorded ${unavailable.candidate} unavailable: ${unavailable.failure.diagnostic}`);
      }
      continue;
    }
    for (const language of languages) {
      const temporaryOutput = path.join(temporaryDirectory, `${profile}-${language.replace("+", "-")}.json`);
      console.error(`Benchmarking tesseract.js ${profile}/${language}...`);
      const run = await runCandidate({
        profile,
        language,
        iterations,
        output: temporaryOutput,
        timeoutMs: candidateTimeoutMs,
      });
      if (run.timedOut || run.exitCode !== 0 || run.spawnError) {
        const unavailable = unavailableTesseractCandidate(profile, language, run);
        candidateReports.push(unavailable);
        console.error(`Recorded ${unavailable.candidate} unavailable: ${unavailable.failure.diagnostic}`);
        continue;
      }
      try {
        const candidate = JSON.parse(await readFile(temporaryOutput, "utf8"));
        candidate.status = "measured";
        candidate.feasible = true;
        candidateReports.push(candidate);
      } catch (error) {
        candidateReports.push(unavailableTesseractCandidate(profile, language, run, error));
      }
    }
  }

  const paddleOutput = path.join(temporaryDirectory, "paddle-v5-korean.json");
  console.error("Benchmarking ppu-paddle-ocr PP-OCRv5 Korean mobile/canvas-native...");
  try {
    await preparePaddleModels({ offline });
    const run = await runPaddleCandidate({
      iterations,
      output: paddleOutput,
      timeoutMs: candidateTimeoutMs,
    });
    if (run.timedOut || run.exitCode !== 0 || run.spawnError) {
      const unavailable = unavailablePaddleCandidate(run, "candidate-process");
      candidateReports.push(unavailable);
      console.error(`Recorded ${unavailable.candidate} unavailable: ${unavailable.failure.diagnostic}`);
    } else {
      try {
        const candidate = JSON.parse(await readFile(paddleOutput, "utf8"));
        candidate.status = "measured";
        candidate.feasible = true;
        candidateReports.push(candidate);
      } catch (error) {
        candidateReports.push(unavailablePaddleCandidate(run, "result-read", error));
      }
    }
  } catch (error) {
    const unavailable = unavailablePaddleCandidate({ wallMs: 0, stderr: "" }, "model-prepare", error);
    candidateReports.push(unavailable);
    console.error(`Recorded ${unavailable.candidate} unavailable: ${unavailable.failure.diagnostic}`);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

const browserCommon = [
  await browserAsset("tesseract.js/dist/tesseract.esm.min.js"),
  await browserAsset("tesseract.js/dist/worker.min.js"),
];
const browserCores = await Promise.all([
  "tesseract.js-core/tesseract-core-lstm.wasm.js",
  "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
  "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
].map(browserAsset));
const commonBytes = browserCommon.reduce((sum, item) => sum + item.bytes, 0);
const commonGzipBytes = browserCommon.reduce((sum, item) => sum + item.gzipBytes, 0);
const commonBrotliBytes = browserCommon.reduce((sum, item) => sum + item.brotliBytes, 0);
for (const candidate of candidateReports.filter(item => item.candidate.startsWith("tesseract-js-"))) {
  const modelBytes = candidate.models.reduce((sum, item) => sum + item.bytes, 0);
  candidate.download = {
    modelBytes,
    browserColdUncompressedBytesRange: [
      commonBytes + Math.min(...browserCores.map(item => item.bytes)) + modelBytes,
      commonBytes + Math.max(...browserCores.map(item => item.bytes)) + modelBytes,
    ],
    note: "Range loads one compatible LSTM core. HTTP compression and cache behavior depend on deployment; modelBytes are exact raw pinned downloads.",
  };
}

const fixtureManifestFiles = [
  "tests/fixtures/image-ocr/manifest.json",
  "tests/fixtures/image-ocr/supplemental/manifest.json",
];
const fixtureManifests = await Promise.all(fixtureManifestFiles.map(async file => ({
  file,
  bytes: await readFile(path.join(repositoryRoot, file)),
})));
const packageLock = await readFile(path.join(experimentDirectory, "package-lock.json"));
const sourceFiles = await Promise.all([
  "benchmark.mjs",
  "benchmark-candidate.mjs",
  "benchmark-paddle-candidate.mjs",
  "benchmark-process.mjs",
  "benchmark-failures.mjs",
  "benchmark-resources.mjs",
  "metrics.mjs",
  "models.mjs",
  "fixture-spec.mjs",
  "build-fixtures.mjs",
].map(async file => ({ file, sha256: sha256(await readFile(path.join(experimentDirectory, file))) })));
const report = {
  schema: "5e-image-ocr-benchmark@1",
  track: "E",
  measuredAt: new Date().toISOString(),
  fixtureManifests: fixtureManifests.map(item => ({ file: item.file, sha256: sha256(item.bytes) })),
  packageLockSha256: sha256(packageLock),
  sourceFiles,
  protocol: {
    engines: ["tesseract.js@7.0.0", "ppu-paddle-ocr@6.5.1 + onnxruntime-node@1.23.2"],
    profiles,
    languages,
    iterationsPerFixture: iterations,
    candidateProcessTimeoutMs: candidateTimeoutMs,
    timedOutCandidateDisposition: "status=unavailable, code=CANDIDATE_PROCESS_TIMEOUT, process tree terminated",
    fixtureCount: fixtureManifests.reduce((sum, item) => sum + JSON.parse(item.bytes).fixtures.length, 0),
    scoring: "NFC and layout-whitespace normalization, then Unicode-code-point Levenshtein distance; exact accuracy is exact fixtures / fixtures; character accuracy is max(0, 1 - aggregate edit distance / expected characters).",
    paidApiCalls: 0,
    imageAiCalls: 0,
  },
  dependency: {
    tesseractRuntime: await packageInventory("tesseract.js"),
    paddleWrapperRuntime: await packageInventory("ppu-paddle-ocr"),
    paddleNodeInferenceRuntime: await packageInventory("onnxruntime-node"),
    browserCommon,
    browserCores,
    browserCommonCompressedTotals: {
      uncompressedBytes: commonBytes,
      gzipBytes: commonGzipBytes,
      brotliBytes: commonBrotliBytes,
    },
    fixtureRendererExcludedFromRuntime: "@resvg/resvg-js@2.6.2 is used only to reproduce fixtures.",
  },
  candidates: candidateReports,
  summary: {
    measuredCandidates: candidateReports.filter(candidate => candidate.status === "measured").length,
    unavailableCandidates: candidateReports.filter(candidate => candidate.status === "unavailable").length,
    timedOutCandidates: candidateReports.filter(candidate => candidate.failure?.timedOut).length,
    automaticReplacementEnabled: false,
    activationDecision: "off",
  },
  environment: {
    node: process.version,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpu: os.cpus()[0]?.model || null,
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  limitations: [
    "Tesseract Node worker-thread measurements use the same WebAssembly OCR core but are not browser-device timings.",
    "The Paddle probe uses native ONNX Runtime CPU for reproducibility; browser canvas/ONNX support is documented but browser timings were not measured.",
    "Synthetic single-line fixtures do not establish accuracy on arbitrary scans, handwriting, rotated labels, or full diagrams.",
    "Peak RSS is process.resourceUsage().maxRSS for one isolated candidate process; concurrent visitors were not tested.",
    "Confidence is recorded as engine evidence and is not an acceptance or replacement gate.",
    "An unavailable or timed-out profile remains in the result set with its exact runtime diagnostic; it is not an accuracy result.",
    "Every candidate child has a bounded deadline; timeout evidence records the deadline and requested process-tree termination method.",
  ],
};
await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${path.relative(repositoryRoot, outputFile)}`);
