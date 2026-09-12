import assert from "node:assert/strict";
import test from "node:test";

import { createRenderScheduler } from "../js/pdf-library/render-scheduler.js";
import { pdfRenderDpi } from "../js/pdf-library/pdf-library-ui.js";

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

test("Given queued thumbnails and a selected preview, the preview runs before pending thumbnail work", async () => {
  // Given
  const scheduler = createRenderScheduler();
  const gate = deferred();
  const order = [];
  const active = scheduler.run(async () => { order.push("active"); await gate.promise; });
  const thumbnail = scheduler.run(() => { order.push("thumbnail"); }, { priority: 0 });

  // When
  const preview = scheduler.run(() => { order.push("preview"); }, { priority: 2, key: "preview" });
  gate.resolve();
  await Promise.all([active, thumbnail, preview]);

  // Then
  assert.deepEqual(order, ["active", "preview", "thumbnail"]);
});

test("Given rapid preview changes, the newest preview aborts the stale active render and is delivered", async () => {
  // Given
  const scheduler = createRenderScheduler();
  let staleSignal;
  const stale = scheduler.run((signal) => new Promise((_resolve, reject) => {
    staleSignal = signal;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }), { priority: 2, key: "preview" });
  await Promise.resolve();

  // When
  const current = scheduler.run(() => "current", { priority: 2, key: "preview" });

  // Then
  await assert.rejects(stale, (error) => error.name === "AbortError");
  assert.equal(staleSignal.aborted, true);
  assert.equal(await current, "current");
});

test("Given a render failure, the scheduler releases the next operation", async () => {
  const scheduler = createRenderScheduler();
  const failed = scheduler.run(() => { throw new Error("encode failed"); });
  const recovered = scheduler.run(() => "recovered");
  await assert.rejects(failed, /encode failed/u);
  assert.equal(await recovered, "recovered");
});

test("Given an already cancelled request, it cannot remove other queued work", async () => {
  // Given
  const scheduler = createRenderScheduler();
  const gate = deferred();
  const order = [];
  const active = scheduler.run(() => gate.promise);
  const queued = scheduler.run(() => { order.push("queued"); });
  const controller = new AbortController();
  controller.abort(new DOMException("Cancelled", "AbortError"));

  // When
  const cancelled = scheduler.run(() => { order.push("cancelled"); }, { signal: controller.signal });
  gate.resolve();

  // Then
  await assert.rejects(cancelled, (error) => error.name === "AbortError");
  await Promise.all([active, queued]);
  assert.deepEqual(order, ["queued"]);
});

test("Preview and crop-editor displays use fewer pixels while export materialization remains 300 dpi", () => {
  assert.equal(pdfRenderDpi({ thumbnail: true }), 96);
  assert.equal(pdfRenderDpi({ preview: true }), 144);
  assert.equal(pdfRenderDpi({ original: true }), 144);
  assert.equal(pdfRenderDpi({}), 300);
});
