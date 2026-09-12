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
    model: 'gpt-5.6-sol', displayName: 'Sol', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'],
  }] });
  browser.desktop.api.account = async () => ({});
}

function appendChatApply(browser) {
  const button = browser.document.createElement('button');
  button.dataset.aiChatApply = '';
  button.textContent = '수정 요청으로 가져오기';
  browser.panel.append(button);
  return button;
}

test('chat answers become an editable request only after explicit apply and do not generate by themselves', async () => {
  const browser = installAiPanelBrowserFixture();
  const apply = appendChatApply(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.panel.querySelector('[data-ai-chat-input]').value = '관계를 설명해 줘';
    browser.panel.querySelector('[data-ai-chat-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: { turnId: sent.turnId, item: { type: 'agentMessage', text: '왼쪽 관을 오른쪽 플라스크에 연결합니다.' } } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');

    assert.equal(browser.panel.querySelector('[data-ai-input]').value, '');
    assert.equal(browser.desktop.sends.length, 1);
    // Simulate the post-first-result edit surface, where the request field is visible.
    browser.panel.querySelector('[data-ai-input]').hidden = false;
    browser.panel.querySelector('[data-ai-input]').disabled = false;
    apply.click();
    assert.match(browser.panel.querySelector('[data-ai-input]').value, /왼쪽 관을 오른쪽 플라스크에 연결합니다/);
    assert.equal(browser.desktop.sends.length, 1, 'applying conversation must not start image generation');
    assert.match(browser.panel.querySelector('[data-ai-status]').textContent, /변환하기/);
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('an unexpected image event during a chat turn cannot create an image version', async () => {
  const browser = installAiPanelBrowserFixture();
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.panel.querySelector('[data-ai-chat-input]').value = '이 그림을 설명해 줘';
    browser.panel.querySelector('[data-ai-chat-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: { turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: testPng() } } });
    browser.desktop.emit({ method: 'item/completed', params: { turnId: sent.turnId, item: { type: 'agentMessage', text: '설명 답변입니다.' } } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');

    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 0);
    assert.equal(browser.panel.querySelector('[data-ai-status]').textContent, '답변 완료');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('cancel intent immediately rejects a late image from the cancelled turn', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: testPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.panel.querySelector('[data-ai-interrupt]').click();
    browser.desktop.emit({ method: 'item/completed', params: {
      item: { type: 'imageGeneration', imageDataUrl: testPng() },
    } });
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: testPng() },
    } });
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'interrupted' } } });
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');

    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 0);
    assert.equal(browser.panel.querySelector('[data-ai-status]').textContent, '작업 취소됨');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('cancel intent prevents an already-started local image decode from registering afterward', async () => {
  const browser = installAiPanelBrowserFixture();
  makeRuntimeReady(browser);
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open({ reference: { dataUrl: testPng(), name: '원본.png' } });
    browser.panel.querySelector('[data-ai-send]').click();
    const sent = await browser.desktop.waitForSend(0);
    browser.desktop.emit({ method: 'item/completed', params: {
      turnId: sent.turnId, item: { type: 'imageGeneration', imageDataUrl: testPng() },
    } });
    browser.panel.querySelector('[data-ai-interrupt]').click();
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'interrupted' } } });
    await browser.document.waitForState(() => browser.panel.dataset.aiBusy === 'false');
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(browser.panel.querySelectorAll('.ai-generated-card').length, 0);
    assert.equal(browser.panel.querySelector('[data-ai-status]').textContent, '작업 취소됨');
  } finally {
    manager?.close();
    browser.restore();
  }
});
