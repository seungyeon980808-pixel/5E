import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describeBatchView } from "../js/ai-batch-ui.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("preload exposes the five durable PDF index and correction methods", async () => {
  const preload = await source("desktop/preload.cjs");
  for (const name of ["indexState", "saveIndexState", "listCorrections", "saveCorrection", "deleteCorrection"]) {
    assert.match(preload, new RegExp(`\\b${name}:`));
  }
});

test("production binds install handoff to canonical save, chooser, AI success, and folder intent", async () => {
  const main = await source("js/main.js");
  const panel = await source("js/ai-panel.js");
  const library = await source("js/unified-library-ui.js");
  assert.match(main, /saveProject\(state\)/);
  assert.match(main, /project-open/);
  assert.match(panel, /5e:ai-output-success/);
  assert.match(library, /5e:local-folder-intent/);
});

test("production uses independent image task tabs while retaining the durable queue module", async () => {
  const html = await source("index.html");
  const panel = await source("js/ai-panel.js");
  const workspaces = await source("js/ai-task-workspaces.js");
  const batchUi = await source("js/ai-batch-ui.js");
  assert.doesNotMatch(html, /data-ai-batch/);
  assert.match(html, /data-ai-tab-list/);
  assert.match(panel, /distributeSourcesToTaskTabs/);
  assert.match(panel, /if \(batchButton && panel\.querySelector\("\[data-ai-batch-files\]"\)\) durableBatchUi/);
  assert.match(workspaces, /openIndependentReferences/);
  assert.match(workspaces, /Promise\.all\(created\.map/);
  assert.match(batchUi, /createBatchQueue/);
  assert.match(batchUi, /maxRunning: 10/);
});

test("batch selection renders all pending sources before the queue starts", () => {
  const pending = Array.from({ length: 25 }, (_value, index) => ({ name: `figure-${index + 1}.png` }));

  const view = describeBatchView({ jobs: [], pending });

  assert.equal(view.summary, "0/25 완료 · 0 변환 중 · 0 대기 · 시작 전 25");
  assert.equal(view.heading, "시작 전 미리보기 · 25개");
  assert.equal(view.rows.length, 25);
  assert.deepEqual(view.rows[0], {
    id: "pending:0",
    name: "figure-1.png",
    state: "pending",
    label: "시작 전",
    detail: "대기열 시작 전",
  });
});

test("pack and PDF status surfaces expose product metadata and safe actions", async () => {
  const packs = await source("js/pdf-library/pack-management.js");
  const pdfUi = await source("js/pdf-library/pdf-library-ui.js");
  for (const token of ["academicYears", "subjects", "documentCount", "bytes", "업데이트", "프로젝트와 사용자 폴더의 파일은 삭제되지 않습니다"]) {
    assert.match(packs, new RegExp(token));
  }
  for (const label of ["읽는 중", "검색 가능", "문자 인식 필요", "실패", "검색 제외", "itemNumber", "label", "saveCorrection"]) {
    assert.match(pdfUi, new RegExp(label));
  }
  assert.match(pdfUi, /data-pdflib-index-legend/);
  assert.match(pdfUi, /summarizePdfIndexStates/);
});

test("mobile inspector collapses below the desktop breakpoint without widening the document viewport", async () => {
  const css = await source("css/productization.css");
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.panel-right:not\(\.is-open\)\s*\{\s*display:\s*none/);
  assert.match(css, /\.canvas-bottom-bar\s*\{[^}]*overflow-x:\s*auto/);
});

test("mobile batch remains reachable and modal primary actions keep a visible keyboard focus treatment", async () => {
  const css = await source("css/productization.css");
  const html = await source("index.html");
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.ai-workspace\s*\{[^}]*grid-template-areas:\s*"results"\s*"tasks"/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.ai-task-rail\s*\{[^}]*display:\s*block/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.ai-conversation\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.ai-results\s*\{[^}]*grid-column:\s*1[^}]*grid-row:\s*1/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.ai-task-rail\s*\{[^}]*grid-column:\s*1[^}]*grid-row:\s*2/);
  assert.match(css, /\.modal-overlay \.modal-btn:focus-visible,[\s\S]*\.modal-overlay \.modal-btn:focus\s*\{[^}]*outline:\s*var\(--product-focus-outline-width\) solid var\(--accent\) !important/);
  assert.ok(html.indexOf('href="css/productization.css') > html.indexOf('href="css/ai-panel.css'), "productization overrides must load after the workbench stylesheet");
});

