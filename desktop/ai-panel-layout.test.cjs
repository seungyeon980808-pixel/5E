const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function block(source, prelude) {
  const start = source.indexOf(prelude);
  assert.notEqual(start, -1, `missing ${prelude}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unclosed ${prelude}`);
}

test("AI conversation controls use a readable aligned option grid", () => {
  const html = read("index.html");
  const css = read("css/ai-panel.css");

  assert.equal((html.match(/class="ai-mode-options"/g) || []).length, 3);
  assert.match(css, /--ai-type-control:\s*12px/);
  assert.match(css, /--ai-type-body:\s*12\.5px/);
  assert.match(css, /grid-template-columns:\s*minmax\(760px, 1fr\) 360px/);
  assert.match(css, /\.ai-mode-row\s*\{[^}]*grid-template-columns:\s*76px minmax\(0, 1fr\)/s);
  assert.match(css, /\.ai-mode-options\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.ai-quality-row \.ai-mode-options\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.ai-conversation-actions button\s*\{[^}]*min-height:\s*38px/s);
});

test("narrow AI workspaces stack both panes under one bounded scroll owner", () => {
  // Given the responsive rules that must apply at both 680px and 800px.
  const css = read("css/ai-panel.css");

  // When the narrow cascade is resolved without capturing the 1080px desktop host.
  const compact = block(css, "@media (max-width: 760px)");
  const responsive = block(css, "@media (max-width: 960px)");
  const workspace = block(responsive, ".ai-workspace");
  const results = block(responsive, ".ai-results");
  const conversation = block(responsive, ".ai-conversation");

  // Then results stack above a visible composer, with the workspace owning overflow.
  assert.match(workspace, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(workspace, /grid-template-areas:\s*"results"\s*"conversation"/);
  assert.match(workspace, /grid-template-rows:\s*auto auto/);
  assert.match(workspace, /min-height:\s*0/);
  assert.match(workspace, /overflow-y:\s*auto/);
  assert.match(results, /min-height:\s*min\(/);
  assert.match(conversation, /display:\s*flex/);
  assert.match(conversation, /min-height:\s*min\(/);
  assert.match(compact, /grid-template-areas:\s*"results"\s*"conversation"/);
  assert.doesNotMatch(compact, /\.ai-conversation\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(responsive, /minmax\(600px,\s*1fr\)/);
  assert.doesNotMatch(responsive, /\.ai-conversation\s*\{[^}]*display:\s*none/s);
});

test("narrow AI headers and toolbars keep every control reachable", () => {
  // Given the 680px and 800px responsive cascade.
  const responsive = block(read("css/ai-panel.css"), "@media (max-width: 960px)");

  // When header and toolbar layout contracts are resolved.
  const head = block(responsive, ".ai-head");
  const title = block(responsive, ".ai-head .modal-title");
  const status = block(responsive, ".ai-status");
  const toolbar = block(responsive, ".ai-media-toolbar");
  const sources = block(responsive, ".ai-source-group");
  const actions = block(responsive, ".ai-actions");

  // Then the title stays whole, status truncates beside close, and both control groups wrap in view.
  assert.match(head, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(title, /white-space:\s*nowrap/);
  assert.match(title, /word-break:\s*keep-all/);
  assert.match(status, /overflow:\s*hidden/);
  assert.match(status, /text-overflow:\s*ellipsis/);
  assert.match(status, /white-space:\s*nowrap/);
  assert.match(toolbar, /flex-wrap:\s*wrap/);
  assert.match(sources, /flex:\s*1 1 100%/);
  assert.match(sources, /flex-wrap:\s*wrap/);
  assert.match(actions, /flex:\s*1 1 100%/);
  assert.match(actions, /flex-wrap:\s*wrap/);
});
