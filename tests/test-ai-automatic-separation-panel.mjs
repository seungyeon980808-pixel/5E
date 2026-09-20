import test from 'node:test';
import assert from 'node:assert/strict';

import {
  automaticSeparationCacheKey,
  candidateUsesAutomaticSeparation,
  initAiPanel,
  scopedPngData,
} from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

function appState() {
  return { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { w: 100, h: 100 } };
}

function threeObjectsPng() {
  const width = 30, height = 14;
  const pixels = new Uint8Array(width * height * 4).fill(255);
  for (const [left, top] of [[2, 2], [13, 3], [24, 7]]) {
    for (let y = top; y < top + 3; y++) for (let x = left; x < left + 3; x++) {
      pixels.set([20, 30, 40, 255], (y * width + x) * 4);
    }
  }
  return scopedPngData(encodeTestRgbaPng({ width, height, data: pixels }));
}

function blankPng() {
  return scopedPngData(encodeTestRgbaPng({ width: 12, height: 8, data: new Uint8Array(12 * 8 * 4).fill(255) }));
}

function makeRuntimeReady(browser) {
  browser.desktop.api.status = async () => ({ login: { loggedIn: true }, server: true });
  browser.desktop.api.models = async () => ({ data: [{
    model: 'gpt-5.6-sol', displayName: 'Sol', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'],
  }] });
  browser.desktop.api.account = async () => ({});
}

test('a normal final raster automatically prepares its separated components without changing the generated result', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: threeObjectsPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: threeObjectsPng() },
    } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await browser.document.waitForState(() => browser.panel.querySelector('[data-ai-editable-groups]')?.dataset.aiSeparationState === 'ready');

    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 1);
    assert.equal(browser.panel.querySelector('[data-ai-editable-groups]').textContent, '분리 결과 확인');
    assert.equal(browser.panel.querySelector('[data-ai-editable-groups]').dataset.aiSeparatedCount, '3');

  } finally {
    manager?.close();
    browser.restore();
  }
});

