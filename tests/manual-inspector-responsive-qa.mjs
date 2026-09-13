import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.INSPECTOR_QA_URL || "http://127.0.0.1:19610";
const out = process.env.INSPECTOR_QA_OUT || ".omo/evidence/usability-release/task-6/screenshots";
const results = [];
const stateEvidence = {};

const stateSnapshot = (page) => page.evaluate(async () => {
  const current = (await import("./js/state.js?v=1.4.0")).state.get();
  return JSON.parse(JSON.stringify({ objects: current.objects, selectedIds: current.selectedIds, undo: current.undoStack.length }));
});

async function drawRect(page, dx = 0) {
  const canvas = await page.locator("#canvas").boundingBox();
  await page.locator('[data-tool="RECT"]').click();
  await page.mouse.move(canvas.x + 160 + dx, canvas.y + 150);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 240 + dx, canvas.y + 215);
  await page.mouse.up();
}

async function assertContained(locator, container) {
  const outer = await container.boundingBox();
  for (const item of await locator.all()) {
    if (!(await item.isVisible())) continue;
    const box = await item.boundingBox();
    assert.ok(box.x >= outer.x - 1 && box.x + box.width <= outer.x + outer.width + 1, JSON.stringify({ outer, box }));
  }
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(url);
  const skip = page.getByRole("button", { name: "건너뛰기", exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await drawRect(page);
  await drawRect(page, 130);
  await page.evaluate(async () => {
    const { state } = await import("./js/state.js?v=1.4.0");
    state.update((value) => { value.selectedIds = value.objects.map((object) => object.id); });
  });

  await page.locator(".panel-right").evaluate((element) => { element.style.width = "215px"; });
  await page.evaluate(async () => {
    const { state } = await import("./js/state.js?v=1.4.0");
    state.update((value) => { value.selectedIds = [value.objects[0].id]; });
  });
  const xInput = page.locator(".insp-geometry-pair").first().locator('input[type="number"]').first();
  await xInput.fill("-1234.56");
  await page.locator(".panel-right").evaluate((element) => { element.style.width = "205px"; });
  assert.equal(await page.locator(".insp-geometry-pair").first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length), 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/inspector-narrow.png` });
  await xInput.press("Tab");
  assert.equal(await xInput.inputValue(), "-1234.56");
  await assertContained(page.locator(".insp-geometry-pair input, .insp-geometry-pair .insp-unit"), page.locator(".panel-right"));
  results.push({ scenario: "narrow inspector long signed decimal and resize-mid-edit", pass: true });
  await page.locator(".panel-right").evaluate((element) => { element.style.width = "360px"; });
  await page.waitForTimeout(400);
  await assertContained(page.locator(".panel-right input, .panel-right select, .panel-right .insp-unit"), page.locator(".panel-right"));
  await page.screenshot({ path: `${out}/inspector-wide.png` });
  await page.locator(".panel-right").evaluate((element) => { element.style.width = "205px"; });

  const trigger = page.locator(".fill-style-trigger");
  await trigger.focus();
  await trigger.press("ArrowDown");
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  const swatches = page.locator(".fill-style-option");
  assert.equal(await swatches.count(), 8);
  for (const swatch of await swatches.all()) assert.ok(await swatch.getAttribute("aria-label"));
  await page.getByRole("menuitemradio", { name: "도트" }).press("Enter");
  assert.match(await trigger.getAttribute("aria-label"), /도트/);
  await trigger.tap();
  await page.getByRole("menuitemradio", { name: "벽돌(석회암)" }).tap();
  assert.match(await trigger.getAttribute("aria-label"), /벽돌/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/fill-current-pattern.png` });
  results.push({ scenario: "fill swatches keyboard and touch with current visual", pass: true });

  await page.evaluate(async () => {
    const { state } = await import("./js/state.js?v=1.4.0");
    state.update((value) => { value.selectedIds = value.objects.map((object) => object.id); });
  });
  const beforeCancel = await stateSnapshot(page);
  stateEvidence.cancelBefore = beforeCancel;
  await page.locator("#bulk-edit-open").click();
  await page.locator('[data-bulk-group="style"] input[type="number"]').first().fill("1.7");
  await page.locator("#bulk-cancel").click();
  const afterCancel = await stateSnapshot(page);
  stateEvidence.cancelAfter = afterCancel;
  assert.equal(JSON.stringify(afterCancel.objects), JSON.stringify(beforeCancel.objects));
  assert.equal(afterCancel.undo, beforeCancel.undo);
  results.push({ scenario: "Cancel byte-identical mixed selection", pass: true });

  await page.locator("#bulk-edit-open").click();
  await page.locator('[data-bulk-group="dimensions"] .bulk-property-row').filter({ hasText: "너비" }).locator('input[type="number"]').first().fill("33.25");
  await page.getByRole("spinbutton", { name: "높이 기존 값에서 변경 값", exact: true }).fill("5");
  const beforeApply = await stateSnapshot(page);
  stateEvidence.applyBefore = beforeApply;
  await page.locator("#bulk-apply").click();
  const afterApply = await stateSnapshot(page);
  stateEvidence.applyAfter = afterApply;
  assert.equal(afterApply.undo, beforeApply.undo + 1);
  assert.ok(afterApply.objects.every((object) => object.w === 33.25));
  afterApply.objects.forEach((object, index) => assert.ok(Math.abs(object.h - beforeApply.objects[index].h - 5) < 0.01));
  await page.keyboard.press("Meta+z");
  const afterUndo = await stateSnapshot(page);
  stateEvidence.undoAfter = afterUndo;
  assert.equal(JSON.stringify(afterUndo.objects), JSON.stringify(beforeApply.objects));
  results.push({ scenario: "Apply one undo and exact undo restoration", pass: true });

  await page.locator("#bulk-edit-open").click();
  await page.setViewportSize({ width: 500, height: 520 });
  const modal = page.locator(".bulk-modal");
  await assertContained(page.locator(".bulk-modal input, .bulk-modal select, .bulk-modal button"), modal);
  const footer = page.locator(".bulk-modal > .modal-actions");
  const modalBox = await modal.boundingBox();
  const footerBox = await footer.boundingBox();
  assert.ok(footerBox.y >= modalBox.y && footerBox.y + footerBox.height <= modalBox.y + modalBox.height + 1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/bulk-dialog-narrow.png` });
  await page.setViewportSize({ width: 1280, height: 820 });
  for (const label of await page.locator('#bulk-gap-rows .modal-label').all()) {
    const metrics = await label.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, text: element.textContent }));
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, JSON.stringify(metrics));
    assert.ok(metrics.text.length >= 7, JSON.stringify(metrics));
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/bulk-dialog-wide.png` });
  results.push({ scenario: "bulk dialog 2-column to 1-column with visible footer", pass: true });
  await page.keyboard.press("Escape");
  assert.equal(await modal.isVisible(), false);
  assert.equal(await page.locator("#bulk-edit-open").evaluate(element => element === document.activeElement), true);
  results.push({ scenario: "Escape closes bulk and restores trigger focus", pass: true });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${out}/manual-results.json`, JSON.stringify({ url, results, errors, stateEvidence }, null, 2));
  await context.close();
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
