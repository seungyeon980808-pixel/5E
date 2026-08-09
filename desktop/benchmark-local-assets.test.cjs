const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  CASES,
  DEFAULT_OUTPUT,
  RUNS_PER_CASE,
  renderMarkdown,
  runBenchmark,
  verifyReport,
} = require("./benchmark-local-assets.cjs");

test("strict local asset matcher and compiler stay zero-round-trip and deterministic", async (t) => {
  const report = await runBenchmark({ generatedAt: "test-run" });

  await t.test("covers all required safe configurations three times", () => {
    assert.equal(CASES.length, 19);
    assert.equal(RUNS_PER_CASE, 3);
    assert.equal(report.summary.caseCount, 19);
    assert.equal(report.summary.runCount, 57);
    assert.deepEqual(CASES.filter((item) => item.family === "verified-map").map((item) => item.mapVariant), [
      "world", "pacific", "east_asia", "korean_peninsula",
    ]);
    assert.ok(CASES.some((item) => item.id === "student-trio-no-bubbles"));
    assert.ok(CASES.some((item) => item.id === "student-trio-three-blank-bubbles"));
    assert.ok(CASES.some((item) => item.id === "spacecraft-simple-flat-shell"));
    assert.ok(CASES.some((item) => item.id === "spacecraft-wide-window-equipped"));
    for (const id of [
      "panel-flow-empty-box",
      "panel-flow-ordered-particles",
      "dual-axis-blank-five-divisions",
      "orthogonal-wiring-closed-rectangle",
      "diagonal-wiring-closed-triangle",
      "contour-bundle-five-nested",
      "simple-series-circuit-open",
      "fixed-pulley-spring-loads",
      "lens-mirror-screen-exact",
      "vessel-particle-comparison-locked",
      "logistic-population-graph-fixed",
    ]) {
      assert.ok(CASES.some((item) => item.id === id), id);
    }
  });

  await t.test("all strict matches compile without text or arrow violations", () => {
    assert.equal(report.ok, true, JSON.stringify(report.errors));
    assert.equal(report.summary.passedCases, CASES.length);
    assert.equal(report.summary.passedRuns, CASES.length * RUNS_PER_CASE);
    assert.equal(report.summary.allMatched, true);
    assert.equal(report.summary.allValidSupported, true);
    assert.equal(report.summary.zeroDiagramViolations, true);
    assert.equal(report.summary.zeroRoundTrip, true);
    assert.deepEqual(report.summary.externalCalls, { model: 0, imageGeneration: 0, tools: 0 });
    for (const item of report.cases) {
      assert.equal(item.passedRuns, 3, item.id);
      assert.equal(item.deterministic, true, item.id);
      assert.equal(item.failures.length, 0, item.id);
      assert.match(item.canonicalHashes.scene, /^[a-f0-9]{64}$/);
      assert.match(item.canonicalHashes.result, /^[a-f0-9]{64}$/);
      assert.equal(item.canonicalHashes.result, item.canonicalHashes.directResult, item.id);
      for (const run of item.runs) {
        assert.equal(run.diagramViolations.length, 0, `${item.id} run ${run.run}`);
        assert.equal(run.warnings.length, 0, `${item.id} run ${run.run}`);
        assert.equal(run.errors.length, 0, `${item.id} run ${run.run}`);
        if (item.family === "general-native") {
          assert.ok(run.checks.some((entry) => entry.name === "general-native-vector-only" && entry.pass), item.id);
          assert.equal(run.checks.some((entry) => entry.name === "code-native-provenance"), false, item.id);
        }
      }
    }
  });

  await t.test("saved benchmark fingerprints match a fresh local run", () => {
    assert.equal(fs.existsSync(DEFAULT_OUTPUT), true, "run benchmark:local-assets to create the saved artifact");
    const saved = JSON.parse(fs.readFileSync(DEFAULT_OUTPUT, "utf8"));
    const verification = verifyReport(report, saved);
    assert.equal(verification.ok, true, JSON.stringify(verification.errors));
  });

  await t.test("report states scope and limitations", () => {
    const markdown = renderMarkdown(report);
    assert.match(markdown, /zero-round-trip/i);
    assert.match(markdown, /no model, image generator, tool, or UI/i);
    assert.match(markdown, /Limitations/);
    assert.match(markdown, /three seated students/);
    assert.match(markdown, /general code-native motifs/);
  });
});
