const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const panel = fs.readFileSync(path.join(root, "js", "ai-panel.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "ai-panel.css"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to + end.length);
}

test("Given the production canvas footer, When image tools render, Then one diagram workflow entry is exposed", () => {
  const hub = section(html, '<div class="image-workflow-hub"', "</div>");

  assert.equal((hub.match(/<button\b/g) || []).length, 1);
  assert.match(hub, /id="ai-image-install-open"/);
  assert.match(hub, />시험문제용 도판 만들기<\/span>/);
  assert.doesNotMatch(hub, /exam-library-open|parts-library-open|image-objectify-open/);
});

test("Given the diagram panel, When it opens, Then only the source and primary request path are on the default surface", () => {
  const modal = section(html, '<div id="ai-image-panel"', "<!-- ===== MODULES");
  const advanced = section(modal, '<details class="ai-advanced-settings"', "</details>");
  const defaultSurface = modal.replace(advanced, "");

  assert.doesNotMatch(advanced.split(">")[0], /\bopen\b/);
  assert.match(defaultSurface, /input type="file"/);
  assert.match(defaultSurface, /data-ai-reference-search[^>]*>폴더 연결<\/button>/);
  assert.match(defaultSurface, /data-ai-send>도판 만들기<\/button>/);
  assert.match(advanced, /<summary>고급 설정<\/summary>/);

  for (const hook of [
    "data-ai-tabs", "data-ai-tab-new", "data-ai-capture", "data-ai-batch",
    "data-ai-model", "data-ai-effort", "data-ai-speed", "data-ai-quality",
    "data-ai-output-engine", "data-ai-treatment", "data-ai-background", "data-ai-output-scale",
    "data-ai-mode", "data-ai-chat-send",
  ]) {
    const attribute = new RegExp(`${hook}(?:=|\\s|>)`);
    assert.doesNotMatch(defaultSurface, attribute);
    assert.match(advanced, attribute);
  }
});

test("Given a generated diagram, When a confirmed source also exists, Then compare and insert are contextual actions", () => {
  assert.match(html, /aria-label="시험문제용 도판 만들기"/);
  assert.match(html, /id="ai-image-title">시험문제용 도판 만들기<\/h2>/);
  assert.match(html, /data-ai-output-engine="raster"[^>]*>시험문제용 도판<\/button>/);
  assert.match(html, /data-ai-output-engine="asset"[^>]*>편집 가능한 그래프<\/button>/);
  assert.match(html, /data-ai-compare[^>]*hidden[^>]*disabled[^>]*>원본과 비교<\/button>/);

  assert.match(panel, /const canCompare = generatedImages\.length > 0 && \(attachments\.length > 0 \|\| generatedImages\.length > 1\);/);
  assert.match(panel, /compareButton\.hidden = !canCompare;/);
  assert.match(panel, /compareButton\.disabled = busy \|\| !canCompare;/);
  assert.match(panel, /캔버스에 삽입/);
  assert.doesNotMatch(panel, /캔버스로 출력|캔버스 출력|교과서 선화/);
});

test("Given keyboard and narrow-screen users, When the panel is navigated, Then focus and compact source states remain explicit", () => {
  assert.match(html, /<details class="ai-reference-section">/);
  assert.match(styles, /\.ai-workspace\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 360px\);/);
  assert.match(styles, /\.ai-advanced-settings > summary:focus-visible/);
  assert.match(styles, /#ai-image-panel[^\n]*:focus-visible/);
  assert.match(styles, /@media \(max-width: 960px\)[\s\S]*\.ai-reference-section/);
});

test("Given comparison and PDF dialogs, When controls change state, Then foreground focus and disabled states stay visible", () => {
  // Given the standalone comparison dialog and keyboard-operable PDF workspace.
  // When their visual state contracts are inspected.
  // Then text, focus, and disabled semantics have explicit token-driven styles.
  assert.match(styles, /\.ai-compare-dialog\s*\{[^}]*color:\s*var\(--text-primary/s);
  assert.match(styles, /\.ai-compare-head button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent/s);
  assert.match(styles, /\.ai-reference-search-dialog button:disabled\s*\{[^}]*color:\s*var\(--text-secondary[^}]*opacity:\s*\.6[^}]*cursor:\s*not-allowed/s);
  assert.match(styles, /\.ai-pdf-crop-selection:focus-visible\s*\{[^}]*outline:\s*3px solid/s);
});
