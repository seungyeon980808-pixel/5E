const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const captureDir = process.env.LIBRARY_OPEN_EPOCH_EVIDENCE_DIR;
const origin = process.env.LIBRARY_QA_ORIGIN || "http://127.0.0.1:8795";
const engines = require(process.env.PLAYWRIGHT_MODULE || "playwright");
if (!captureDir) throw new Error("LIBRARY_OPEN_EPOCH_EVIDENCE_DIR is required");
fs.mkdirSync(captureDir, { recursive: true });

const report = [];

async function fixture(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<html><head><link rel="stylesheet" href="/preview/css/style.css"><link rel="stylesheet" href="/preview/css/unified-library.css"></head><body></body></html>',
  }));
  await page.goto(`${origin}/fixture`);
  await page.evaluate(async () => {
    const { createUnifiedLibraryUi } = await import("/preview/js/unified-library-ui.js");
    const gates = [];
    const provider = {
      revision: "open-epoch-regression",
      getSources: () => [],
      getExamFilterOptions: () => ({ academicYears: [] }),
      search: () => [],
      listPdfPages: () => [],
      listPdfFiles: () => [],
    };
    window.libraryOpenEpochFixture = {
      gates,
      resolve(index) { const gate = gates[index]; if (gate) { gate.released = true; gate.resolve(provider); } },
      reject(index, message) { const gate = gates[index]; if (gate) { gate.released = true; gate.reject(new Error(message)); } },
      ui: createUnifiedLibraryUi({
        getProvider: () => new Promise((resolve, reject) => {
          const gate = { resolve, reject, released: false };
          gates.push(gate);
          // The old implementation starts a stale search after it has dismissed
          // the current loader. Release that extra request so both versions settle.
          if (gates.length > 2) queueMicrotask(() => { gate.released = true; resolve(provider); });
        }),
        insertMaterialized: async () => {},
      }),
    };
  });
  return { context, page, errors };
}

async function open(page, name) {
  await page.evaluate((key) => { window[key] = window.libraryOpenEpochFixture.ui.open(); }, name);
}

async function waitForGate(page, count) {
  await page.waitForFunction((expected) => window.libraryOpenEpochFixture.gates.length >= expected, count);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector(".unified-library-overlay");
    const loader = overlay.querySelector("[data-unilib-folder-loading]");
    const tree = overlay.querySelector("[data-unilib-tree]");
    const status = overlay.querySelector("[data-unilib-status]");
    return {
      overlayHidden: overlay.hidden,
      loaderHidden: loader.hidden,
      loaderState: loader.dataset.state,
      treeHidden: tree.hidden,
      treeBusy: tree.getAttribute("aria-busy"),
      status: status.textContent,
      statusError: status.classList.contains("is-error"),
      gates: window.libraryOpenEpochFixture.gates.map((gate) => gate.released),
    };
  });
}

async function assertActualFooterFirstPaint(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const requests = [];
    window.libraryOpenEpochNetwork = requests;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      if (!/assets\/(parts-library\/manifest|exam-library\/sample-catalog)\.json/u.test(String(url))) return originalFetch(input, init);
      return new Promise((resolve, reject) => requests.push({
        url: String(url),
        resolve: () => originalFetch(input, init).then(resolve, reject),
      }));
    };
  });
  await page.goto(`${origin}/preview/`, { waitUntil: "networkidle" });
  const tutorialSkip = page.locator(".tut-welcome-overlay .tut-banner-no");
  if (await tutorialSkip.isVisible().catch(() => false)) {
    await tutorialSkip.click();
    await page.locator(".tut-welcome-overlay").waitFor({ state: "hidden" });
  }
  await page.locator("#exam-library-open").click();
  await page.waitForFunction(() => window.libraryOpenEpochNetwork.length >= 1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const observed = await page.evaluate(() => {
    const overlay = document.querySelector(".unified-library-overlay");
    const loader = overlay.querySelector("[data-unilib-folder-loading]");
    const tree = overlay.querySelector("[data-unilib-tree]");
    const rect = loader.getBoundingClientRect();
    return {
      overlayHidden: overlay.hidden,
      loaderHidden: loader.hidden,
      loaderState: loader.dataset.state,
      loaderWidth: rect.width,
      loaderHeight: rect.height,
      treeHidden: tree.hidden,
      requestCount: window.libraryOpenEpochNetwork.length,
    };
  });
  report.push({ scenario: "actual-footer-cold-network-hold-first-paint", observed });
  await page.screenshot({ path: path.join(captureDir, "actual-footer-first-paint.png") });
  assert.equal(observed.overlayHidden, false);
  assert.equal(observed.loaderHidden, false);
  assert.equal(observed.loaderState, "loading");
  assert.ok(observed.loaderWidth > 0 && observed.loaderHeight > 0);
  assert.equal(observed.treeHidden, true);
  assert.deepEqual(errors, []);
  await context.close();
}

(async () => {
  const browser = await engines.chromium.launch({ headless: true });
  try {
    await assertActualFooterFirstPaint(browser);
    {
      const { context, page, errors } = await fixture(browser);
      await open(page, "openA");
      await waitForGate(page, 1);
      await page.evaluate(() => window.libraryOpenEpochFixture.ui.close({ restoreFocus: false }));
      await open(page, "openB");
      await waitForGate(page, 2);
      await page.evaluate(() => window.libraryOpenEpochFixture.resolve(0));
      await page.evaluate(() => window.openA);
      const observed = await snapshot(page);
      report.push({ scenario: "stale-success-cannot-dismiss-current-loader", observed });
      await page.screenshot({ path: path.join(captureDir, "stale-success.png") });
      assert.equal(observed.gates[1], false, "the current reopen provider must still be unresolved");
      assert.equal(observed.loaderHidden, false, "a stale successful opener must not hide the current folder loader");
      assert.equal(observed.loaderState, "loading");
      assert.equal(observed.treeHidden, true);
      assert.deepEqual(errors, []);
      await context.close();
    }

    {
      const { context, page, errors } = await fixture(browser);
      await open(page, "openA");
      await waitForGate(page, 1);
      await page.evaluate(() => window.libraryOpenEpochFixture.ui.close({ restoreFocus: false }));
      await open(page, "openB");
      await waitForGate(page, 2);
      await page.evaluate(() => window.libraryOpenEpochFixture.reject(0, "old opener failed"));
      await page.evaluate(() => window.openA);
      const observed = await snapshot(page);
      report.push({ scenario: "stale-rejection-cannot-replace-current-loading-state", observed });
      assert.equal(observed.gates[1], false);
      assert.equal(observed.loaderHidden, false, "a stale rejected opener must not hide the current folder loader");
      assert.equal(observed.loaderState, "loading");
      assert.equal(observed.statusError, false, "a stale rejected opener must not replace the current status with an error");
      assert.deepEqual(errors, []);
      await context.close();
    }

    {
      const { context, page, errors } = await fixture(browser);
      await open(page, "openA");
      await waitForGate(page, 1);
      await page.evaluate(() => window.libraryOpenEpochFixture.ui.close({ restoreFocus: false }));
      await page.evaluate(() => window.libraryOpenEpochFixture.resolve(0));
      await page.evaluate(() => window.openA);
      const observed = await snapshot(page);
      report.push({ scenario: "closed-library-ignores-old-provider-completion", observed });
      assert.equal(observed.overlayHidden, true);
      assert.equal(observed.treeHidden, true);
      assert.equal(observed.status, "");
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    fs.writeFileSync(path.join(captureDir, "library-open-epoch.json"), `${JSON.stringify(report, null, 2)}\n`);
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