test('the derived cache identity binds the effective PNG bytes and processing options', async () => {
  const source = threeObjectsPng();
  const same = await automaticSeparationCacheKey(source, { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 });
  assert.equal(await automaticSeparationCacheKey(source, { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 }), same);
  assert.notEqual(await automaticSeparationCacheKey(source, { backgroundPolicy: 'connected', examPalette: false, lineThickness: 0 }), same);
  assert.notEqual(await automaticSeparationCacheKey(
    source,
    { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    { layout: 'grid', maxAssets: 128, maxDurationMs: 8_000 },
  ), same);

  const mutationIndex = source.indexOf(',') + 12;
  const changed = source.slice(0, mutationIndex) + (source[mutationIndex] === 'A' ? 'B' : 'A') + source.slice(mutationIndex + 1);
  assert.notEqual(await automaticSeparationCacheKey(changed, { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 }), same);
  assert.equal(candidateUsesAutomaticSeparation({ kind: 'generated', data: source }), true);
  assert.equal(candidateUsesAutomaticSeparation({ kind: 'generated', data: source, sceneResult: { objects: [{}] } }), false);
});

test('an existing generated image can switch to manual object separation inside the AI panel', async () => {
  const generated = { id: 'generated-1', name: 'generated-1', data: threeObjectsPng(), kind: 'generated', generationMode: 'single',
    reviewState: 'needs-attention', reviewReport: { verdict: 'uncertain', checks: [], issues: [] } };
  const workspace = {
    key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 1, imageSerial: 1,
    tabs: [{
      id: 'task-1', title: '기존 생성 이미지', workState: 'completed', attachments: [], generated: [generated],
      selectedCandidateId: 'generated-1', conversationMessages: [], uiMessages: [], input: '', conversationId: null,
      mode: 'diagram', qualityMode: 'standard', outputEngine: 'raster', generationMode: 'single',
      outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    }],
  };
  const browser = installAiPanelBrowserFixture({ workspace });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    const select = browser.panel.querySelector('[data-ai-separation-mode]');
    select.value = 'manual';
    select.dispatchEvent(new Event('change', { bubbles:true }));
    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    assert.equal(groups.dataset.aiSeparationState, 'manual');
    assert.equal(groups.textContent, '영역을 직접 지정해서 분리');
    assert.equal(browser.storage.getItem('5e.aiSeparationMode'), 'manual');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('changing output processing invalidates the ready preparation and recomputes from the effective PNG', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: threeObjectsPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: threeObjectsPng() },
    } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'ready');
    const firstKey = groups.dataset.aiSeparationKey;

    const background = browser.panel.querySelector('[data-ai-background-policy]');
    background.value = 'connected';
    background.dispatchEvent(new Event('change'));
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'ready'
      && groups.dataset.aiSeparationKey && groups.dataset.aiSeparationKey !== firstKey);

    assert.match(groups.dataset.aiSeparationKey, /:connected:color:line-0:/);
    assert.equal(groups.dataset.aiSeparatedCount, '3');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('a restored candidate recomputes automatic preparation because derived crops are not required workspace fields', async () => {
  const workspace = {
    key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 1, imageSerial: 1,
    tabs: [{
      id: 'task-1', title: '복원 작업', workState: 'completed', attachments: [],
      generated: [{ id: 'generated-1', name: '생성 결과 1', data: threeObjectsPng(), kind: 'generated',
        generationMode: 'single', reviewState: 'needs-attention', reviewReport: { verdict: 'uncertain', checks: [], issues: [] } }],
      selectedCandidateId: 'generated-1', conversationMessages: [], uiMessages: [], input: '', conversationId: null,
      mode: 'diagram', qualityMode: 'standard', outputEngine: 'raster', generationMode: 'single',
      outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    }],
  };
  const browser = installAiPanelBrowserFixture({ workspace });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'ready');
    assert.equal(groups.dataset.aiSeparatedCount, '3');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('an identical effective PNG in another candidate reuses the bounded derived cache', async () => {
  const generated = id => ({ id, name: id, data: threeObjectsPng(), kind: 'generated', generationMode: 'single',
    reviewState: 'needs-attention', reviewReport: { verdict: 'uncertain', checks: [], issues: [] } });
  const workspace = {
    key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 1, imageSerial: 2,
    tabs: [{
      id: 'task-1', title: '캐시 작업', workState: 'completed', attachments: [],
      generated: [generated('generated-1'), generated('generated-2')], selectedCandidateId: 'generated-1',
      conversationMessages: [], uiMessages: [], input: '', conversationId: null, mode: 'diagram',
      qualityMode: 'standard', outputEngine: 'raster', generationMode: 'single',
      outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    }],
  };
  const browser = installAiPanelBrowserFixture({ workspace });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'ready');
    assert.equal(groups.dataset.aiSeparationCacheHit, 'false');

    browser.panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: 'generated-2' } }));
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'ready'
      && groups.dataset.aiSeparationCacheHit === 'true');
    assert.equal(groups.dataset.aiSeparatedCount, '3');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('closing the panel aborts a pending hash and cannot publish late automatic preparation', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let releaseDigest;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    subtle: { digest: () => new Promise(resolve => { releaseDigest = resolve; }) },
  } });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: threeObjectsPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: threeObjectsPng() },
    } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await browser.document.waitForState(() => typeof releaseDigest === 'function');
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');
    manager.close();
    releaseDigest(new Uint8Array(32).buffer);
    await new Promise(resolve => setTimeout(resolve, 0));

    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    assert.equal(groups.dataset.aiSeparationState, 'idle');
    assert.equal(groups.dataset.aiSeparatedCount, '');
  } finally {
    releaseDigest?.(new Uint8Array(32).buffer);
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else delete globalThis.crypto;
    manager?.close();
    browser.restore();
  }
});

test('automatic analysis failure keeps the completed raster and offers the manual correction path', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: threeObjectsPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: blankPng() },
    } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    const groups = browser.panel.querySelector('[data-ai-editable-groups]');
    await browser.document.waitForState(() => groups.dataset.aiSeparationState === 'fallback');

    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 1);
    assert.equal(groups.textContent, '영역을 직접 지정해서 분리');
    assert.equal(groups.disabled, false);
  } finally {
    manager?.close();
    browser.restore();
  }
});
