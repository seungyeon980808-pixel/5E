const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("desktop shell is configured with isolation and Codex app-server", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const threadProfile = fs.readFileSync(path.join(__dirname, "ai-thread-profile.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  assert.match(main, /app-server/);
  assert.match(main, /notify\("initialized"\)/);
  assert.match(main, /thread\/resume/);
  assert.match(main, /turn\/interrupt", \{ threadId: activeTurn\.threadId, turnId: targetTurnId \}/);
  assert.match(main, /model\/list/);
  assert.match(main, /account\/rateLimits\/read/);
  assert.match(main, /account\/usage\/read/);
  assert.match(main, /effort: effort \|\| null/);
  assert.match(main, /serviceTier: serviceTier \|\| null/);
  assert.match(main, /buildEphemeralThreadStartParams/);
  assert.match(threadProfile, /ephemeral: true/);
  assert.match(main, /method: "5e\/performance"/);
  assert.match(main, /threadId: plan\.ephemeralRender \? null : requestThreadId/);
  assert.match(main, /Promise\.allSettled\(safeAttachments\.map/);
  assert.match(main, /fs\.promises\.unlink\(result\.value\.file\)/);
  assert.equal((main.match(/rpc\("turn\/start"/g) || []).length, 1, "backend must not retry a turn implicitly");
  assert.match(main, /imageGeneration/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /FIVE_E_DEV_USER_DATA/);
  assert.match(main, /FIVE_E_DISABLE_GPU/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /win\.setMenu\(null\)/);
  assert.match(main, /win\.setMenuBarVisibility\(false\)/);
  assert.match(main, /splash\.html/);
  assert.match(main, /show: false/);
  assert.match(main, /ready-to-show/);
  assert.match(main, /titleBarStyle: "hidden"/);
  assert.match(main, /titleBarOverlay/);
  assert.ok(fs.existsSync(path.join(__dirname, "splash.html")));
  assert.match(preload, /contextBridge\.exposeInMainWorld/);
  assert.match(preload, /codex:models/);
  assert.match(preload, /interrupt: \(turnId\) => ipcRenderer\.invoke\("codex:interrupt", turnId\)/);
  assert.match(preload, /codex:account/);
  assert.match(preload, /desktop-shell/);
  assert.match(preload, /capture:sources/);
  assert.match(preload, /local-images:pick-folder/);
  assert.match(preload, /local-images:list/);
  assert.match(main, /desktopCapturer\.getSources/);
  assert.match(main, /collectLocalAssets/);
  assert.match(main, /PDF_EXTENSIONS/);
});

test("image prompt includes the no-label drawing rule", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "..", "js", "ai-prompt.js"), "utf8");
  assert.match(prompt, /문자, 숫자, 단위, 수식, 기호, 라벨, 로고, 워터마크, 지시선과 화살표/);
  assert.match(prompt, /buildDiscussionPrompt/);
  assert.match(prompt, /imagegen 이미지 생성 도구를 정확히 1회 호출한다/);
  assert.doesNotMatch(prompt, /docs\//);
});

test("AI panel auto-connects, reports progress, and routes contextual output actions", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  const events = fs.readFileSync(path.join(__dirname, "..", "js", "ai-events.js"), "utf8");
  const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "..", "css", "ai-panel.css"), "utf8");
  assert.match(panel, /5e\.aiConversationId/);
  assert.match(panel, /fiveEDesktop\.start\(\)/);
  assert.match(panel, /fiveEDesktop\.models\(\)/);
  assert.match(panel, /model: modelSelect\.value/);
  assert.match(panel, /effort: effortSelect\.value/);
  assert.match(panel, /serviceTier: speedSelect\.value/);
  assert.match(panel, /loadAccountOverview/);
  assert.match(panel, /addTokenFooter/);
  assert.match(panel, /pointerdown/);
  assert.match(panel, /openComparison/);
  assert.match(panel, /attachments\.push/);
  assert.match(panel, /const canCompare = attachments\.length > 0 && generatedImages\.length > 0;/);
  assert.match(panel, /output\.className = "ai-canvas-output"/);
  assert.match(panel, /item\.sceneResult\?\.objects\?\.length[\s\S]*insertFastSceneIntoState\(state, item\.sceneResult\)/);
  assert.match(panel, /insertImageFromSrc\(state, item\.data\)/);
  assert.match(panel, /setGenerating\(true/);
  assert.match(panel, /parseAiEvent/);
  assert.match(events, /item\?\.type === "imageGeneration"/);
  assert.match(events, /item\?\.type === "agentMessage"/);
  assert.match(events, /item\.phase === "commentary"/);
  assert.match(events, /imageDataUrl/);
  assert.match(events, /thread\/tokenUsage\/updated/);
  const advancedStart = markup.indexOf('<details class="ai-advanced-settings"');
  const advancedEnd = markup.indexOf("</details>", advancedStart);
  assert.notEqual(advancedStart, -1);
  assert.notEqual(advancedEnd, -1);
  const advanced = markup.slice(advancedStart, advancedEnd + "</details>".length);
  const defaultSurface = `${markup.slice(0, advancedStart)}${markup.slice(advancedEnd + "</details>".length)}`;
  assert.doesNotMatch(advanced.split(">")[0], /\bopen\b/);
  assert.match(defaultSurface, /input type="file"[^>]*accept="image\/\*"/);
  assert.match(defaultSurface, /data-ai-reference-search/);
  assert.match(defaultSurface, /data-ai-send/);
  for (const hook of [
    "data-ai-chat-send", "data-ai-mode", "data-ai-speed", "data-ai-capture",
    "data-ai-quality", "data-ai-output-engine", "data-ai-batch", "data-ai-tabs",
  ]) {
    assert.match(advanced, new RegExp(`${hook}(?:=|\\s|>)`), hook);
  }
  assert.match(advanced, /data-ai-output-engine="asset"/);
  assert.match(markup, /v1\.5\.8 · 2026\.08\.13/);
  assert.doesNotMatch(markup, /업데이트 2026\.08\.09/);
  assert.match(panel, /openCaptureCrop/);
  assert.match(panel, /references = \[\]/);
  assert.match(panel, /createAiReferenceSearch/);
  assert.match(panel, /클립보드 이미지/);
  assert.match(markup, /data-ai-compare[^>]*hidden[^>]*disabled/);
  assert.doesNotMatch(markup, /id="(?:exam-library-open|parts-library-open)"/);
  assert.match(markup, /multiple/);
  assert.ok(
    markup.indexOf('data-ai-previews') < markup.indexOf('class="ai-reference-section"'),
    "generated results must stay above the collapsible reference images",
  );
  assert.match(styles, /grid-template-areas: "results conversation"/);
  assert.match(styles, /\.ai-status\[data-kind="ok"\].*var\(--accent/);
});
