import assert from 'node:assert/strict';
import test from 'node:test';

import { createUnifiedAiSourceConsumer, initAiPanel } from '../js/ai-panel.js';
import { createAiReferenceSearch } from '../js/ai-reference-search.js';
import { openPdfReferencePicker, registerPdfReferencePicker } from '../js/pdf-library/reference-picker.js';
import { TestDocument } from './helpers/ai-panel-dom-document.mjs';
import { TestElement } from './helpers/ai-panel-dom-elements.mjs';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';

class ReferenceSearchOverlay extends TestElement {
  set innerHTML(markup) {
    this._innerHTML = markup;
    const control = (tagName, attribute, value = '') => {
      const element = this.ownerDocument.createElement(tagName);
      element.setAttribute(attribute, value);
      this.append(element);
      return element;
    };
    control('button', 'data-ai-search-close');
    for (const source of ['parts', 'exam', 'local']) control('button', 'data-ai-search-source', source);
    const input = this.ownerDocument.createElement('input');
    input.type = 'search';
    this.append(input);
    const localFolder = control('div', 'data-ai-local-folder');
    localFolder.append(this.ownerDocument.createElement('span'));
    control('button', 'data-ai-local-pick');
    control('button', 'data-ai-local-refresh');
    control('div', 'data-ai-search-summary');
    control('div', 'data-ai-search-grid');
    control('button', 'data-ai-search-add');
  }
}

class ReferenceSearchDocument extends TestDocument {
  constructor() {
    super();
    this.nextDivIsOverlay = true;
  }

  createElement(tagName) {
    if (String(tagName).toLowerCase() === 'div' && this.nextDivIsOverlay) {
      this.nextDivIsOverlay = false;
      return new ReferenceSearchOverlay(tagName, this);
    }
    return super.createElement(tagName);
  }
}

function installReferenceSearchDocument() {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const document = new ReferenceSearchDocument();
  globalThis.document = document;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [] }) });
  return {
    document,
    restore() {
      globalThis.document = previousDocument;
      globalThis.fetch = previousFetch;
    },
  };
}

function appState() {
  return { objects: [], selectedIds: [], activePageId: 'page-1', activeLayerId: 'layer-1', artboard: { width: 100, height: 100 } };
}

test('Given the AI library entry, when unified selection completes, then it opens once with only the AI consumer', async () => {
  const calls = [];
  const added = [];
  const statuses = [];
  const unregister = registerPdfReferencePicker(async options => {
    calls.push(options);
    options.onAdd({ name: 'cropped', data: 'data:image/png;base64,EXACT', sourceKind: 'pdf-library', source: { rect: [0, 0, 1, 1] } });
    options.onStatus('selected', 'ok');
  });
  const consumer = createUnifiedAiSourceConsumer({
    addReferencesAsTasks: references => added.push(references),
    setStatus: (...args) => statuses.push(args),
  });

  await openPdfReferencePicker(consumer);
  unregister();

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['onAdd', 'onAddMany', 'onStatus']);
  assert.deepEqual(added, [[{ name: 'cropped', data: 'data:image/png;base64,EXACT', sourceKind: 'pdf-library', source: { rect: [0, 0, 1, 1] } }]]);
  assert.deepEqual(statuses, [['selected', 'ok']]);
});

 test('multiple cropped references retain order and the selected workspace placement', () => {
 const calls = [];
 const consumer = createUnifiedAiSourceConsumer({ addReferencesAsTasks: (...args) => calls.push(args), setStatus() {} });
 const references = [{ name: 'first', data: 'a' }, { name: 'second', data: 'b' }];
 consumer.onAddMany(references, { placement: 'together' });
 assert.deepEqual(calls, [[references, { placement: 'together' }]]);
 });

test('Given the AI reference search EXAM action, when the PDF picker returns an advanced assignment, then the AI consumer receives its ordered batch and groups', async () => {
  const browser = installReferenceSearchDocument();
  const calls = [];
  const references = [{ name: 'first PDF crop', data: 'first' }, { name: 'second PDF crop', data: 'second' }];
  const assignment = { placement: 'advanced', groups: [[1], [0]] };
  const consumer = createUnifiedAiSourceConsumer({
    addReferencesAsTasks: (...args) => calls.push(args),
    setStatus() {},
  });
  const unregister = registerPdfReferencePicker(async options => options.onAddMany(references, assignment));

  try {
    const search = createAiReferenceSearch(consumer);
    await search.open();

    browser.document.querySelector('[data-ai-search-source="exam"]').click();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(calls, [[references, assignment]]);
  } finally {
    unregister();
    browser.restore();
  }
});

test('Given the AI library entry, when the picker returns advanced PDF groups, then each workbench keeps its assigned reference order', async () => {
  const browser = installAiPanelBrowserFixture();
  const references = [{ name: 'first', data: 'first' }, { name: 'second', data: 'second' }, { name: 'third', data: 'third' }];
  const unregister = registerPdfReferencePicker(async options => options.onAddMany(references, {
    placement: 'advanced', groups: [[1, 0], [2]],
  }));
  let manager;

  try {
    manager = initAiPanel({ get: appState });
    await manager.ready;
    await manager.open();
    browser.panel.querySelector('[data-ai-reference-search]').click();
    await browser.document.waitForState(() => browser.panel.querySelectorAll('.ai-task-tab').length === 2);

    const tabs = browser.panel.querySelectorAll('.ai-task-tab');
    tabs[0].click();
    assert.deepEqual(browser.panel.querySelectorAll('.ai-reference-card').map(card => card.querySelector('strong').textContent), ['second', 'first']);
    tabs[1].click();
    assert.deepEqual(browser.panel.querySelectorAll('.ai-reference-card').map(card => card.querySelector('strong').textContent), ['third']);
  } finally {
    unregister();
    manager?.close();
    browser.restore();
  }
});
