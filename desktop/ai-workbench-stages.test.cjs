const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("image workbench exposes preparation, processing, and result stages", () => {
  const html = read("index.html");
  const panel = read("js/ai-panel.js");
  const workbench = read("js/ai-workbench.js");
  const styles = read("css/ai-panel.css");

  assert.match(html, /id="ai-image-file-input"/);
  assert.match(html, /ai-stage-empty[\s\S]*작업할 이미지를 추가하세요[\s\S]*이미지를 끌어놓거나 파일을 선택하세요[\s\S]*data-ai-add-file/);
  assert.equal((html.match(/data-ai-input(?:\s|=)/g) || []).length, 1);
  assert.equal((html.match(/data-ai-chat-input(?:\s|=)/g) || []).length, 1);
  assert.match(panel, /const activeInput = type === "chat" \? chatInput : input/);
  assert.match(panel, /chatInput\?\.addEventListener\("keydown"/);
  assert.match(panel, /type === "chat" && chatInput/);
  assert.match(panel, /closest\("\[data-ai-add-file\]"\)[\s\S]*file\.click\(\)/);
  assert.match(panel, /const fixedFirst = white && generatedImages\.length === 0/);
  assert.match(panel, /panel\.dataset\.aiFixedFirst = String\(fixedFirst\)/);
  assert.match(panel, /input\.hidden = fixedFirst/);
  assert.match(panel, /input\.disabled = busy \|\| fixedFirst/);
  assert.match(html, /data-ai-request-note[\s\S]*먼저 평가원식 흑백 선화로 변환합니다\.<br>결과에 수정 위치를 표시하세요\./);

  assert.match(workbench, /sourceCards\(\)\.length \? "preparation" : "empty"/);
  assert.match(workbench, /if \(processing && !generatedCards\(\)\.length\) \{\s*setLayout\("result"\)/);
  assert.match(workbench, /fromUser && !window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(workbench, /paneAnimations\.get\(pane\)\?\.cancel\(\)/);
  assert.match(workbench, /translate3d\(\$\{offset\}px, 0, 0\)/);
  assert.match(workbench, /5e:image-panel-layout-will-change/);
  assert.match(workbench, /5e:image-panel-layout-did-change/);
  assert.match(workbench, /if \(panelLayoutChanging \|\| zoom !== 1\) return/);
  assert.match(styles, /data-ai-stage="empty"[\s\S]*\.ai-workbench-actions/);
  assert.match(styles, /data-ai-stage="preparation"[\s\S]*\.ai-output-actions/);
  assert.doesNotMatch(styles, /data-ai-stage="preparation"\]\s+\.ai-comment-compose/);
  assert.match(styles, /data-ai-stage="preparation"\] \[data-ai-layout-mode\]/);
  assert.match(styles, /data-ai-stage="preparation"\] \.ai-review-overview/);
  assert.match(styles, /data-ai-stage="preparation"\] \.ai-workbench-actions > \[data-ai-comments-apply\]/);
  assert.match(styles, /data-ai-stage="preparation"\]\[data-ai-fixed-first="true"\] \.ai-comments-list-section/);
  assert.match(styles, /data-ai-stage="processing"[\s\S]*\.ai-output-actions/);
  assert.match(styles, /data-ai-stage="processing"[\s\S]*\.ai-progress-track \{ display:none !important; \}/);
  assert.match(styles, /data-ai-stage="result"\] \.ai-preparation \{ display:none !important; \}/);
  assert.doesNotMatch(styles, /data-ai-stage="processing"[^}]*\.ai-generated-card[^}]*display\s*:\s*none/);
});
