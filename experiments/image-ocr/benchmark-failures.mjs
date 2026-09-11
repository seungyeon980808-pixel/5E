import { MODEL_PROFILES, PADDLE_MODEL_PROFILE } from "./models.mjs";

function candidateModels(profile, language) {
  const specification = MODEL_PROFILES[profile];
  const languageCodes = language === "kor+eng" ? ["kor", "eng"] : ["kor"];
  return languageCodes.map(code => ({
    language: code,
    bytes: specification.files[code].bytes,
    sha256: specification.files[code].sha256,
    repository: specification.repository,
    revision: specification.revision,
  }));
}

function processEvidence(run) {
  return {
    exitCode: run.exitCode ?? null,
    signal: run.signal ?? null,
    timedOut: run.timedOut === true,
    timeoutMs: Number.isFinite(run.timeoutMs) ? run.timeoutMs : null,
    termination: run.termination ?? null,
  };
}

function processDiagnostic(run, outputError, fallback) {
  if (run.timedOut) {
    const method = run.termination?.method || "unknown tree-termination method";
    return `Candidate process exceeded its ${run.timeoutMs} ms deadline; termination requested via ${method}.`;
  }
  return run.stderr?.split("\n").map(line => line.trim()).find(line => line.startsWith("Error:"))
    || run.spawnError
    || outputError?.message
    || fallback;
}

export function unavailableTesseractCandidate(profile, language, run, outputError = null, stage = "worker-initialization") {
  const missingSymbol = run.timedOut
    ? null
    : run.stderr?.match(/Aborted\(missing function: [^)]+\)/)?.[0] || null;
  const diagnostic = missingSymbol || processDiagnostic(
    run,
    outputError,
    `Candidate process exited ${String(run.exitCode)}`,
  );
  return {
    schema: "5e-image-ocr-candidate-run@1",
    candidate: `tesseract-js-${profile}/${language}`,
    engine: "tesseract.js@7.0.0",
    profile,
    language,
    languageCodes: language === "kor+eng" ? ["kor", "eng"] : ["kor"],
    status: "unavailable",
    feasible: false,
    models: candidateModels(profile, language),
    aggregate: null,
    categories: {},
    cases: [],
    runtime: { totalWallMs: run.wallMs || 0 },
    memory: null,
    failure: {
      stage: run.timedOut ? "candidate-timeout" : stage,
      code: run.timedOut
        ? "CANDIDATE_PROCESS_TIMEOUT"
        : missingSymbol ? "TESSERACT_WASM_MISSING_SYMBOL" : "CANDIDATE_PROCESS_FAILED",
      diagnostic,
      ...processEvidence(run),
      scope: "Observed with the pinned profile on this benchmark runtime; not generalized to native Tesseract or every browser.",
    },
  };
}

export function unavailablePaddleCandidate(run, stage, error = null) {
  const diagnostic = processDiagnostic(
    run,
    error,
    `Candidate process exited ${String(run.exitCode)}`,
  );
  return {
    schema: "5e-image-ocr-candidate-run@1",
    candidate: "ppu-paddle-ocr-v5-korean/canvas-native",
    engine: "ppu-paddle-ocr@6.5.1 + onnxruntime-node@1.23.2",
    profile: "PP-OCRv5 Korean mobile",
    language: "kor+eng",
    status: "unavailable",
    feasible: false,
    models: Object.entries(PADDLE_MODEL_PROFILE.files).map(([name, specification]) => ({
      name,
      bytes: specification.bytes,
      sha256: specification.sha256,
      repository: PADDLE_MODEL_PROFILE.repository,
      revision: PADDLE_MODEL_PROFILE.revision,
      path: specification.path,
    })),
    aggregate: null,
    categories: {},
    cases: [],
    runtime: { totalWallMs: run.wallMs || 0 },
    memory: null,
    failure: {
      stage: run.timedOut ? "candidate-timeout" : stage,
      code: run.timedOut ? "CANDIDATE_PROCESS_TIMEOUT" : "PADDLE_CANDIDATE_UNAVAILABLE",
      diagnostic,
      ...processEvidence(run),
      scope: "Observed with the pinned optional experiment dependency and model files on this benchmark runtime.",
    },
  };
}
