const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(repositoryRoot, relativePath)).href);
}

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = String(url);
    this.options = options;
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  respond(data) {
    this.onmessage?.({ data });
  }

  fail(message = "worker failed") {
    this.onerror?.({ message, preventDefault() {} });
  }
}

function geometrySignature(result) {
  const rounded = (value) => Math.round(value * 1_000_000) / 1_000_000;
  const normalizedBounds = (points) => {
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
    return [rounded(x0 / result.width), rounded(y0 / result.height), rounded(x1 / result.width), rounded(y1 / result.height)];
  };
  const components = result.components.map((component) => {
    const loops = component.loops ?? [];
    const strokes = component.strokes ?? [];
    return {
      kind: component.ellipse ? "ellipse" : component.rect ? "rect" : component.strokedRegion ? "stroked-region" : strokes.length ? "strokes" : "loops",
      bbox: [
        rounded(component.bbox[0] / result.width),
        rounded(component.bbox[1] / result.height),
        rounded(component.bbox[2] / result.width),
        rounded(component.bbox[3] / result.height),
      ],
      holes: loops.filter((loop) => loop.isHole).length + (component.ellipse?.strokeWidthPx > 0 && component.ellipse?.fillLevel >= 245 ? 1 : 0),
      contourBounds: loops.map((loop) => normalizedBounds(loop.points)),
      strokeBounds: strokes.map((strokePath) => normalizedBounds(strokePath.points)),
    };
  });
  return {
    componentCount: components.length,
    holeCount: components.reduce((total, component) => total + component.holes, 0),
    components,
  };
}

test.beforeEach(() => {
  FakeWorker.instances = [];
});

test("pure analyzer rejects malformed, oversized, and dense image payloads before vectorization", async () => {
  const { analyzeImageData, MAX_PROCESS_DIMENSION } = await importModule("js/image-analysis.js");
  const pixel = new Uint8ClampedArray([255, 255, 255, 255]);

  assert.throws(() => analyzeImageData({ width: 0, height: 1, data: pixel }), { code: "INVALID_DIMENSIONS" });
  assert.throws(() => analyzeImageData({ width: 2, height: 2, data: pixel }), { code: "INVALID_BUFFER" });
  assert.throws(
    () => analyzeImageData({ width: MAX_PROCESS_DIMENSION + 1, height: 1, data: new Uint8ClampedArray((MAX_PROCESS_DIMENSION + 1) * 4) }),
    { code: "IMAGE_TOO_LARGE" },
  );

  const dense = new Uint8ClampedArray(10 * 10 * 4);
  for (let index = 3; index < dense.length; index += 4) dense[index] = 255;
  assert.throws(() => analyzeImageData({ width: 10, height: 10, data: dense }), { code: "DENSE_INK" });
});

test("pure analyzer preserves every frozen fixture's exact baseline geometry and thin strokes", async () => {
  const { analyzeImageData } = await importModule("js/image-analysis.js");
  const { fixtureBytes } = await importModule("tests/fixtures/local-converter-fixtures.mjs");
  const baseline = JSON.parse(await readFile(path.join(repositoryRoot, "desktop/test-fixtures/local-converter-baseline.json"), "utf8"));

  for (const fixture of fixtureBytes()) {
    const expected = baseline.fixtures.find(({ name }) => name === fixture.name);
    if (expected.gate.rejected) {
      assert.throws(
        () => analyzeImageData(fixture),
        { code: "DENSE_INK" },
        `${fixture.name} must retain its dense-ink rejection`,
      );
      continue;
    }
    const { result } = analyzeImageData(fixture);
    assert.deepEqual(geometrySignature(result), expected.geometry, `${fixture.name} exact normalized geometry`);
  }

  const thin = fixtureBytes().find(({ name }) => name === "thin-black-gray");
  assert.equal(analyzeImageData(thin).result.components.length, 2, "black and gray one-pixel strokes must both survive");
});

test("controller posts transferable image bytes to a module worker with a monotonic job ID", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  const controller = createImageAnalysisController({ WorkerClass: FakeWorker });
  const data = new Uint8ClampedArray([255, 255, 255, 255]);
  const pending = controller.analyze({ width: 1, height: 1, data, options: { minArea: 1 } });
  const worker = FakeWorker.instances[0];

  assert.equal(worker.options.type, "module");
  assert.match(worker.url, /image-analysis-worker\.js$/);
  assert.equal(worker.messages.length, 0, "pixels stay available until the module worker confirms it loaded");
  worker.respond({ type: "ready" });
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].message.jobId, 1);
  assert.deepEqual(worker.messages[0].transfer, [data.buffer]);
  worker.respond({ jobId: 1, ok: true, value: { result: { width: 1, height: 1, components: [] }, inkRatio: 0 } });
  assert.deepEqual(await pending, { result: { width: 1, height: 1, components: [] }, inkRatio: 0, mode: "worker", jobId: 1 });
  controller.close();
});

