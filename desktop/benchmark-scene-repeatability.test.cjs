const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CASES,
  DEFAULT_OUTPUT,
  cloneCorrectionHistory,
  parseArgs,
  updateSummary,
  validateBenchmarkDocument,
} = require("./benchmark-scene-repeatability.cjs");

function successfulRun(run) {
  return {
    run,
    pass: true,
    timingsMs: { total: 1000 + run, model: 990 + run, compileWall: 1.25 },
    safety: { imageCalls: 0, toolCalls: 0 },
    hashes: { responseSha256: `response-${run}`, sceneSha256: `scene-${run}` },
  };
}

function fixture() {
  const document = {
    schema: "5e-fast-scene-repeatability@1",
    configuration: { model: "luna", effort: "low", serviceTier: "priority" },
    cases: CASES.map((item) => ({
      id: item.id,
      subject: item.subject,
      type: item.type,
      title: item.title,
      request: item.request,
      modelInput: `wrapped:${item.request}`,
      runs: [successfulRun(1), successfulRun(2), { ...successfulRun(3), pass: false }],
    })),
  };
  return updateSummary(document);
}

test("repeatability corpus covers every requested motif and all four subjects", () => {
  assert.ok(CASES.length >= 8);
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length);
  assert.deepEqual(new Set(CASES.map((item) => item.subject)), new Set(["physics", "chemistry", "biology", "earth-science"]));
  for (const type of ["circuit", "pulley-spring", "lens-mirror", "vessel-particles", "graph", "panel-flow", "dual-axis", "contour", "wiring"]) {
    assert.ok(CASES.some((item) => item.type === type), `missing ${type}`);
  }
});

test("verify requires two of three passes and zero image/tool calls", () => {
  const document = fixture();
  assert.deepEqual(validateBenchmarkDocument(document), { ok: true, errors: [] });

  document.cases[0].runs[0].safety.imageCalls = 1;
  document.cases[0].runs[1].pass = false;
  updateSummary(document);
  const verification = validateBenchmarkDocument(document);
  assert.equal(verification.ok, false);
  assert.ok(verification.errors.some((error) => error.includes("imageGeneration call detected")));
  assert.ok(verification.errors.some((error) => error.includes("at least 2 are required")));
});

test("CLI remains bounded to three runs", () => {
  assert.equal(parseArgs(["--runs", "3"]).runs, 3);
  assert.throws(() => parseArgs(["--runs", "4"]), /1 to 3/);
});

test("a full rerun carries forward prior correction history without sharing mutable objects", () => {
  const saved = { correctionHistory: [{ caseId: "prior-failure", priorCase: { runs: [{ pass: false }] } }] };
  const copied = cloneCorrectionHistory(saved);
  assert.deepEqual(copied, saved.correctionHistory);
  assert.notEqual(copied, saved.correctionHistory);
  copied[0].priorCase.runs[0].pass = true;
  assert.equal(saved.correctionHistory[0].priorCase.runs[0].pass, false);
  assert.deepEqual(cloneCorrectionHistory(null), []);
});

test("verify rejects a saved benchmark produced by stale prompt or motif modules", () => {
  const document = fixture();
  document.configuration.promptVersion = "5e-fast-scene-prompt@6";
  document.configuration.motifCatalogVersion = "5e-motif-catalog@4";
  assert.deepEqual(validateBenchmarkDocument(document, {
    promptVersion: "5e-fast-scene-prompt@6",
    motifCatalogVersion: "5e-motif-catalog@4",
  }), { ok: true, errors: [] });
  const stale = validateBenchmarkDocument(document, {
    promptVersion: "5e-fast-scene-prompt@7",
    motifCatalogVersion: "5e-motif-catalog@5",
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.some((error) => error.includes("Saved prompt version")));
  assert.ok(stale.errors.some((error) => error.includes("Saved motif catalog version")));
});

test("--verify exits nonzero when the saved artifact version is stale", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "5e-scene-verify-"));
  const outputPath = path.join(tempDir, "stale.json");
  try {
    const document = fixture();
    document.configuration.promptVersion = "5e-fast-scene-prompt@0";
    document.configuration.motifCatalogVersion = "5e-motif-catalog@0";
    fs.writeFileSync(outputPath, JSON.stringify(document), "utf8");
    const result = spawnSync(process.execPath, [path.join(__dirname, "benchmark-scene-repeatability.cjs"), "--verify", "--output", outputPath], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Saved prompt version/);
    assert.match(result.stdout, /Saved motif catalog version/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("committed live report satisfies the machine-checkable gate when present", { skip: !fs.existsSync(DEFAULT_OUTPUT) }, () => {
  const document = JSON.parse(fs.readFileSync(DEFAULT_OUTPUT, "utf8"));
  updateSummary(document);
  assert.deepEqual(validateBenchmarkDocument(document), { ok: true, errors: [] });
});

test("failed prompt and raw-response correction history remains hash-verifiable", () => {
  const historyPath = path.join(path.dirname(DEFAULT_OUTPUT), "fast-scene-correction-history.v1.json");
  const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  assert.equal(history.corrections.length, 6);
  assert.equal(history.corrections.flatMap((item) => item.initialRuns).length, 18);
  assert.deepEqual(new Set(history.corrections
    .filter((item) => item.initialPromptVersion === "5e-fast-scene-prompt@6")
    .map((item) => item.caseId)), new Set([
    "physics-series-circuit",
    "physics-pulley-spring",
    "earth-observatory-optics",
    "chemistry-vessel-particles",
  ]));
  for (const correction of history.corrections) {
    assert.ok(correction.exactRequest.length > 20);
    assert.deepEqual(correction.rerunResult, { passes: 3, runs: 3 });
    assert.ok(correction.initialRuns.some((run) => !run.pass));
    for (const run of correction.initialRuns) {
      assert.equal(run.imageCalls, 0);
      assert.equal(run.toolCalls, 0);
      assert.equal(crypto.createHash("sha256").update(run.responseText).digest("hex"), run.responseSha256);
    }
  }
});
