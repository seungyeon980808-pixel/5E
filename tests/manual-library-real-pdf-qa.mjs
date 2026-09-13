import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const out = process.argv[2] || ".omo/evidence/repair14/library";
const profile = await mkdtemp(join(tmpdir(), "5e-repair14-library-"));
const report = { profile, expectedSha256: "54eb8dfd49d9cd6ed9ed7438da4a5b52792099b603ae6a57e8d26c3a83a40545", pages: [], errors: [] };
let app;
try {
  app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: { ...process.env, FIVE_E_DEV_USER_DATA: profile, FIVE_E_DISABLE_GPU: "1" },
  });
  let page;
  for (let attempt = 0; attempt < 120 && !page; attempt += 1) {
    for (const candidate of app.windows()) {
      if (await candidate.evaluate(() => Boolean(globalThis.fiveEDesktop?.pdfLibrary)).catch(() => false)) {
        page = candidate;
        break;
      }
    }
    if (!page) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, "main Electron window did not expose the PDF bridge");
  page.on("pageerror", (error) => report.errors.push(error.message));
  const skip = page.locator(".tut-banner-no");
  await skip.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.keyboard.press("Escape");
  const connected = await page.evaluate(() => globalThis.fiveEDesktop.pdfLibrary.ensureDefaultFolder());
  report.connectionId = connected.connection.connectionId;
  const inventory = await page.evaluate((connectionId) => globalThis.fiveEDesktop.pdfLibrary.list(connectionId), report.connectionId);
  report.inventory = inventory.documents.map((item) => ({ documentId: item.documentId, name: item.name, size: item.size, version: item.version }));
  const target = inventory.documents.find((item) => item.version === report.expectedSha256 || item.size === 133113722);
  assert.ok(target, "327-page textbook was not present in the fresh isolated catalog");
  report.documentId = target.documentId;
  await page.locator("#exam-library-open").click();
  const library = page.locator(".unified-library-overlay:not([hidden])");
  await library.waitFor({ state: "visible" });
  await library.locator('[data-unilib-type="pdf"]').click();
  const row = library.locator(`[data-result-kind="pdf"][data-result-id*="${target.documentId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 60000 });
  await row.click();
  const stage = library.locator(".unilib-stage.is-continuous-pdf");
  await stage.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector(".unilib-stage.is-continuous-pdf")?.getAttribute("aria-label")?.includes("327쪽"), null, { timeout: 120000 });
  report.documentLabel = await stage.getAttribute("aria-label");
  assert.match(report.documentLabel, /327쪽/u);
  for (const pageNumber of [1, 164, 327]) {
    await stage.evaluate((node, number) => {
      node.scrollTop = (number - 1) * 760;
      node.dispatchEvent(new Event("scroll"));
    }, pageNumber);
    const frame = library.locator(`.unilib-pdf-page[data-pdf-page="${pageNumber}"] .unilib-pdf-page-frame[data-page-state="ready"]`);
    await frame.waitFor({ state: "visible", timeout: 120000 });
    report.pages.push(await stage.evaluate((node, number) => {
      const image = node.querySelector(`[data-pdf-page="${number}"] img`);
      return {
        requested: number,
        visible: Number(node.dataset.visiblePdfPage),
        livePages: [...node.querySelectorAll(".unilib-pdf-page")].map((item) => Number(item.dataset.pdfPage)),
        naturalWidth: image?.naturalWidth || 0,
        naturalHeight: image?.naturalHeight || 0,
      };
    }, pageNumber));
  }
  await stage.evaluate((node) => { node.scrollTop = 163 * 760; node.dispatchEvent(new Event("scroll")); });
  await library.locator('.unilib-pdf-page[data-pdf-page="164"] .unilib-pdf-page-frame[data-page-state="ready"]').waitFor({ state: "visible", timeout: 120000 });
  assert.ok(report.pages.every(({ requested, visible, livePages, naturalWidth, naturalHeight }) => requested === visible && livePages.length <= 7 && naturalWidth > 0 && naturalHeight > 0));
  await page.screenshot({ path: `${out}/task-2-library-real-327-continuous.png` });
  await library.getByRole("button", { name: "PDF에서 자르기" }).click();
  const crop = library.locator("[data-unilib-crop]:not([hidden])");
  await crop.waitFor({ state: "visible", timeout: 120000 });
  report.cropPage = Number(await crop.getAttribute("data-pdf-page"));
  assert.equal(report.cropPage, 164);
  await page.screenshot({ path: `${out}/task-2-library-real-327.png` });
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
  report.profileRemoved = true;
  await writeFile(`${out}/task-2-library-real-327.json`, `${JSON.stringify(report, null, 2)}\n`);
}