test("new jobs terminate prior work and ignore a late stale result", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  const controller = createImageAnalysisController({ WorkerClass: FakeWorker });
  const first = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const firstRejection = assert.rejects(first, { code: "SUPERSEDED" });
  const firstWorker = FakeWorker.instances[0];
  const second = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const secondWorker = FakeWorker.instances[1];

  assert.equal(firstWorker.terminated, true);
  firstWorker.respond({ jobId: 1, ok: true, value: { result: { components: [{ stale: true }] } } });
  secondWorker.respond({ type: "ready" });
  secondWorker.respond({ jobId: 2, ok: true, value: { result: { components: [{ fresh: true }] }, inkRatio: 0 } });
  await firstRejection;
  assert.deepEqual((await second).result.components, [{ fresh: true }]);
  controller.close();
});

test("cancel and close terminate resources and never publish a result", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  const controller = createImageAnalysisController({ WorkerClass: FakeWorker });
  const cancelled = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const worker = FakeWorker.instances[0];
  controller.cancel();
  controller.cancel();
  await assert.rejects(cancelled, { code: "CANCELLED" });
  assert.equal(worker.terminated, true);
  worker.respond({ jobId: 1, ok: true, value: { result: { components: [{ late: true }] } } });

  controller.close();
  controller.close();
  await assert.rejects(
    controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} }),
    { code: "CONTROLLER_CLOSED" },
  );

  const closingController = createImageAnalysisController({ WorkerClass: FakeWorker });
  const closing = closingController.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const closingWorker = FakeWorker.instances.at(-1);
  closingController.close();
  await assert.rejects(closing, { code: "CANCELLED" });
  assert.equal(closingWorker.terminated, true);
});

test("worker-unavailable fallback remains usable and is labeled without a responsiveness claim", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  let fallbackCalls = 0;
  const fallbackValue = { result: { width: 1, height: 1, components: [] }, inkRatio: 0 };
  const controller = createImageAnalysisController({
    WorkerClass: null,
    fallbackAnalyze() {
      fallbackCalls += 1;
      return fallbackValue;
    },
  });

  const value = await controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(value, { ...fallbackValue, mode: "fallback", jobId: 1 });
  assert.equal(controller.mode, "fallback");
  controller.close();
});

test("asynchronous module-worker load failure falls back before pixels are transferred", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  const data = new Uint8ClampedArray([255, 255, 255, 255]);
  const fallbackValue = { result: { width: 1, height: 1, components: [] }, inkRatio: 0 };
  const controller = createImageAnalysisController({ WorkerClass: FakeWorker, fallbackAnalyze: () => fallbackValue });
  const pending = controller.analyze({ width: 1, height: 1, data, options: {} });
  const worker = FakeWorker.instances[0];

  assert.equal(worker.messages.length, 0);
  worker.fail("module workers unavailable");
  assert.deepEqual(await pending, { ...fallbackValue, mode: "fallback", jobId: 1 });
  assert.equal(data.byteLength, 4, "fallback still owns the original pixels");
  assert.equal(worker.terminated, true);
  controller.close();
});

test("pagehide-style suspension terminates work but permits analysis after restore", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  const controller = createImageAnalysisController({ WorkerClass: FakeWorker });
  const interrupted = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const interruptedWorker = FakeWorker.instances[0];
  controller.suspend();
  controller.suspend();
  await assert.rejects(interrupted, { code: "CANCELLED" });
  assert.equal(interruptedWorker.terminated, true);

  const resumed = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const resumedWorker = FakeWorker.instances[1];
  resumedWorker.respond({ type: "ready" });
  resumedWorker.respond({ jobId: 2, ok: true, value: { result: { width: 1, height: 1, components: [] }, inkRatio: 0 } });
  assert.equal((await resumed).jobId, 2);
  controller.close();
});

test("module-worker readiness timeout falls back instead of hanging", async () => {
  const { createImageAnalysisController } = await importModule("js/image-analysis-controller.js");
  let timeoutCallback = null;
  const fallbackValue = { result: { width: 1, height: 1, components: [] }, inkRatio: 0 };
  const controller = createImageAnalysisController({
    WorkerClass: FakeWorker,
    fallbackAnalyze: () => fallbackValue,
    scheduleWorkerTimeout(callback) {
      timeoutCallback = callback;
      return 1;
    },
    cancelWorkerTimeout() {},
  });
  const pending = controller.analyze({ width: 1, height: 1, data: new Uint8ClampedArray(4), options: {} });
  const worker = FakeWorker.instances[0];
  assert.equal(worker.messages.length, 0);
  timeoutCallback();
  assert.deepEqual(await pending, { ...fallbackValue, mode: "fallback", jobId: 1 });
  assert.equal(worker.terminated, true);
  controller.close();
});

test("converter modal returns from page suspension with retry enabled and stale completions ignored", () => {
  execFileSync(process.execPath, ["desktop/test-fixtures/converter-lifecycle.cjs"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
});
