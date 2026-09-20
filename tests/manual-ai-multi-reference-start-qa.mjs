import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const option = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const url = option('--url') || 'http://127.0.0.1:24893/index.html';
const outputDir = path.resolve(option('--out') || '.omo/evidence/multi-reference-start');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
await context.addInitScript(() => {
  const listeners = [];
  window.__qaSends = [];
  window.fiveEDesktop = {
    status: async () => ({ login: { loggedIn: true }, server: true, state: 'running' }),
    start: async () => ({ ok: true }),
    models: async () => ({ data: [{
      model: 'gpt-5.6-sol', displayName: 'QA', supportedReasoningEfforts: ['medium', 'high'], serviceTiers: ['priority'],
    }] }),
    account: async () => ({ account: { name: 'Controlled QA' }, limits: {} }),
    interrupt: async () => ({ ok: true }),
    send: async payload => {
      const turnId = `qa-turn-${window.__qaSends.length + 1}`;
      window.__qaSends.push({ ...payload, turnId });
      return { turnId, renderThreadId: `${turnId}-render` };
    },
    onEvent: callback => listeners.push(callback),
    onState() {},
    onLog() {},
    setAiTaskShortcutActive() {},
  };
});

async function preparePage() {
  const page = await context.newPage();
  await page.route('**/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/js/mcp-bridge.js*', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { initAiPanel } = await import('/js/ai-panel.js');
    const state = {
      objects: [], selectedIds: [], undoStack: [], redoStack: [], pages: [],
      activePageId: 'page-1', activeLayerId: 'layer-1', activeTool: 'V', targetedId: null,
      artboard: { width: 800, height: 600 }, viewBox: { x: -400, y: -300, w: 800, h: 600 },
    };
    window.__qaManager = initAiPanel({ get: () => state, update: mutate => mutate(state) }, { freshStart: true });
    await window.__qaManager.ready;
  });
  return page;
}

async function makePng(page, width, height, color) {
  return page.evaluate(({ width, height, color }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  }, { width, height, color });
}

async function imageEvidence(page, data) {
  return page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixel = x => [...context.getImageData(x, Math.floor(canvas.height / 2), 1, 1).data];
    return {
      width: canvas.width,
      height: canvas.height,
      first: pixel(0),
      last: pixel(canvas.width - 1),
    };
  }, data);
}

const report = { url, controlledTransport: true, paidProviderCalls: 0 };
try {
  const groupedPage = await preparePage();
  const red = await makePng(groupedPage, 4, 2, '#ff0000');
  const green = await makePng(groupedPage, 2, 2, '#00ff00');
  const blue = await makePng(groupedPage, 3, 3, '#0000ff');
  await groupedPage.evaluate(async references => {
    await window.__qaManager.openIndependentReferences({
      references,
      placement: 'together',
      prompt: '선택한 원본을 순서대로 연결해 한 장으로 변환해 주세요.',
      startGeneration: true,
    });
  }, [
    { dataUrl: red, name: 'first-red.png', referenceRole: 'INPUT_SOURCE' },
    { dataUrl: green, name: 'second-green.png', referenceRole: 'INPUT_SOURCE' },
    { dataUrl: blue, name: 'style-blue.png', referenceRole: 'STYLE_REFERENCE' },
  ]);
  const grouped = await groupedPage.evaluate(() => window.__qaSends.map(send => ({
    purpose: send.purpose,
    text: send.text,
    attachments: send.attachments,
  })));
  assert.equal(grouped.length, 1, 'grouped workbench starts exactly one provider request');
  assert.equal(grouped[0].purpose, 'image');
  assert.equal(grouped[0].attachments.length, 2, 'one structural composite and one style reference survive');
  assert.match(grouped[0].text, /"attachmentIndex":1,"role":"INPUT_SOURCE"/u);
  assert.match(grouped[0].text, /"attachmentIndex":2,"role":"STYLE_REFERENCE"/u);
  const composite = await imageEvidence(groupedPage, grouped[0].attachments[0].data);
  assert.deepEqual([composite.width, composite.height], [6, 2]);
  assert.deepEqual(composite.first, [255, 0, 0, 255]);
  assert.deepEqual(composite.last, [0, 255, 0, 255]);
  await groupedPage.screenshot({ path: path.join(outputDir, 'grouped-start.png'), fullPage: true });

  const singlePage = await preparePage();
  const yellow = await makePng(singlePage, 5, 3, '#ffff00');
  await singlePage.evaluate(async reference => {
    await window.__qaManager.openIndependentReferences({
      references: [reference],
      placement: 'separate',
      prompt: '한 장을 변환해 주세요.',
      startGeneration: true,
    });
  }, { dataUrl: yellow, name: 'single-yellow.png', referenceRole: 'INPUT_SOURCE' });
  const single = await singlePage.evaluate(() => window.__qaSends.map(send => ({ purpose: send.purpose, attachments: send.attachments })));
  assert.equal(single.length, 1, 'single reference still starts exactly one request');
  assert.equal(single[0].attachments.length, 1);
  const singleImage = await imageEvidence(singlePage, single[0].attachments[0].data);
  assert.deepEqual([singleImage.width, singleImage.height], [5, 3]);
  assert.deepEqual(singleImage.first, [255, 255, 0, 255]);
  await singlePage.screenshot({ path: path.join(outputDir, 'single-start.png'), fullPage: true });

  Object.assign(report, {
    groupedProviderRequestCount: grouped.length,
    groupedAttachmentRoles: ['INPUT_SOURCE', 'STYLE_REFERENCE'],
    composite,
    singleProviderRequestCount: single.length,
    singleImage,
  });
  await writeFile(path.join(outputDir, 'manual-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await browser.close();
}
