import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel, scopedPngData } from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

function appState() {
  return { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { width: 100, height: 100 } };
}

function testPng() {
  const pixels = new Uint8Array(3 * 3 * 4).fill(255);
  pixels.set([0, 0, 0, 255], 16);
  return scopedPngData(encodeTestRgbaPng({ width: 3, height: 3, data: pixels }));
}

function makeRuntimeReady(browser) {
  browser.desktop.api.status = async () => ({ login: { loggedIn: true }, server: true });
  browser.desktop.api.models = async () => ({ data: [{
    model: 'gpt-5.6-sol',
    displayName: 'Sol',
    supportedReasoningEfforts: ['medium', 'high'],
    serviceTiers: ['priority'],
  }] });
  browser.desktop.api.account = async () => ({});
}

test('events racing runtime acknowledgement are replayed only for the accepted image turn', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let acknowledge;
  let sentPayload;
  const accepted = new Promise(resolve => { acknowledge = resolve; });
  const sendCalled = new Promise(resolve => {
    browser.desktop.api.send = async payload => {
      sentPayload = payload;
      resolve();
      return accepted;
    };
  });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: testPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    await sendCalled;
    assert.equal(sentPayload.purpose, 'image');
    assert.equal(browser.panel.querySelector('[data-ai-elapsed]').textContent, '수락 대기');

    browser.desktop.emit({ method: 'item/started', params: { turnId: 'old-turn', item: { type: 'imageGeneration' } } });
    browser.desktop.emit({ method: 'item/started', params: { turnId: 'accepted-turn', item: { type: 'imageGeneration' } } });
    browser.desktop.emit({ method: 'item/completed', params: { turnId: 'accepted-turn', item: { type: 'imageGeneration', imageDataUrl: testPng() } } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: 'accepted-turn', status: 'completed' } } });
    acknowledge({ turnId: 'accepted-turn', renderThreadId: 'accepted-render' });

    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');
    assert.equal(browser.panel.querySelector('[data-ai-elapsed]').textContent, '00:00');
    assert.equal(browser.panel.querySelector('[data-ai-progress-stage]').textContent, '이미지 준비 완료');
    assert.equal(browser.panel.querySelector('[data-ai-generating]').hidden, true);
    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 1);
    assert.equal(browser.panel.querySelector('.ai-task-tab-time').textContent, '00:00');
  } finally {
    acknowledge?.({ turnId: 'accepted-turn', renderThreadId: 'accepted-render' });
    manager?.close();
    browser.restore();
  }
});

test('a valid chat-only terminal remains a neutral answer without image timing', async () => {
  const browser = installAiPanelBrowserFixture();
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.panel.querySelector('[data-ai-chat-input]').value = '관계를 설명해 줘';
    browser.panel.querySelector('[data-ai-chat-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: { turnId: sent.turnId, item: { type: 'agentMessage', text: '두 요소가 연결되어 있습니다.' } } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');

    assert.equal(browser.panel.querySelector('[data-ai-status]').textContent, '답변 완료');
    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 0);
    assert.equal(browser.panel.querySelector('[data-ai-generating]').hidden, true);
    assert.notEqual(browser.panel.querySelector('[data-ai-progress-stage]').textContent, '이미지 생성 실패 · 결과 없음');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('a persisted running image clock restores as frozen interrupted time without resending', async () => {
  const workspace = {
    key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 1, imageSerial: 0,
    tabs: [{
      id: 'task-1', title: '중단 작업', workState: 'busy', attachments: [], generated: [], selectedCandidateId: null,
      conversationMessages: [], uiMessages: [], input: '', conversationId: null,
      mode: 'diagram', qualityMode: 'simple', outputEngine: 'raster', generationMode: 'single',
      generationTiming: {
        version: 1, turnId: 'persisted-turn', startedAtMs: 1_000, lastElapsedMs: 42_000,
        endedAtMs: null, phase: 'image-generating', outcome: null, imageReceived: false,
        postprocessPending: false, terminalOutcome: null,
      },
      inFlightRequest: { type: 'image', snapshot: null },
    }],
  };
  const browser = installAiPanelBrowserFixture({ workspace });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    assert.equal(browser.desktop.sends.length, 0);
    assert.equal(browser.panel.querySelector('[data-ai-elapsed]').textContent, '00:42');
    assert.equal(browser.panel.querySelector('[data-ai-progress-stage]').textContent, '작업 중단');
    assert.equal(browser.panel.querySelector('[data-ai-generating]').hidden, false);
    assert.match(browser.panel.querySelector('[data-ai-status]').textContent, /자동 재전송하지 않았습니다/);
  } finally {
    manager?.close();
    browser.restore();
  }
});
