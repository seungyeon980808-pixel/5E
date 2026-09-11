import { TestElement } from './ai-panel-dom-elements.mjs';
import { TestDocument, TestImage } from './ai-panel-dom-document.mjs';
import { createDesktop, createIndexedDb, MemoryStorage } from './ai-panel-services-fixture.mjs';

function appendControl(document, panel, tagName, dataAttribute, properties = {}) {
  const element = document.createElement(tagName);
  if (dataAttribute) element.setAttribute(dataAttribute, '');
  Object.assign(element, properties);
  panel.append(element);
  return element;
}

function createPanel(document) {
  const panel = document.createElement('section');
  panel.id = 'ai-image-panel';
  panel.dataset.aiWorkbenchReady = 'true';
  panel.hidden = true;
  document.body.append(panel);

  appendControl(document, panel, 'div', null, { className: 'modal-ai' });
  appendControl(document, panel, 'p', 'data-ai-status');
  appendControl(document, panel, 'div', 'data-ai-log');
  appendControl(document, panel, 'textarea', 'data-ai-input');
  appendControl(document, panel, 'input', null, { type: 'file', files: [] });
  appendControl(document, panel, 'div', 'data-ai-previews');
  appendControl(document, panel, 'div', 'data-ai-attachment-list');
  appendControl(document, panel, 'span', 'data-ai-reference-count');
  appendControl(document, panel, 'details', null, { className: 'ai-reference-section' });
  appendControl(document, panel, 'div', 'data-ai-generating');
  appendControl(document, panel, 'span', 'data-ai-progress-title');
  appendControl(document, panel, 'span', 'data-ai-progress-detail');
  appendControl(document, panel, 'span', 'data-ai-progress-stage');
  appendControl(document, panel, 'span', 'data-ai-e-count');
  appendControl(document, panel, 'button', 'data-ai-send');
  appendControl(document, panel, 'button', 'data-ai-chat-send');
  appendControl(document, panel, 'button', 'data-ai-new');
  appendControl(document, panel, 'button', 'data-ai-compare');
  appendControl(document, panel, 'button', 'data-ai-capture');
  appendControl(document, panel, 'button', 'data-ai-reference-search');
  appendControl(document, panel, 'button', 'data-ai-login');
  appendControl(document, panel, 'select', 'data-ai-model', { value: 'gpt-5.6-sol' });
  appendControl(document, panel, 'span', 'data-ai-model-warning');
  appendControl(document, panel, 'select', 'data-ai-effort', { value: 'medium' });
  appendControl(document, panel, 'select', 'data-ai-speed', { value: 'priority' });
  appendControl(document, panel, 'span', 'data-ai-account');
  appendControl(document, panel, 'span', 'data-ai-limit');
  appendControl(document, panel, 'span', 'data-ai-account-tokens');
  appendControl(document, panel, 'p', 'data-ai-white-png-note');
  const outputProcessing = appendControl(document, panel, 'section', 'data-ai-output-processing');
  for (const value of ['preserve', 'connected', 'all-near-white', 'checkerboard']) {
    const button = appendControl(document, outputProcessing, 'button', 'data-ai-background-policy');
    button.dataset.aiBackgroundPolicy = value;
  }
  for (const value of ['false', 'true']) {
    const button = appendControl(document, outputProcessing, 'button', 'data-ai-exam-palette');
    button.dataset.aiExamPalette = value;
  }
  appendControl(document, outputProcessing, 'p', 'data-ai-output-processing-status');
  appendControl(document, panel, 'div', 'data-ai-tab-list');
  appendControl(document, panel, 'button', 'data-ai-interrupt');
  appendControl(document, panel, 'button', 'data-ai-close');
  appendControl(document, panel, 'button', 'data-ai-save-selected');
  appendControl(document, panel, 'button', 'data-ai-insert-selected');
  appendControl(document, panel, 'select', 'data-ai-candidate-select');
  return panel;
}

function saveGlobals(keys) {
  return new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
}

function restoreGlobals(saved) {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

export function installAiPanelBrowserFixture({ workspace } = {}) {
  const document = new TestDocument();
  const desktop = createDesktop();
  const storage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const indexedDB = createIndexedDb(workspace);
  const windowListeners = new Map();
  const requestAnimationFrame = callback => {
    const handle = { cancelled: false };
    queueMicrotask(() => { if (!handle.cancelled) callback(performance.now()); });
    return handle;
  };
  const cancelAnimationFrame = handle => { if (handle) handle.cancelled = true; };
  const window = {
    fiveEDesktop: desktop.api,
    document,
    localStorage: storage,
    sessionStorage,
    requestAnimationFrame,
    cancelAnimationFrame,
    alert() {},
    confirm: () => true,
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event.type) || []) listener(event);
      return !event.defaultPrevented;
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter(candidate => candidate !== listener));
    },
  };
  document.defaultView = window;
  const panel = createPanel(document);
  const globals = ['document', 'window', 'localStorage', 'sessionStorage', 'indexedDB', 'Image', 'Option', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = saveGlobals(globals);
  const Image = class extends TestImage { constructor() { super(document); } };
  const Option = class extends TestElement {
    constructor(text = '', value = '') {
      super('option', document);
      this.value = value;
      this.textContent = text;
    }
  };
  Object.assign(globalThis, { document, window, localStorage: storage, sessionStorage, indexedDB, Image, Option, requestAnimationFrame, cancelAnimationFrame });
  return {
    document,
    panel,
    desktop,
    storage,
    restore() { restoreGlobals(saved); },
  };
}
