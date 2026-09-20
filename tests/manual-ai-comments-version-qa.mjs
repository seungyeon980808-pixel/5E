import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const option = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const url = option('--url') || 'http://127.0.0.1:24913/index.html';
const outputDir = path.resolve(option('--out') || '.omo/evidence/wave2-comments-version');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await context.addInitScript(() => {
  const listeners = [];
  window.__qaSends = [];
  window.__qaEmit = message => listeners.forEach(listener => listener(message));
  window.fiveEDesktop = {
    status: async () => ({ login: { loggedIn: true }, server: true, state: 'running' }),
    start: async () => ({ ok: true }),
    models: async () => ({ data: [{ model: 'gpt-5.6-sol', displayName: 'Sol', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] }] }),
    account: async () => ({ account: { name: 'Controlled QA' }, limits: {} }),
    interrupt: async () => ({ ok: true }),
    send: async payload => {
      const turnId = `qa-turn-${window.__qaSends.length + 1}`;
      window.__qaSends.push({ ...payload, turnId });
      return { turnId, renderThreadId: `qa-render-${window.__qaSends.length}` };
    },
    onEvent: callback => listeners.push(callback),
    onState() {}, onLog() {}, setAiTaskShortcutActive() {},
  };
});

const page = await context.newPage();
await page.route('**/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await page.route('**/js/mcp-bridge.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const png = color => {
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, 120, 80);
      context.fillStyle = color; context.fillRect(20, 15, 80, 50);
      return canvas.toDataURL('image/png');
    };
    const { initAiPanel } = await import('/js/ai-panel.js');
    const state = { objects: [], selectedIds: [], undoStack: [], redoStack: [], pages: [], activePageId: 'page-1', activeLayerId: 'layer-1', activeTool: 'V', targetedId: null, artboard: { width: 800, height: 600 }, viewBox: { x: -400, y: -300, w: 800, h: 600 } };
    window.__qaManager = initAiPanel({ get: () => state, update: mutate => mutate(state) });
    await window.__qaManager.ready;
    const workspace = {
      key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 1, imageSerial: 2,
      tabs: [{
        id: 'task-1', title: '코멘트 버전', workState: 'idle', attachments: [], conversationMessages: [], uiMessages: [], input: '선택 버전의 코멘트만 반영',
        generated: [
          { id: 'v1', name: '버전 1', kind: 'generated', data: png('#335577'), reviewState: 'first-generated', comments: [], nextCommentNumber: 1 },
          { id: 'v2', name: '버전 2', kind: 'generated', data: png('#775533'), reviewState: 'first-generated', comments: [], nextCommentNumber: 1 },
        ],
        selectedCandidateId: 'v1',
        workbenchViewState: { layout: 'result', zoom: { source: 1, result: 1 } },
        commentViewState: { tool: 'pan', selected: null, tab: 'comments' },
      }],
    };
    await window.__qaManager.openSharingDocument('comments-version-qa', {
      workspaces: [workspace], activeWorkspace: 0, mode: 'copy',
    });
  });

  const panel = page.locator('#ai-image-panel');
  await panel.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 2);
  assert.equal(await panel.getAttribute('data-ai-selected-candidate-id'), 'v1');
  assert.equal(await panel.locator('.is-ai-active-candidate').getAttribute('data-ai-candidate-id'), 'v1');
  assert.equal((await panel.locator('[data-ai-version-button]').textContent()).trim(), '버전 1');
  assert.equal(await panel.locator('[data-ai-comment-marker]').count(), 0);
  await panel.locator('[data-ai-comment-tool="point"]').click();
  await panel.locator('.is-ai-active-candidate .ai-preview-stage > img').click({ position: { x: 40, y: 30 } });
  assert.equal(await panel.locator('[data-ai-comment-marker]').count(), 1);
  await panel.locator('[data-ai-comment-row] textarea').fill('v1 점 수정');
  await page.screenshot({ path: path.join(outputDir, 'v1-point-1280.png'), fullPage: true });

  await panel.locator('[data-ai-version-button]').click();
  await page.screenshot({ path: path.join(outputDir, 'version-dropdown-1280.png'), fullPage: true });
  await panel.locator('[data-ai-candidate-option="v2"]').click();
  assert.equal(await panel.getAttribute('data-ai-selected-candidate-id'), 'v2');
  await panel.locator('[data-ai-comment-tool="area"]').click();
  const image = panel.locator('.is-ai-active-candidate .ai-preview-stage > img');
  const box = await image.boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .65);
  await page.mouse.up();
  assert.equal(await panel.locator('[data-ai-comment-marker]').count(), 2, 'area comment renders one region and one pin');
  const v2Editor = panel.locator('[data-ai-comment-row] textarea');
  await v2Editor.fill('v2 영역 수정됨');
  await page.setViewportSize({ width: 768, height: 820 });
  await page.screenshot({ path: path.join(outputDir, 'v2-area-768.png'), fullPage: true });
  await panel.locator('[data-ai-inline-delete]').click();
  assert.equal(await panel.locator('[data-ai-comment-row]').count(), 0);
  await page.setViewportSize({ width: 375, height: 820 });
  assert.equal(await panel.evaluate(element => element.scrollWidth > element.clientWidth + 2), false);
  await page.screenshot({ path: path.join(outputDir, 'v2-deleted-375.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 820 });
  await panel.locator('[data-ai-version-button]').click();
  await panel.locator('[data-ai-candidate-option="v1"]').click();
  assert.equal(await panel.locator('[data-ai-comment-row] textarea').inputValue(), 'v1 점 수정');
  await panel.evaluate(element => element.dispatchEvent(new CustomEvent('5e:ai-review', { detail: {
    state: 'reviewing', candidateId: 'v1', model: 'gpt-internal-review', effort: 'high',
    pixelInspection: { opaque: true, strictlyAchromatic: true },
    report: { verdict: '', checks: [{ id: 'internal', label: 'internal-check', status: 'pending', detail: 'private' }], issues: [] },
  } })));
  assert.equal((await panel.locator('[data-ai-review-summary]').textContent()).trim(), '결과 확인 중');
  const reviewText = await panel.locator('[data-ai-review-summary], [data-ai-result-state], [data-ai-status], [data-ai-log]').allTextContents();
  assert.equal(reviewText.some(text => /gpt-internal|high|pixelInspection|internal-check|private/.test(text)), false);
  await page.screenshot({ path: path.join(outputDir, 'review-state-1280.png'), fullPage: true });
  await panel.locator('[data-ai-comments-apply]').click();
  await page.waitForFunction(() => window.__qaSends.some(send => send.purpose === 'image'));
  const request = await page.evaluate(() => window.__qaSends.find(send => send.purpose === 'image'));
  assert.match(request.text, /이미지ID v1[\s\S]*v1 점 수정/);
  assert.doesNotMatch(request.text, /v2 영역 수정/);
  assert.match(request.attachments.at(-1).name, /버전 1$/);

  const visibleText = await panel.locator(':visible').allTextContents();
  assert.equal(visibleText.some(text => /gpt-5|pixelInspection|\bhigh\b|Sol 독립 검수/.test(text)), false);
  await page.screenshot({ path: path.join(outputDir, 'comments-version-followup.png'), fullPage: true });
  console.log(JSON.stringify({ selected: 'v1', versionLifecycle: 'pass', followupComment: 'v1 점 수정', screenshots: 6 }));
} finally {
  await browser.close();
}
