const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8798/preview/?mode=lite";
const evidence = process.env.EVIDENCE_DIR || "/tmp/5e-lite-inspector-controls";
fs.mkdirSync(evidence, { recursive: true });

function liteUrl() {
  const url = new URL(previewUrl);
  url.searchParams.set("mode", "lite");
  return url.href;
}

async function drawLine(page, from, to) {
  await page.locator('#tool-list .tool-btn[data-tool="L"]').click();
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
}

(async () => {
  const report = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      // Use the returning-user state before the app initializes so a delayed
      // welcome dialog cannot intercept the inspector's drawing controls.
      await page.addInitScript(() => {
        localStorage.setItem("5e.preview:5e.tutorial.bannerSeen", "true");
        localStorage.setItem("5e.tutorial.bannerSeen", "true");
      });
      await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(liteUrl());
      await page.locator("#panel-left").waitFor({ state: "visible" });
      await page.locator("#canvas").waitFor({ state: "visible" });

      const canvas = await page.locator("#canvas").boundingBox();
      const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
      await drawLine(page, { x: center.x - 180, y: center.y - 80 }, { x: center.x - 20, y: center.y - 80 });
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["color", "stroke-width", "arrow-direction", "line-style"],
      `${engine.name()} Lite line must expose its approved controls`);

      const line = page.locator("#scene line[data-id]:not([data-ui])");
      const beforeColor = await line.getAttribute("stroke");
      await page.locator('[data-lite-control="color"] .cp-num-input').fill("170");
      await page.locator('[data-lite-control="color"] .cp-num-input').press("Enter");
      assert.notEqual(await line.getAttribute("stroke"), beforeColor,
        `${engine.name()} Lite color control must repaint the selected line`);
      await page.locator('[data-lite-control="stroke-width"] input[type="number"]').fill("0.5");
      await page.locator('[data-lite-control="stroke-width"] input[type="number"]').press("Enter");
      assert.equal(await line.getAttribute("stroke-width"), "0.5",
        `${engine.name()} Lite width control must update the selected line`);
      await page.locator('[data-lite-control="arrow-direction"] button').click();
      const arrowLine = page.locator("#scene g[data-id]").last();
      assert.ok(await arrowLine.locator("polygon").count() > 0,
        `${engine.name()} Lite arrow direction must render an arrowhead`);
      await page.locator('[data-lite-control="line-style"] button[title="점선1"]').click();
      assert.ok(await arrowLine.locator("line[stroke-dasharray]").count() > 0,
        `${engine.name()} Lite line style must render its dash pattern`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-line-controls.png`) });

      await page.locator('#tool-list .lite-tool-direct[data-tool="T"]').click();
      await page.mouse.click(center.x, center.y);
      await page.locator(".unified-text-input:visible").fill("편집 전");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["text-label", "font-size"],
      `${engine.name()} Lite text must expose size and its existing editor`);
      const text = page.locator("#scene text[data-id]").last();
      const beforeTextSize = await text.getAttribute("font-size");
      await page.locator('[data-lite-control="font-size"] input').fill("18");
      await page.locator('[data-lite-control="font-size"] input').press("Enter");
      assert.notEqual(await text.getAttribute("font-size"), beforeTextSize,
        `${engine.name()} Lite text size control must update the selected text`);
      await page.locator('[data-lite-control="text-label"] button').click();
      await page.locator(".unified-text-input:visible").fill("편집 후");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.match(await page.locator("#scene").textContent(), /편집 후/,
        `${engine.name()} Lite text label editor must update the selected text`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-text-label.png`) });

      await page.locator('#tool-list .lite-tool-direct[data-symbol="labeler"]').click();
      await page.mouse.click(center.x - 180, center.y + 100);
      await page.mouse.click(center.x - 40, center.y + 50);
      await page.mouse.click(center.x + 70, center.y);
      await page.locator(".unified-text-input:visible").fill("지시선 전");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["leader-label", "color", "stroke-width", "line-style", "leader-target-marker"],
      `${engine.name()} Lite leader must expose line controls and its existing editor`);
      const targetMarker = page.getByRole("combobox", { name: "라벨러 대상 끝점", exact: true });
      // 1.7.0 지시선은 클릭 영역(hit-twin)·선택 표시(labeler-selection)에도 같은 점 모양을 쓴다. 그려진 점만 센다.
      const targetDot = page.locator('#scene > g:not([data-ui]) circle[data-labeler-target-dot="true"]');
      assert.equal(await targetDot.count(), 0, "Existing labelers have no target dot by default");
      await targetMarker.selectOption("dot");
      assert.equal(await targetDot.count(), 1, "The dot belongs at the diagram anchor");
      assert.equal(Number(await targetDot.getAttribute("r")), 0.5);
      const dotSize = page.getByRole("spinbutton", { name: "라벨러 점 지름", exact: true });
      await dotSize.fill("1.6");
      await dotSize.press("Enter");
      assert.equal(Number(await targetDot.getAttribute("r")), 0.8);
      await page.locator("#undo-btn").click();
      assert.equal(Number(await targetDot.getAttribute("r")), 0.5, "One undo restores the previous diameter");
      await page.locator("#redo-btn").click();
      assert.equal(Number(await targetDot.getAttribute("r")), 0.8);
      await targetMarker.selectOption("none");
      assert.equal(await targetDot.count(), 0);
      await page.locator("#undo-btn").click();
      assert.equal(Number(await targetDot.getAttribute("r")), 0.8, "Turning the marker off retains its diameter");
      const anchors = await page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        const o = state.get().objects.find(o => o.id === state.get().selectedIds[0]);
        return { p1: o.p1, p2: o.p2 };
      });
      assert.deepEqual(await targetDot.evaluate(c => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) })), anchors.p1);
      await page.locator('[data-lite-control="leader-label"] button').click();
      await page.locator(".unified-text-input:visible").fill("지시선 후");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.match(await page.locator("#scene").textContent(), /지시선 후/,
        `${engine.name()} Lite leader label editor must update the selected label`);
      assert.equal(Number(await targetDot.getAttribute("r")), 0.8, "Text editing must not change the dot diameter");
      await page.keyboard.press("ArrowRight");
      const movedAnchor = await page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        return state.get().objects.find(o => o.id === state.get().selectedIds[0]).p1;
      });
      assert.notDeepEqual(movedAnchor, anchors.p1, "Keyboard movement moves the whole labeler");
      assert.deepEqual(await targetDot.evaluate(c => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) })), movedAnchor);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-leader-label.png`) });

      await page.locator("#mode-toggle-btn").click();
      await page.getByRole("button", { name: "유지하고 전환", exact: true }).click();
      await page.locator('html[data-mode="pro"]').waitFor();
      assert.equal(await page.locator('[data-lite-control="text-label"]').isVisible(), false,
        `${engine.name()} Pro must not gain the Lite text-label button`);
      assert.equal(await page.locator('[data-lite-control="leader-label"]').isVisible(), true,
        `${engine.name()} Pro retains the current labeler branch's shared leader-label editor`);
      await page.locator('[data-lite-control="leader-label"] button').click();
      await page.locator(".unified-text-input:visible").fill("Pro 지시선 후");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.match(await page.locator("#scene").textContent(), /Pro 지시선 후/,
        `${engine.name()} the shared Pro editor must update the same retained leader`);
      assert.equal(await targetMarker.isVisible(), true, "Pro also exposes the target marker option");
      assert.equal(await dotSize.isVisible(), true);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-pro-unaffected.png`) });

      await page.locator("#file-menu-btn").click();
      await page.locator("#project-save").click();
      await page.locator('#project-save-filename:visible, .modal-overlay input.modal-input:visible').fill("점 라벨러 검증.5e");
      let pendingDownload = page.waitForEvent("download");
      if (await page.locator("#project-save-download").isVisible()) await page.locator("#project-save-download").click();
      else await page.getByRole("button", { name: "저장", exact: true }).click();
      const projectDownload = await pendingDownload;
      const projectFile = path.join(evidence, `${engine.name()}-dot-labeler.5e`);
      await projectDownload.saveAs(projectFile);
      // 1.7.0 .5e 파일은 project.json을 담은 zip이다.
      const savedProject = await page.evaluate(async bytes => {
        const { unzipStore } = await import('/js/backup-zip.js?v=1.7.0-four-session-integration');
        return JSON.parse(new TextDecoder().decode(unzipStore(new Uint8Array(bytes)).get('project.json')));
      }, [...fs.readFileSync(projectFile)]);
      const savedLabel = savedProject.drawing.pages.flatMap(p => p.objects).find(o => o.targetMarker === "dot");
      assert.equal(savedLabel.targetDotDiameter, 1.6);
      // 1.7.0은 파일 메뉴의 #project-open으로 연다. 현재 작업 대체 확인 창이 뜨면 '열기'.
      if (await page.locator("#file-menu-btn").isVisible()) await page.locator("#file-menu-btn").click();
      const chooser = page.waitForEvent("filechooser");
      await page.locator("#project-open").click();
      await (await chooser).setFiles(projectFile);
      const replaceOpen = page.locator(".modal-overlay:not([hidden])").filter({ hasText: "프로젝트 파일로 대체" }).getByRole("button", { name: "열기", exact: true });
      await replaceOpen.waitFor({ timeout: 5000 }).then(() => replaceOpen.click(), () => {});
      await page.waitForFunction(() => document.querySelectorAll('#scene > g:not([data-ui]) circle[data-labeler-target-dot="true"]').length === 1);
      assert.equal(Number(await targetDot.getAttribute("r")), 0.8, "Project reopening preserves the diameter");

      pendingDownload = page.waitForEvent("download");
      await page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        const { exportSvg } = await import('/js/svg-export.js?v=1.7.0-four-session-integration');
        await exportSvg(state, 'dot-labeler.svg');
      });
      const svgDownload = await pendingDownload;
      const svgFile = path.join(evidence, `${engine.name()}-dot-labeler.svg`);
      await svgDownload.saveAs(svgFile);
      const source = fs.readFileSync(svgFile, "utf8");
      assert.match(source, /data-labeler-target-dot="true"/);
      assert.match(source, /r="0\.8"/);
      assert.match(source, /clip-path=/, "The export keeps artboard clipping");
      pendingDownload = page.waitForEvent("download");
      await page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        const { exportPng } = await import('/js/svg-export.js?v=1.7.0-four-session-integration');
        await exportPng(state, 'dot-labeler.png', 300);
      });
      const pngDownload = await pendingDownload;
      await pngDownload.saveAs(path.join(evidence, `${engine.name()}-dot-labeler.png`));
      assert.equal(await pngDownload.failure(), null);
      assert.deepEqual(errors, []);
      report.push({ engine: engine.name(), line: true, text: true, leader: true, proUnchanged: true,
        dotToggleAndSize: true, undoRedo: true, movesWithAnchor: true, projectSaveReopen: true, svgPngExport: true });
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(path.join(evidence, "report.json"), JSON.stringify(report, null, 2));
  console.log("Lite/Pro inspector: dot size/toggle/undo/movement, project save/reopen and SVG/PNG export PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
