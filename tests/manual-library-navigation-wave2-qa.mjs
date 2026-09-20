import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = process.argv[2] || ".omo/evidence/wave2-library-navigation/green";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const width of [375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${process.env.LIBRARY_QA_URL || "http://127.0.0.1:24971"}/tests/fixtures/unified-library-ui-qa.html`);
    await page.waitForSelector(".unilib-result-card");
    if (await page.locator(".unilib").evaluate((node) => node.classList.contains("preview-open"))) {
      await page.locator("[data-unilib-preview-toggle]").click();
      await page.waitForFunction(() => {
        const root = document.querySelector(".unilib");
        const preview = document.querySelector(".unilib-preview");
        return getComputedStyle(preview).display === "none"
          || preview.getBoundingClientRect().left >= root.getBoundingClientRect().right;
      });
    }

    const card = page.locator(".unilib-result-card").nth(14);
    await card.click();
    await card.evaluate((node) => {
      const scroller = node.closest(".unilib-result-scroll");
      scroller.scrollTop = Math.max(0, node.offsetTop - scroller.offsetTop - (scroller.clientHeight - node.offsetHeight) / 2);
      node.focus({ preventScroll: true });
    });
    const trayBefore = await page.locator("[data-unilib-selected-tray]").evaluate((node) => node.getBoundingClientRect().toJSON());
    const scrollBefore = await card.evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      scrollTop: node.closest(".unilib-result-scroll").scrollTop,
    }));
    await page.keyboard.press("Space");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const selected = await card.evaluate((node) => {
      const style = getComputedStyle(node);
      const tray = document.querySelector("[data-unilib-selected-tray]");
      return {
        checked: node.parentElement.querySelector("input").checked,
        top: node.getBoundingClientRect().top,
        scrollTop: node.closest(".unilib-result-scroll").scrollTop,
        trayHeight: tray.getBoundingClientRect().height,
        count: tray.querySelector("[data-unilib-selected-count]").textContent,
        cardBorder: style.borderColor,
        cardBackground: style.backgroundColor,
        cardOutline: style.outlineStyle,
      };
    });
    await page.screenshot({ path: `${output}/library-selection-${width}.png` });
    await page.keyboard.press("Space");
    const unselected = await card.evaluate((node) => ({
      checked: node.parentElement.querySelector("input").checked,
      top: node.getBoundingClientRect().top,
      scrollTop: node.closest(".unilib-result-scroll").scrollTop,
      trayHeight: document.querySelector("[data-unilib-selected-tray]").getBoundingClientRect().height,
      count: document.querySelector("[data-unilib-selected-count]").textContent,
    }));

    assert.equal(selected.checked, true);
    assert.equal(unselected.checked, false);
    assert.equal(selected.scrollTop, scrollBefore.scrollTop);
    assert.equal(unselected.scrollTop, scrollBefore.scrollTop);
    assert.equal(selected.top, scrollBefore.top);
    assert.equal(unselected.top, scrollBefore.top);
    assert.equal(selected.trayHeight, trayBefore.height);
    assert.equal(unselected.trayHeight, trayBefore.height);
    assert.equal(selected.count, "선택 1개");
    assert.equal(unselected.count, "선택 0개");
    assert.equal(selected.cardBorder, "rgb(47, 129, 247)");
    assert.equal(selected.trayHeight, 0);
    assert.notEqual(selected.cardBackground, "rgba(0, 0, 0, 0)");
    assert.equal(selected.cardOutline, "solid");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.getByRole("button", { name: "파일", exact: true }).click();
    if (!await page.locator(".unilib").evaluate((node) => node.classList.contains("preview-open"))) {
      await page.locator("[data-unilib-preview-toggle]").click();
      await page.waitForTimeout(200);
    }
    const stage = page.locator(".unilib-stage.is-continuous-pdf");
    await stage.waitFor({ state: "visible" });
    const pages = [];
    for (const pageNumber of [1, 164, 327]) {
      await stage.evaluate((node, number) => {
        const extent = Number.parseFloat(getComputedStyle(document.querySelector(".unilib")).getPropertyValue("--unilib-pdf-page-extent"));
        node.scrollTop = (number - 1) * extent;
        node.dispatchEvent(new Event("scroll"));
      }, pageNumber);
      await page.locator(`.unilib-pdf-page[data-pdf-page="${pageNumber}"] .unilib-pdf-page-frame[data-page-state="ready"]`).waitFor({ state: "attached" });
      pages.push(await stage.evaluate((node, requested) => ({
        requested,
        visible: Number(node.dataset.visiblePdfPage),
        livePages: [...node.querySelectorAll(".unilib-pdf-page")].map((item) => Number(item.dataset.pdfPage)),
        scrollTop: node.scrollTop,
        scrollHeight: node.scrollHeight,
      }), pageNumber));
    }
    assert.ok(pages.every(({ requested, visible, livePages }) => requested === visible && livePages.length <= 7));
    assert.equal(pages.at(-1).visible, 327);

    const filters = await page.evaluate(() => {
      const group = document.querySelector("[data-unilib-pdf-display]");
      const activeMode = document.querySelector('[data-unilib-pdf-mode="file"]');
      return {
        groupBorder: getComputedStyle(group).borderTopWidth,
        modeBackground: getComputedStyle(activeMode).backgroundColor,
      };
    });
    assert.equal(filters.groupBorder, "0px");
    await page.screenshot({ path: `${output}/library-navigation-${width}.png` });
    report.push({ width, trayBefore, scrollBefore, selected, unselected, pages, filters });
    await page.close();
  }
  await writeFile(`${output}/library-navigation.json`, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
