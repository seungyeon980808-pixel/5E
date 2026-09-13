import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const out = process.argv[2] || ".omo/evidence/repair14/library";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const trace = { selection: [], continuous: [], pageMode: null, styles: null };

try {
  await page.goto("http://127.0.0.1:24891/tests/fixtures/unified-library-ui-qa.html");
  await page.waitForSelector(".unilib-result-card");
  const card = page.locator(".unilib-result-card").nth(14);
  await card.click();
  await card.evaluate((node) => {
    const scroller = node.closest(".unilib-result-scroll");
    scroller.scrollTop = node.offsetTop - scroller.offsetTop - (scroller.clientHeight - node.offsetHeight) / 2;
    node.focus({ preventScroll: true });
  });
  for (let index = 0; index < 20; index += 1) {
    const before = await card.evaluate((node) => ({
      scrollTop: node.closest(".unilib-result-scroll").scrollTop,
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
    }));
    await page.keyboard.press("Space");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await card.evaluate((node) => ({
      scrollTop: node.closest(".unilib-result-scroll").scrollTop,
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      focusedId: document.activeElement?.dataset?.resultId || null,
      tray: document.querySelector("[data-unilib-selected-tray]").getBoundingClientRect().toJSON(),
    }));
    trace.selection.push({ index: index + 1, before, after, delta: {
      scrollTop: after.scrollTop - before.scrollTop,
      top: after.top - before.top,
      bottom: after.bottom - before.bottom,
    } });
  }
  await page.keyboard.press("Space");
  await page.waitForSelector("[data-unilib-selected-remove]");
  trace.selectedStyle = await card.evaluate((node) => {
    const style = getComputedStyle(node);
    const title = getComputedStyle(node.querySelector(".unilib-result-copy strong"));
    const tray = document.querySelector("[data-unilib-selected-tray]").getBoundingClientRect();
    const scroller = node.closest(".unilib-result-scroll").getBoundingClientRect();
    return {
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
      outline: style.outlineStyle,
      titleDecoration: title.textDecorationLine,
      trayBottom: tray.bottom,
      scrollerTop: scroller.top,
    };
  });
  await page.screenshot({ path: `${out}/task-2-library-selection.png` });
  const beforeRemove = await card.evaluate((node) => node.closest(".unilib-result-scroll").scrollTop);
  await page.locator("[data-unilib-selected-remove]").click();
  const afterRemove = await card.evaluate((node) => node.closest(".unilib-result-scroll").scrollTop);
  await page.keyboard.press("Space");
  await page.locator("[data-unilib-selected-clear]").click();
  const afterClear = await card.evaluate((node) => node.closest(".unilib-result-scroll").scrollTop);
  trace.selectionActions = { beforeRemove, afterRemove, afterClear };

  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForSelector(".unilib-stage.is-continuous-pdf");
  for (const pageNumber of [1, 164, 327]) {
    await page.locator(".unilib-stage").evaluate((node, number) => {
      node.scrollTop = (number - 1) * 760;
      node.dispatchEvent(new Event("scroll"));
    }, pageNumber);
    await page.waitForSelector(`.unilib-pdf-page[data-pdf-page="${pageNumber}"] .unilib-pdf-page-frame[data-page-state="ready"]`);
    trace.continuous.push(await page.evaluate((number) => ({
      requested: number,
      visible: Number(document.querySelector(".unilib-stage").dataset.visiblePdfPage),
      livePages: [...document.querySelectorAll(".unilib-pdf-page")].map((node) => Number(node.dataset.pdfPage)),
      pageExtent: (() => {
        const pages = [...document.querySelectorAll(".unilib-pdf-page")];
        return pages.length > 1 ? pages[1].getBoundingClientRect().top - pages[0].getBoundingClientRect().top : 760;
      })(),
      originalCall: window.qaPreviewCalls.some((call) => call.pageNumber === number && call.options.original === true),
    }), pageNumber));
  }
  trace.retainedNode = await page.locator('.unilib-pdf-page[data-pdf-page="327"]').evaluate((node) => { node.dataset.qaIdentity = "retained"; return true; });
  await page.locator(".unilib-stage").evaluate((node) => { node.scrollTop = 325 * 760; node.dispatchEvent(new Event("scroll")); });
  trace.retainedNode = trace.retainedNode && await page.locator('.unilib-pdf-page[data-pdf-page="327"]').evaluate((node) => node.dataset.qaIdentity === "retained");

  await page.evaluate(() => { window.qaFailPageOnce = 200; });
  await page.locator(".unilib-stage").evaluate((node) => { node.scrollTop = 199 * 760; node.dispatchEvent(new Event("scroll")); });
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="200"] .unilib-pdf-page-frame[data-page-state="error"]');
  trace.errorLayout = await page.evaluate(() => {
    const dialog = document.querySelector(".unified-library-overlay .unilib").getBoundingClientRect();
    const shell = document.querySelector(".unilib-shell").getBoundingClientRect();
    return { scrollY, viewportHeight: innerHeight, dialog: dialog.toJSON(), shell: shell.toJSON() };
  });
  await page.screenshot({ path: `${out}/task-2-library-continuous-error.png` });
  await page.locator('.unilib-pdf-page[data-pdf-page="200"] button', { hasText: "다시 시도" }).click();
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="200"] .unilib-pdf-page-frame[data-page-state="ready"]');

  await page.locator(".unilib-stage").evaluate((node) => { node.scrollTop = 163 * 760; node.dispatchEvent(new Event("scroll")); });
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="164"] .unilib-pdf-page-frame[data-page-state="ready"]');
  await page.getByRole("button", { name: "PDF에서 자르기" }).click();
  await page.waitForSelector("[data-unilib-crop]:not([hidden])");
  trace.cropPage = await page.evaluate(() => ({ call: window.qaPreviewCalls.at(-1), dialogPage: Number(document.querySelector("[data-unilib-crop]").dataset.pdfPage) }));
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();

  const query = page.locator("[data-unilib-query]");
  await query.fill("A B");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".unilib-stage.is-continuous-pdf");
  trace.searchContinuousPageCount = await page.locator(".unilib-stage").getAttribute("aria-label");
  await page.getByRole("button", { name: "다음 일치" }).click();
  trace.matchNavigation = await page.evaluate(() => ({
    counter: document.querySelector("[data-unilib-match-position]").textContent,
    visible: Number(document.querySelector(".unilib-stage").dataset.visiblePdfPage),
  }));
  await page.getByRole("button", { name: "페이지", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".unilib-result-card").length === 2);
  trace.pageMode = await page.evaluate(() => ({
    count: document.querySelectorAll(".unilib-result-card").length,
    columns: getComputedStyle(document.querySelector(".unilib-result-list")).gridTemplateColumns.split(" ").filter(Boolean).length,
    pages: [...document.querySelectorAll(".unilib-result-card")].map((node) => Number(node.querySelector("small")?.textContent.match(/\d+/)?.[0])),
  }));
  trace.styles = await page.evaluate(() => {
    const activeTab = document.querySelector('[data-unilib-type="pdf"]');
    const activeMode = document.querySelector('[data-unilib-pdf-mode="page"]');
    return {
      tabBackground: getComputedStyle(activeTab).backgroundColor,
      tabColor: getComputedStyle(activeTab).color,
      modeBackground: getComputedStyle(activeMode).backgroundColor,
    };
  });
  await page.getByRole("button", { name: "파일", exact: true }).click();
  await page.waitForSelector(".unilib-stage.is-continuous-pdf");
  await page.locator(".unilib-stage").evaluate((node) => { node.scrollTop = 163 * 760; node.dispatchEvent(new Event("scroll")); });
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="164"] .unilib-pdf-page-frame[data-page-state="ready"]');
  await page.locator('[data-select-result="file:qa"]').check();
  await page.getByRole("button", { name: "AI 작업에 추가", exact: true }).click();
  await page.waitForFunction(() => window.qaAiCalls.length === 1);
  trace.checkedAiPage = await page.evaluate(() => window.qaAiCalls[0].references[0].source.pageNumber);
  assert.ok(trace.selection.every(({ delta, after }) => delta.scrollTop === 0 && delta.top === 0 && delta.bottom === 0 && after.focusedId === "q15"), JSON.stringify(trace.selection, null, 2));
  assert.equal(trace.selectionActions.beforeRemove, trace.selectionActions.afterRemove);
  assert.equal(trace.selectionActions.beforeRemove, trace.selectionActions.afterClear);
  assert.equal(trace.selectedStyle.borderColor, "rgb(47, 129, 247)");
  assert.equal(trace.selectedStyle.boxShadow, "none");
  assert.equal(trace.selectedStyle.outline, "none");
  assert.equal(trace.selectedStyle.titleDecoration, "underline");
  assert.ok(trace.selectedStyle.trayBottom <= trace.selectedStyle.scrollerTop);
  assert.ok(trace.continuous.every(({ livePages, pageExtent, originalCall }) => livePages.length <= 7 && pageExtent === 760 && originalCall));
  assert.equal(trace.retainedNode, true);
  assert.ok(trace.errorLayout.dialog.top >= 0 && trace.errorLayout.dialog.bottom <= trace.errorLayout.viewportHeight);
  assert.equal(trace.cropPage.dialogPage, 164);
  assert.equal(trace.checkedAiPage, 164);
  assert.match(trace.searchContinuousPageCount, /327쪽$/);
  assert.deepEqual(trace.matchNavigation, { counter: "2 / 2 · 4쪽", visible: 4 });
  assert.deepEqual(trace.pageMode, { count: 2, columns: 3, pages: [2, 4] });
  await writeFile(`${out}/task-2-library-selection.json`, `${JSON.stringify(trace, null, 2)}\n`);
} finally {
  await browser.close();
}
