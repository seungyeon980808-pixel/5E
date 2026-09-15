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
        { dataUrl: makePng(92, 40, '#a04a32'), name: '넓고-낮은-원본.png', referenceRole: 'INPUT_SOURCE' },
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
  await page.evaluate(index => window.__qaCompleteImage(index, null, 'failed'), idx);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  await page.evaluate(async () => window.__qaManager.openIndependentReferences({references:[
    {dataUrl:window.__qaOutput[0],name:'작업대2.png'},
    {dataUrl:window.__qaOutput[1],name:'작업대3.png'}
  ]}));
  const count = await panel.locator('.ai-task-tab').count();
  assert.equal(count,3,'three independent workspace tasks visible');
  await panel.locator('[data-ai-tab-clear]').click();
  await page.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await panel.locator('.ai-task-tab').count(),3);
  await panel.locator('[data-ai-tab-clear]').click();
  await page.getByRole('button', {name:'3개 지우기',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.ai-task-tab').length === 0);
  assert.equal(await page.locator('.ai-reference-card').count(), 0);
  assert.equal(await page.locator('.ai-generated-card').count(), 0);
  assert.equal(await panel.getAttribute('data-ai-selected-candidate-id'), '');
  assert.equal((await page.evaluate(() => window.__qaManager.checkpointForClose())).hasWork,false);
  await page.screenshot({path:path.join(outputDir,'cleared.png')});
  await page.evaluate(async () => window.__qaManager.open({references:[{dataUrl:window.__qaOutput[0],name:'다시 추가.png',referenceRole:'INPUT_SOURCE'}],startGeneration:false}));
  await page.locator('.ai-task-delete:visible').click();
  await page.getByRole('button',{name:'작업 삭제',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.ai-task-tab').length === 0);
  assert.equal(await page.locator('.ai-reference-card').count(),0);
  await page.evaluate(() => window.__qaManager.checkpointForClose());
  const savedState = await page.evaluate(() => window.__qaState);
  await page.reload({waitUntil:'networkidle'});
  await page.evaluate(async state => {
    const {initAiPanel} = await import('/js/ai-panel.js');
    window.__qaManager = initAiPanel({get:()=>state,update:mutate=>mutate(state)});
    await window.__qaManager.ready;
    await window.__qaManager.open();
  },savedState);
  assert.equal(await page.locator('.ai-task-tab').count(),0,'reload must not resurrect deleted work');
  await writeFile(path.join(outputDir,'report.json'),JSON.stringify({threeWorkspacesCleared:true,reloadStaysEmpty:true,cancelPreservedAll:true,failedTaskCleared:true,previewCleared:true,finalDeleteCleared:true,paidProviderCalls:0},null,2));
  console.log('PASS: failed task, empty preview, final individual deletion');
} finally { await browser.close(); }
