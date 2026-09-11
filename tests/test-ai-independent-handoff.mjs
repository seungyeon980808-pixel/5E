import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskWorkspaces } from '../js/ai-task-workspaces.js';

class Element {
  constructor(kind = 'panel', text = '') {
    this.kind = kind;
    this.textContent = text;
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.classList = { toggle() {} };
  }
  cloneNode() {
    const clone = new Element(this.kind, this.textContent);
    clone.dataset = { ...this.dataset };
    clone.attributes = { ...this.attributes };
    clone.children = this.children.map(child => child.cloneNode());
    clone.parentElement = this.parentElement;
    return clone;
  }
  querySelector() { return this.children[0]; }
  querySelectorAll() { return []; }
  replaceChildren() { this.children = []; }
  append(...children) {
    for (const child of children) child.parentElement = this;
    this.children.push(...children);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
}

function createHarness({ holdDispatches = false } = {}) {
  const panel = new Element();
  panel.append(new Element('list'));
  panel.parentElement = new Element();
  const storage = new Map();
  const dispatches = [];
  const releaseDispatches = [];
  globalThis.document = { getElementById: () => panel };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.window = { alert() {} };
  const manager = createTaskWorkspaces(
    { get: () => ({ objects: [], selectedIds: [] }) },
    (_, options) => {
      const taskId = `${options.clientScope}:task`;
      const tab = new Element('button', taskId);
      tab.append(new Element('span', taskId));
      tab.setAttribute('aria-selected', 'true');
      options.navigationChanged([tab]);
      return {
        ready: Promise.resolve(),
        ownsTask: id => id === taskId,
        activeTask: () => taskId,
        selectTask() {},
        close() {},
        open(openOptions) {
          dispatches.push({ clientScope: options.clientScope, openOptions });
          if (!holdDispatches) return Promise.resolve();
          return new Promise(resolve => releaseDispatches.push(resolve));
        },
      };
    },
    () => {},
  );
  return { manager, dispatches, releaseDispatches };
}

const dataUrls = [
  'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMSAxIi8+',
  'data:image/jpeg;base64,/9j/AA==',
  ...Array.from({ length: 8 }, (_, index) => `data:image/png;base64,iVBORw0KGgo${index}`),
];

test('ten mixed library snapshots dispatch concurrently as isolated one-reference AI tasks', async () => {
  const { manager, dispatches, releaseDispatches } = createHarness({ holdDispatches: true });
  const references = dataUrls.map((dataUrl, index) => ({
    dataUrl,
    name: `source-${index + 1}`,
    sourceKind: index === 0 ? 'parts-library' : 'unified-library',
    source: { documentId: 'physics-2026', pageNumber: index + 1 },
  }));

  const handoff = manager.openIndependentReferences({
    references,
    prompt: '각 그림을 독립적으로 변환',
    startGeneration: true,
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(dispatches.length, 10, 'all ten generation dispatches must start without awaiting earlier completions');
  assert.equal(new Set(dispatches.map(item => item.clientScope)).size, 10);
  for (const [index, dispatch] of dispatches.entries()) {
    assert.equal(dispatch.openOptions.references.length, 1);
    assert.equal(dispatch.openOptions.references[0].dataUrl, dataUrls[index]);
    assert.equal(dispatch.openOptions.references[0].sourceKind, references[index].sourceKind);
    assert.equal(dispatch.openOptions.startGeneration, true);
  }

  references[0].source.pageNumber = 999;
  assert.equal(dispatches[0].openOptions.references[0].source.pageNumber, 1, 'source provenance must be snapshotted');
  releaseDispatches.forEach(resolve => resolve());
  const result = await handoff;
  assert.equal(result.length, 10);
});

test('invalid independent handoffs fail atomically before creating workspaces', async () => {
  const { manager, dispatches } = createHarness();
  await assert.rejects(
    manager.openIndependentReferences({ references: Array.from({ length: 11 }, () => ({ dataUrl: dataUrls[1] })) }),
    /최대 10개/,
  );
  assert.equal(dispatches.length, 0);
});
