import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel } from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(onResolve => { resolve = onResolve; });
  return { promise, resolve };
}

function workspace() {
  const tab = (id, title) => ({
    id, title, workState: 'idle', attachments: [], generated: [], selectedCandidateId: null,
    conversationMessages: [], uiMessages: [], input: '', conversationId: null,
    mode: 'diagram', qualityMode: 'simple', outputEngine: 'raster', generationMode: 'single',
  });
  return { key: 'workspace', activeTaskTabId: 'task-1', taskTabSerial: 2, imageSerial: 0, tabs: [tab('task-1', '첫 작업'), tab('task-2', '둘째 작업')] };
}

function appState() {
  return { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { width: 100, height: 100 } };
}

function pasteEvent() {
  return {
    type: 'paste', target: {}, clipboardData: { types: [], items: [], getData: () => '' },
    prevented: false, preventDefault() { this.prevented = true; },
    stopImmediatePropagation() {},
  };
}

test('a delayed native clipboard read cannot attach to a task selected after paste began', async () => {
  const browser = installAiPanelBrowserFixture({ workspace: workspace() });
  const clipboard = deferred();
  browser.desktop.api.readClipboardImage = () => clipboard.promise;
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    const event = pasteEvent();
    browser.document.dispatchEvent(event);
    assert.equal(event.prevented, true);
    browser.panel.querySelectorAll('.ai-task-tab')[1].click();
    clipboard.resolve('data:image/png;base64,UE5H');
    await browser.document.waitForState(() => /작업이나 원본이 변경/.test(browser.panel.querySelector('[data-ai-status]').textContent));

    assert.equal(browser.panel.querySelectorAll('.ai-reference-card').length, 0);
    browser.panel.querySelectorAll('.ai-task-tab')[0].click();
    assert.equal(browser.panel.querySelectorAll('.ai-reference-card').length, 0);
  } finally {
    clipboard.resolve(null);
    manager?.close();
    browser.restore();
  }
});

test('deleting the captured task during a delayed clipboard read never recreates it', async () => {
  const browser = installAiPanelBrowserFixture({ workspace: workspace() });
  const clipboard = deferred();
  browser.desktop.api.readClipboardImage = () => clipboard.promise;
  let manager;
  try {
    manager = initAiPanel({ get: appState });
    await manager.open();
    browser.document.dispatchEvent(pasteEvent());
    const dialogAdded = browser.document.waitForAdded(node => node.localName === 'dialog');
    browser.panel.querySelector('.ai-task-tab.is-on .ai-task-delete').click();
    const dialog = await dialogAdded;
    dialog.querySelector('.ai-confirm-accept').click();
    await browser.document.waitForState(() => browser.panel.querySelectorAll('.ai-task-tab').length === 1);
    clipboard.resolve('data:image/png;base64,UE5H');
    await browser.document.waitForState(() => /작업이나 원본이 변경/.test(browser.panel.querySelector('[data-ai-status]').textContent));

    assert.equal(browser.panel.querySelectorAll('.ai-task-tab').length, 1);
    assert.equal(browser.panel.querySelector('.ai-task-tab').dataset.tabId, 'task-2');
    assert.equal(browser.panel.querySelectorAll('.ai-reference-card').length, 0);
  } finally {
    clipboard.resolve(null);
    manager?.close();
    browser.restore();
  }
});
