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
      context.fillRect(width * .04, height * .04, width * .92, height * .92);
      return canvas.toDataURL('image/png');
    };
    window.__qaOutput = [
      makePng(120, 128, '#224466'),
      makePng(176, 118, '#557733'),
      makePng(184, 108, '#884433'),
      makePng(172, 116, '#554477'),
    ];
    const { initAiPanel } = await import('/js/ai-panel.js');
    const state = {
      objects: [], selectedIds: [], undoStack: [], redoStack: [], pages: [],
      activePageId: 'page-1', activeLayerId: 'layer-1', activeTool: 'V', targetedId: null,
      artboard: { width: 800, height: 600 }, viewBox: { x: -400, y: -300, w: 800, h: 600 },
    };
    window.__qaState = state;
    window.__qaManager = initAiPanel({ get: () => state, update: mutate => mutate(state) });
    await window.__qaManager.ready;
    await window.__qaManager.open({
      references: [
        { dataUrl: makePng(60, 64, '#1f5f99'), name: '좁고-긴-원본.png', referenceRole: 'INPUT_SOURCE' },
      ],
      placement: 'together',
      prompt: '두 원본을 선택 순서대로 한 장으로 연결해 변환해 주세요.',
      startGeneration: false,
    });
  });

  const panel = page.locator('#ai-image-panel');
  await panel.waitFor({ state: 'visible' });

  await panel.locator('[data-ai-send]').click();
  await page.waitForFunction(() => window.__qaSends.some(send => send.purpose === 'image'));
  const idx = await page.evaluate(() => window.__qaSends.findIndex(send => send.purpose === 'image'));
  await page.evaluate(index => window.__qaCompleteImage(index, window.__qaOutput[0]),idx);
  await page.waitForFunction(() => document.querySelectorAll('.ai-generated-card').length === 1 && document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
  assert.equal(await panel.locator('[data-ai-tracking-control]').isVisible(),true);
  await panel.locator('[data-ai-pane-zoom="source"] [data-ai-zoom-action="in"]').click({clickCount:4});
  const zooms = await panel.locator('[data-ai-zoom-value]').allTextContents();
  assert.equal(zooms[0],zooms[1]);
  const original = panel.locator('.is-ai-active-source');
  await original.evaluate(card=>{card.scrollTop=60;card.scrollLeft=40;});
  await page.waitForTimeout(120);
  const positions = await panel.evaluate(p=>['.is-ai-active-source','.is-ai-active-candidate'].map(sel=>{
    const c=p.querySelector(sel),s=c.querySelector('.ai-preview-stage');
    return {x:(c.scrollLeft+c.clientWidth/2-s.offsetLeft)/s.offsetWidth,y:(c.scrollTop+(c.closest(".ai-image-pane").getBoundingClientRect().bottom-c.getBoundingClientRect().top)/2-s.offsetTop)/s.offsetHeight};
  }));
  assert.ok(Math.abs(positions[0].x-positions[1].x)<.02,JSON.stringify(positions));
  assert.ok(Math.abs(positions[0].y-positions[1].y)<.02,JSON.stringify(positions));
  await page.screenshot({path:path.join(outputDir,'comparison.png')});
  await panel.locator('[data-ai-layout-mode="source"]').click();
  assert.equal(await panel.locator('[data-ai-tracking-control]').isVisible(),false);
  await page.waitForTimeout(100);
  const sourceFrame = await panel.locator('.is-ai-active-source .ai-preview-stage').boundingBox();
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiLayout==='result');
  await page.waitForTimeout(100);
  const resultFrame = await panel.locator('.is-ai-active-candidate .ai-preview-stage').boundingBox();
  assert.ok(Math.abs(sourceFrame.width-resultFrame.width)<2,JSON.stringify({sourceFrame,resultFrame}));
  assert.ok(Math.abs(sourceFrame.y-resultFrame.y)<2,JSON.stringify({sourceFrame,resultFrame}));
  await page.screenshot({path:path.join(outputDir,'result.png')});
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiLayout==='source');
  await panel.locator('[data-ai-comment-tool="point"]').click();
  await panel.locator('.is-ai-active-source .ai-preview-stage').click({position:{x:120,y:120}});
  const input = panel.locator('textarea:visible').first();
  await input.fill('입력'); await input.press('Space');
  assert.equal(await panel.getAttribute('data-ai-layout'),'source');
  assert.ok((await input.inputValue()).endsWith(' '));
  await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
  await panel.locator('[data-ai-zoom-linked]').uncheck();
  const before = await panel.locator('[data-ai-pane-zoom="result"] output').textContent();
  await panel.locator('[data-ai-pane-zoom="source"] [data-ai-zoom-action="in"]').click();
  assert.equal(await panel.locator('[data-ai-pane-zoom="result"] output').textContent(),before);
  console.log('PASS: tracking zoom/pan, single mode Space, tracking off');
} finally {await browser.close();}
