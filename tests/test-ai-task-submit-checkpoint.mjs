import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel } from '../js/ai-panel.js';
import { recoverTaskWorkspaceSnapshot } from '../js/ai-task-workspaces.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function appState() {
  return { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { width: 100, height: 100 } };
}

function hasInFlightRequest(snapshot) {
  return snapshot.tabs?.some(tab => tab.workState === 'busy' && tab.inFlightRequest?.snapshot);
}

test('provider send waits until the exact busy retry snapshot is durably stored', async () => {
  const checkpoint = deferred();
  const checkpointReached = deferred();
  let durableSnapshot;
  const browser = installAiPanelBrowserFixture({
    indexedDbOptions: {
      beforePut(snapshot) {
        if (!hasInFlightRequest(snapshot)) return;
        durableSnapshot = snapshot;
        checkpointReached.resolve();
        return checkpoint.promise;
      },
    },
  });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.panel.querySelector('[data-ai-chat-input]').value = '이 그림의 연결을 설명해 줘';
    browser.panel.querySelector('[data-ai-chat-send]').click();
    await checkpointReached.promise;

    assert.equal(browser.desktop.sends.length, 0, 'provider work must wait for the durable checkpoint');
    const persistedTab = durableSnapshot.tabs.find(tab => tab.id === durableSnapshot.activeTaskTabId);
    assert.equal(persistedTab.workState, 'busy');
    assert.equal(persistedTab.inFlightRequest.type, 'chat');
    assert.equal(persistedTab.inFlightRequest.snapshot.entered, '이 그림의 연결을 설명해 줘');
    const recoveredTab = recoverTaskWorkspaceSnapshot(durableSnapshot).tabs.find(tab => tab.id === durableSnapshot.activeTaskTabId);
    assert.equal(recoveredTab.workState, 'interrupted');
    assert.equal(recoveredTab.retryRequest.snapshot.entered, '이 그림의 연결을 설명해 줘');

    checkpoint.resolve();
    const sent = await browser.desktop.waitForSend(0);
    assert.equal(sent.payload.purpose, 'chat');
    browser.desktop.emit({ method: 'turn/completed', params: { turn: { id: sent.turnId, status: 'completed' } } });
    await Promise.resolve();
  } finally {
    checkpoint.resolve();
    manager?.close();
    browser.restore();
  }
});

test('a failed required checkpoint leaves the provider untouched and exits busy state', async () => {
  let checkpointAttempts = 0;
  const browser = installAiPanelBrowserFixture({
    indexedDbOptions: {
      beforePut(snapshot) {
        if (!hasInFlightRequest(snapshot)) return;
        checkpointAttempts += 1;
        throw new Error('storage unavailable');
      },
    },
  });
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.panel.querySelector('[data-ai-chat-input]').value = '설명해 줘';
    browser.panel.querySelector('[data-ai-chat-send]').click();
    await browser.document.waitForState(() => /임시저장 실패/.test(browser.panel.querySelector('[data-ai-status]').textContent));

    assert.equal(checkpointAttempts, 1);
    assert.equal(browser.desktop.sends.length, 0);
    assert.equal(browser.panel.dataset.aiBusy, 'false');
    assert.match(browser.panel.querySelector('[data-ai-status]').textContent, /AI 요청을 보내지 않았습니다/);
    assert.match(browser.panel.querySelector('[data-ai-log]').textContent, /작업 복구 정보를 저장하지 못해/);
  } finally {
    manager?.close();
    browser.restore();
  }
});