test("desktop batch rail preserves readable Korean phrases without changing the mobile workbench", async () => {
  const css = await source("css/productization.css");
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*\.ai-workspace\s*\{[^}]*grid-template-columns:\s*var\(--product-desktop-workspace-columns\)/);
  assert.match(css, /\.ai-batch-section\s*\{[^}]*word-break:\s*keep-all/);
});

test("handoff buttons expose a modal-scoped blue focus outline and pixel ring", async () => {
  const css = await source("css/productization.css");
  assert.match(css, /\.modal-overlay \.modal-btn:focus-visible[\s\S]*outline:\s*var\(--product-focus-outline-width\) solid var\(--accent\) !important/);
  assert.match(css, /\.modal-overlay \.modal-btn:focus-visible[\s\S]*box-shadow:\s*0 0 0 var\(--product-focus-ring-width\)/);
});

test("unified Library uses contract tokens for spacing, type, badges, status, and one-pixel separation", async () => {
  const css = await source("css/unified-library.css");
  for (const token of ["--unilib-space-1", "--unilib-space-7", "--unilib-type-caption", "--unilib-badge-crop", "--unilib-status-error", "--unilib-separation"]) {
    assert.match(css, new RegExp(token));
  }
  assert.doesNotMatch(css, /box-shadow:\s*[^;]*(?:40px|56px)/);
  assert.doesNotMatch(css, /filter:\s*drop-shadow/);
});

test("Given productization state surfaces, when semantic styles are applied, then named shared tokens own their colors, scale, and focus ring", async () => {
  const productizationCss = await source("css/productization.css");
  const unifiedLibraryCss = await source("css/unified-library.css");

  for (const token of [
    "--product-state-success",
    "--product-state-warning",
    "--product-state-error",
    "--product-space-compact",
    "--product-type-caption",
    "--product-focus-outline-width",
    "--product-focus-ring-width",
  ]) {
    assert.match(productizationCss, new RegExp(`:root\\s*\\{[\\s\\S]*${token}:`));
  }
  assert.doesNotMatch(productizationCss, /border-left-color:\s*#(?:3fb950|d29922|f85149)/);
  assert.match(productizationCss, /border-left-color:\s*var\(--product-state-success\)/);
  assert.match(productizationCss, /gap:\s*var\(--product-space-compact\)/);
  assert.match(productizationCss, /outline:\s*var\(--product-focus-outline-width\) solid var\(--accent\) !important/);
  assert.match(productizationCss, /0 0 0 var\(--product-focus-ring-width\)/);
  assert.match(unifiedLibraryCss, /--unilib-type-helper:\s*12px/);
  assert.match(unifiedLibraryCss, /--unilib-control-radius:\s*6px/);
  assert.doesNotMatch(unifiedLibraryCss, /\.unilib-crop-fields label\s*\{[^}]*font-size:\s*12px/);
  assert.doesNotMatch(unifiedLibraryCss, /\.unilib-crop-fields input\s*\{[^}]*border-radius:\s*6px/);
});

test("desktop output bridge uses collision-safe batch output service", async () => {
  const preload = await source("desktop/preload.cjs");
  const main = await source("desktop/main.cjs");
  assert.match(preload, /batchOutput/);
  assert.match(preload, /pickFolder/);
  assert.match(preload, /save/);
  assert.match(main, /createBatchOutputService/);
  assert.match(main, /batch-output:save/);
});
