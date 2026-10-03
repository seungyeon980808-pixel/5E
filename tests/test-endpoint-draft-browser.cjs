const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const base = process.env.PREVIEW_URL || "http://127.0.0.1:8798/preview/";
const evidence = process.env.EVIDENCE_DIR;
const endpointTools = [
  { type: "spring", query: "용수철" },
  { type: "chargefield", query: "균일장" },
  { type: "fieldlines", query: "자기력선" },
  { type: "standingwave", query: "정상파(줄)" },
  { type: "parabola", query: "포물선" },
  { type: "groundarc", query: "평면 위 원호" },
  { type: "brace", query: "중괄호" },
  { type: "chromosome", query: "염색체" },
  { type: "bilayer", query: "인지질 이중층" },
  { type: "neuron", query: "뉴런" },
];

async function snapshot(page) {
  return page.evaluate(() => import("./js/state.js?v=1.6.0-remediation-0929")
    .then(({ state }) => structuredClone(state.get())));
}

async function selectTool(page, query) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
  const input = page.getByRole("textbox", { name: "오브젝트 이름 검색", exact: true });
  await input.fill(query);
  const result = page.locator(".object-search-row").filter({ hasText: query }).first();
  await result.dblclick();
}

async function finiteRectAttributes(page) {
  return page.locator("#scene rect").evaluateAll((nodes) => nodes.map((node) => ({
    x: node.getAttribute("x"),
    y: node.getAttribute("y"),
    width: node.getAttribute("width"),
    height: node.getAttribute("height"),
  })).filter((rect) => Object.values(rect).some((value) => value !== null)));
}

function assertFiniteRects(rects, label) {
  for (const rect of rects) {
    for (const [attribute, value] of Object.entries(rect)) {
      if (value !== null) assert.ok(Number.isFinite(Number(value)), `${label}: rect ${attribute} must be finite, got ${value}`);
    }
  }
}

async function dragEndpointTool(page, tool, canvas, consoleErrors) {
  await selectTool(page, tool.query);
  const before = await snapshot(page);
  const x = canvas.x + canvas.width * 0.35;
  const y = canvas.y + canvas.height * 0.42;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 74, y + 38);

  const held = await snapshot(page);
  assert.equal(held.draft?.type, tool.type, `${tool.type}: held pointer must publish its endpoint draft`);
  assert.ok(held.draft.p1 && held.draft.p2, `${tool.type}: held pointer draft must retain p1/p2`);
  assert.equal("x" in held.draft, false, `${tool.type}: endpoint draft must not pretend to be a box`);
  assert.ok(await page.locator("#scene > *").count() > 0, `${tool.type}: held pointer must render a visible preview`);
  const rects = await finiteRectAttributes(page);
  assertFiniteRects(rects, `${tool.type}: held pointer`);
  assert.deepEqual(consoleErrors, [], `${tool.type}: held pointer must not emit invalid SVG rect errors`);
  if (evidence) await page.screenshot({ path: path.join(evidence, `held-${tool.type}.png`), fullPage: true });

  await page.mouse.up();
  await page.waitForFunction(({ ids, type }) => import("./js/state.js?v=1.6.0-remediation-0929")
    .then(({ state }) => state.get().objects.some((object) => object.type === type && !ids.includes(object.id))),
  { ids: before.objects.map((object) => object.id), type: tool.type });
  const created = (await snapshot(page)).objects.find((object) => object.type === tool.type && !before.objects.some((old) => old.id === object.id));
  assert.ok(Number.isFinite(created.p1.x) && Number.isFinite(created.p1.y), `${tool.type}: pointer-up must commit finite p1`);
  assert.ok(Number.isFinite(created.p2.x) && Number.isFinite(created.p2.y), `${tool.type}: pointer-up must commit finite p2`);
  return { type: tool.type, draft: held.draft, created };
}

async function assertBoxDraftRegression(page, canvas, consoleErrors) {
  await page.locator('[data-tool="RECT"]').click();
  const x = canvas.x + canvas.width * 0.55;
  const y = canvas.y + canvas.height * 0.42;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 48, y + 31);
  const held = await snapshot(page);
  assert.equal(held.draft?.type, "rect", "rect control: held pointer must publish a box draft");
  assert.ok(["x", "y", "w", "h"].every((key) => Number.isFinite(held.draft[key])), "rect control: box draft geometry must remain finite");
  assertFiniteRects(await finiteRectAttributes(page), "rect control: held pointer");
  assert.deepEqual(consoleErrors, [], "rect control: held pointer must not emit invalid SVG rect errors");
  await page.mouse.up();
  return held.draft;
}

async function assertPointerCancel(page, canvas) {
  await selectTool(page, "용수철");
  const before = (await snapshot(page)).objects.length;
  const x = canvas.x + canvas.width * 0.42;
  const y = canvas.y + canvas.height * 0.62;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 62, y + 26);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel")));
  await page.mouse.up();
  const after = await snapshot(page);
  assert.equal(after.draft, null, "pointercancel must clear the live draft");
  assert.equal(after.objects.length, before, "pointercancel must not commit the endpoint draft");
  return { draft: after.draft, objectCountBefore: before, objectCountAfter: after.objects.length };
}

(async () => {
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block", locale: "ko-KR" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /<rect> attribute (?:x|y|width|height): Expected length, \"undefined\"/.test(message.text())) consoleErrors.push(message.text());
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem("5e.preview:5e.tutorial.bannerSeen", "true");
      localStorage.setItem("5e.tutorial.bannerSeen", "true");
    });
    await page.goto(`${base}?mode=pro&mobile=0`, { waitUntil: "networkidle" });
    const canvas = await page.locator("#canvas").boundingBox();
    assert.ok(canvas, "canvas must be visible");
    const endpointResults = [];
    for (const tool of endpointTools) endpointResults.push(await dragEndpointTool(page, tool, canvas, consoleErrors));
    const boxDraft = await assertBoxDraftRegression(page, canvas, consoleErrors);
    const pointerCancel = await assertPointerCancel(page, canvas);
    if (evidence) await page.screenshot({ path: path.join(evidence, "endpoint-drafts.png"), fullPage: true });
    const report = { passed: true, endpointResults, boxDraft, pointerCancel, consoleErrors };
    if (evidence) fs.writeFileSync(path.join(evidence, "endpoint-draft-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (evidence) {
      await page.screenshot({ path: path.join(evidence, "endpoint-drafts-failure.png"), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(evidence, "endpoint-draft-report.json"), `${JSON.stringify({ passed: false, consoleErrors, error: error.stack || String(error) }, null, 2)}\n`);
    }
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
