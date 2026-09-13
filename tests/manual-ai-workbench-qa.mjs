import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const option = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const url = option('--url') || 'http://127.0.0.1:24892/index.html';
const outputDir = path.resolve(option('--out') || '.omo/evidence/repair14/ai/full-workbench');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'no-preference' });
await context.addInitScript(() => {
  const listeners = [];
  window.__qaSends = [];
  window.__qaEmit = message => listeners.forEach(listener => listener(message));
  const completeStructureAnalysis = (turnId, sourceCount) => {
    const spec = {
      version: 1,
      sourceCount,
      profiles: ['material'],
      components: Array.from({ length: sourceCount }, (_, index) => ({
        id: `source-${index + 1}`,
        label: index ? `연결 원본 ${index + 1}` : '연결 원본',
        source: index + 1,
        count: null,
        stage: '',
        evidence: '첨부 이미지 전체 경계와 내부 선',
      })),
      relations: [],
      marks: [],
      uncertainties: ['작은 세부 요소는 생성 결과와 직접 비교해 확인'],
    };
    setTimeout(() => {
      window.__qaEmit({ method: 'item/completed', params: { turnId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(spec) } } });
      window.__qaEmit({ method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
    }, 0);
  };
  window.__qaCompleteImage = (sendIndex, dataUrl, status = 'completed') => {
    const request = window.__qaSends[sendIndex];
    if (!request) throw new Error(`No controlled send at ${sendIndex}`);
    if (status === 'completed') {
      window.__qaEmit({ method: 'item/started', params: { turnId: request.turnId, item: { type: 'imageGeneration' } } });
      window.__qaEmit({ method: 'item/completed', params: { turnId: request.turnId, item: { type: 'imageGeneration', imageDataUrl: dataUrl } } });
    }
    window.__qaEmit({ method: 'turn/completed', params: { turn: { id: request.turnId, status, error: status === 'failed' ? 'controlled failure' : null } } });
  };
  window.fiveEDesktop = {
    status: async () => ({ login: { loggedIn: true }, server: true, state: 'running' }),
    start: async () => ({ ok: true }),
    models: async () => ({ data: [{ model: 'gpt-5.6-sol', displayName: 'QA', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'] }] }),
    account: async () => ({ account: { name: 'Controlled QA' }, limits: {} }),
    interrupt: async () => ({ ok: true }),
    send: async payload => {
      const index = window.__qaSends.length;
      const turnId = `qa-turn-${index + 1}`;
      window.__qaSends.push({ ...payload, turnId });
      if (payload.purpose === 'chat') completeStructureAnalysis(turnId, Math.max(1, payload.attachments?.length || 1));
      return { turnId, renderThreadId: `qa-render-${index + 1}` };
    },
    onEvent: callback => listeners.push(callback),
    onState() {},
    onLog() {},
    setAiTaskShortcutActive() {},
  };
});

const page = await context.newPage();
await page.route('**/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
await page.route('**/js/mcp-bridge.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
const report = { url, controlledTransport: true, paidProviderCalls: 0 };

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const makePng = (width, height, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.fillStyle = color;
      context.fillRect(2, 2, width - 4, height - 4);
      return canvas.toDataURL('image/png');
    };
    window.__qaOutput = [
      makePng(180, 112, '#224466'),
      makePng(176, 118, '#557733'),
      makePng(184, 108, '#884433'),
      makePng(172, 116, '#554477'),
    ];
    const { initAiPanel } = await import('/js/ai-panel.js');
    const state = { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { width: 800, height: 600 } };
    window.__qaManager = initAiPanel({ get: () => state });
    await window.__qaManager.ready;
    await window.__qaManager.open({
      references: [
        { dataUrl: makePng(60, 64, '#1f5f99'), name: '좁고-긴-원본.png', referenceRole: 'INPUT_SOURCE' },
        { dataUrl: makePng(92, 40, '#a04a32'), name: '넓고-낮은-원본.png', referenceRole: 'INPUT_SOURCE' },
      ],
      placement: 'together',
      prompt: '두 원본을 선택 순서대로 한 장으로 연결해 변환해 주세요.',
      startGeneration: false,
    });
  });

  const panel = page.locator('#ai-image-panel');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.ai-task-tab').count(), 1, 'together creates one task');
  assert.equal(await page.locator('.ai-reference-card').count(), 2, 'both original sources remain visible');
  assert.equal(await page.evaluate(() => window.__qaSends.length), 0, 'adding sources does not generate');
  assert.equal(await panel.getAttribute('data-ai-composition-orientation'), 'horizontal');

  const initialOrder = await panel.getAttribute('data-ai-composition-order');
  const secondReferenceId = await page.locator('.ai-reference-card').nth(1).getAttribute('data-ai-reference-id');
  await page.locator('[data-ai-source-select]').selectOption(secondReferenceId);
  await page.locator('.ai-reference-card.is-ai-active-source [data-ai-reference-move="earlier"]').click();
  const reordered = await panel.getAttribute('data-ai-composition-order');
  assert.notEqual(reordered, initialOrder, 'earlier control changes source order');
  await page.locator('[data-ai-composition-orientation="vertical"]').click();
  assert.equal(await panel.getAttribute('data-ai-composition-orientation'), 'vertical');
  await page.locator('[data-ai-composition-orientation="horizontal"]').click();

  await page.locator('[data-ai-send]').click();
  await page.waitForTimeout(500);
  await page.waitForFunction(() => window.__qaSends.some(send => send.purpose === 'image'));
  const firstImageIndex = await page.evaluate(() => window.__qaSends.findIndex(send => send.purpose === 'image'));
  const firstRequest = await page.evaluate(index => {
    const send = window.__qaSends[index];
    return { count: send.attachments.length, names: send.attachments.map(item => item.name) };
  }, firstImageIndex);
  assert.equal(firstRequest.count, 1, 'the provider receives one completed composite');
  assert.equal(firstRequest.names[0], 'INPUT_SOURCE.png');
  await page.waitForFunction(() => document.querySelector('[data-ai-composite-preview]')?.dataset.compositeWidth === '152');
  const compositePreview = await page.locator('[data-ai-composite-preview] img').evaluate(image => ({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, cssWidth: image.getBoundingClientRect().width }));
  assert.deepEqual([compositePreview.naturalWidth, compositePreview.naturalHeight], [152, 64]);
  assert(compositePreview.cssWidth > 100, 'preview uses rendered width rather than collapsed HTML attributes');
  await page.evaluate(index => window.__qaCompleteImage(index, window.__qaOutput[0]), firstImageIndex);
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 1 && document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');

  await page.locator('[data-ai-layout-mode="side-by-side"]').click();
  const activeResultImage = () => page.locator('.ai-generated-card.is-ai-active-candidate img').first();
  await page.locator('[data-ai-comment-tool="point"]').click();
  await activeResultImage().click({ position: { x: 18, y: 18 } });
  await page.locator('[data-ai-inline-editor]').fill('결과 1 점 코멘트');
  assert.equal(await page.locator('[data-ai-comment-geometry] input').count(), 2);

  const geometry = async () => page.evaluate(() => {
    const rect = selector => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    return { source: rect('.ai-original-pane .ai-preview-stage'), result: rect('.ai-generated-card.is-ai-active-candidate .ai-preview-stage') };
  });
  const compareWithinOnePixel = (before, during) => {
    for (const pane of ['source', 'result']) for (const key of ['x', 'y', 'width', 'height']) {
      assert(Math.abs(before[pane][key] - during[pane][key]) <= 1, `${pane}.${key} moved during revision`);
    }
  };
  const assertOverlayInside = async () => {
    const inside = await page.evaluate(() => {
      const overlay = document.querySelector('[data-ai-generating]').getBoundingClientRect();
      const pane = document.querySelector('.ai-result-pane').getBoundingClientRect();
      return overlay.left >= pane.left - 1 && overlay.top >= pane.top - 1 && overlay.right <= pane.right + 1 && overlay.bottom <= pane.bottom + 1;
    });
    assert.equal(inside, true, 'processing overlay remains inside result pane');
  };

  const beforeSecond = await geometry();
  await page.locator('[data-ai-comments-apply]').click();
  await page.waitForFunction(previous => window.__qaSends.filter(send => send.purpose === 'image').length > previous, 1);
  const secondImageIndex = await page.evaluate(() => window.__qaSends.map((send, index) => ({ send, index })).filter(item => item.send.purpose === 'image').at(-1).index);
  compareWithinOnePixel(beforeSecond, await geometry());
  await assertOverlayInside();
  await page.evaluate(index => window.__qaCompleteImage(index, window.__qaOutput[1]), secondImageIndex);
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 2 && document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');

  await page.locator('[data-ai-comment-tool="area"]').click();
  const result2 = activeResultImage();
  const bounds = await result2.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.65);
  await page.mouse.up();
  await page.locator('[data-ai-inline-editor]').fill('결과 2 영역 코멘트');
  assert.equal(await page.locator('[data-ai-comment-geometry] input').count(), 4);

  const beforeThird = await geometry();
  await page.locator('[data-ai-comments-apply]').click();
  await page.waitForFunction(() => window.__qaSends.filter(send => send.purpose === 'image').length === 3);
  const thirdImageIndex = await page.evaluate(() => window.__qaSends.map((send, index) => ({ send, index })).filter(item => item.send.purpose === 'image').at(-1).index);
  compareWithinOnePixel(beforeThird, await geometry());
  await assertOverlayInside();
  await page.screenshot({ path: path.join(outputDir, 'task-3-third-processing.png'), fullPage: true });
  await page.evaluate(index => window.__qaCompleteImage(index, window.__qaOutput[2]), thirdImageIndex);
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 3 && document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');

  const versionButton = page.locator('[data-ai-version-button]');
  await versionButton.focus();
  await versionButton.press('ArrowDown');
  assert.equal(await versionButton.getAttribute('aria-expanded'), 'true');
  const options = page.locator('[data-ai-candidate-option]');
  await options.first().press('End');
  assert.equal(await options.last().evaluate(node => node === document.activeElement), true);
  await options.last().press('Home');
  assert.equal(await options.first().evaluate(node => node === document.activeElement), true);
  await options.first().press('End');
  await page.locator('[data-ai-candidate-option]:focus').press('Enter');
  assert.equal(await versionButton.evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator('[data-ai-inline-editor]').inputValue(), '결과 1 점 코멘트');
  assert.deepEqual(await page.locator('[data-ai-inline-editor]').evaluateAll(editors => editors.map(editor => editor.value)), ['결과 1 점 코멘트']);
  await page.screenshot({ path: path.join(outputDir, 'task-3-result1-comment.png'), fullPage: true });
  await versionButton.click();
  await page.locator('[data-ai-candidate-option]:focus').press('Escape');
  assert.equal(await versionButton.evaluate(node => node === document.activeElement), true);
  assert.equal(await panel.isVisible(), true, 'Escape closes only the listbox');
  await versionButton.click();
  await page.locator('#ai-image-title').click();
  assert.equal(await page.locator('[data-ai-version-list]').isHidden(), true, 'outside click closes the listbox');

  await page.locator('[data-ai-pane-zoom="result"] [data-ai-zoom-action="in"]').click();
  await page.evaluate(() => {
    const card = document.querySelector('.ai-result-pane .ai-generated-card.is-ai-active-candidate');
    card.scrollLeft = 9;
    card.scrollTop = 11;
    card.dispatchEvent(new Event('scroll'));
  });
  const beforeFailure = await page.evaluate(() => ({
    input: document.querySelector('[data-ai-input]').value,
    orientation: document.querySelector('#ai-image-panel').dataset.aiCompositionOrientation,
    order: document.querySelector('#ai-image-panel').dataset.aiCompositionOrder,
    selected: document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId,
    comments: [...document.querySelectorAll('[data-ai-inline-editor]')].map(editor => editor.value),
    versions: document.querySelectorAll('.ai-generated-card').length,
    view: document.querySelector('#ai-image-panel').aiWorkbench.getViewState(),
  }));
  await page.locator('[data-ai-comments-apply]').click();
  await page.waitForFunction(() => window.__qaSends.filter(send => send.purpose === 'image').length === 4);
  const failedImageIndex = await page.evaluate(() => window.__qaSends.map((send, index) => ({ send, index })).filter(item => item.send.purpose === 'image').at(-1).index);
  await page.evaluate(index => window.__qaCompleteImage(index, '', 'failed'), failedImageIndex);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');
  assert.equal(await page.locator('[data-ai-status]').innerText(), '변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.');
  const afterFailure = await page.evaluate(() => ({
    input: document.querySelector('[data-ai-input]').value,
    orientation: document.querySelector('#ai-image-panel').dataset.aiCompositionOrientation,
    order: document.querySelector('#ai-image-panel').dataset.aiCompositionOrder,
    selected: document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId,
    comments: [...document.querySelectorAll('[data-ai-inline-editor]')].map(editor => editor.value),
    versions: document.querySelectorAll('.ai-generated-card').length,
    view: document.querySelector('#ai-image-panel').aiWorkbench.getViewState(),
  }));
  assert.deepEqual(afterFailure, beforeFailure, 'failed run preserves draft, comments, order, selected version, zoom and scroll');
  await page.screenshot({ path: path.join(outputDir, 'task-3-failure-preserved.png'), fullPage: true });

  const retry = page.locator('[data-ai-retry-interrupted]');
  await retry.click();
  await page.waitForFunction(() => window.__qaSends.filter(send => send.purpose === 'image').length === 5);
  const retryImageIndex = await page.evaluate(() => window.__qaSends.map((send, index) => ({ send, index })).filter(item => item.send.purpose === 'image').at(-1).index);
  await page.evaluate(index => window.__qaCompleteImage(index, window.__qaOutput[3]), retryImageIndex);
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 4 && document.querySelector('#ai-image-panel')?.dataset.aiBusy === 'false');
  await versionButton.focus();
  await versionButton.press('ArrowUp');
  await page.locator('[data-ai-candidate-option]:focus').press('Enter');
  assert.equal(await page.locator('[data-ai-inline-editor]').inputValue(), '결과 1 점 코멘트', 'retry retains historical comments');
  await page.locator('[data-ai-inline-delete]').click();
  assert.equal(await page.locator('[data-ai-inline-editor]').count(), 0, 'comment deletion works after retry and version restore');

  const ordinaryUi = await panel.innerText();
  assert.doesNotMatch(ordinaryUi, /gpt-5\.6-sol|reasoning|high effort|pixel|internal inspection/i);
  await page.screenshot({ path: path.join(outputDir, 'task-3-ai-composite-revisions.png'), fullPage: true });
  Object.assign(report, {
    fullWorkbench: true,
    taskCount: 1,
    sourceDimensions: [[60, 64], [92, 40]],
    compositeDimensions: [152, 64],
    autoGenerationOnAdd: false,
    providerCompositeAttachmentCount: firstRequest.count,
    revisionsCompleted: 4,
    secondAndThirdGeometryStable: true,
    overlayInsideResultPane: true,
    versionKeyboardAndFocusReturn: true,
    versionCommentIsolation: true,
    failedStateByteEqual: true,
    retrySentExactlyOnce: true,
    commentDeleteAfterRetry: true,
    ordinaryUiHidesInternalFields: true,
  });
  await writeFile(path.join(outputDir, 'manual-qa.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, 'task-3-ai-composite-revisions-error.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(outputDir, 'manual-qa-error.json'), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
