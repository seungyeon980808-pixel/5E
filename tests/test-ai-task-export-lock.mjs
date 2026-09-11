import test from 'node:test';
import assert from 'node:assert/strict';

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

const scope = '11111111-1111-1111-1111-111111111111';
const png = value => `data:image/png;base64,${Buffer.from(value).toString('base64')}`;

test('workspace manager rejects an overlapping browser-folder export until the active write completes', async () => {
  const panel = new Element();
  panel.append(new Element('list'));
  panel.parentElement = new Element();
  const storage = new Map([['5e.aiParallelWorkspaces.v1', JSON.stringify([scope])]]);
  const stored = new Map();
  let pickerCalls = 0;
  let releaseExistenceCheck;
  let firstExistenceCheckReached;
  const existenceCheckReached = new Promise(resolve => { firstExistenceCheckReached = resolve; });
  const existenceCheckRelease = new Promise(resolve => { releaseExistenceCheck = resolve; });
  const directory = {
    async queryPermission() { return 'granted'; },
    async getFileHandle(name, options = {}) {
      if (!options.create && !stored.has(name)) {
        firstExistenceCheckReached();
        await existenceCheckRelease;
        throw new DOMException('missing', 'NotFoundError');
      }
      if (!stored.has(name)) stored.set(name, null);
      return {
        async createWritable() {
          return {
            async write(blob) { stored.set(name, new Uint8Array(await blob.arrayBuffer())); },
            async close() {},
          };
        },
      };
    },
  };

  globalThis.document = { getElementById: () => panel };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.window = {
    alert() {},
    confirm: () => true,
    async showDirectoryPicker() { pickerCalls += 1; return directory; },
  };
  const { createTaskWorkspaces } = await import('../js/ai-task-workspaces.js');

  const controllers = [];
  const manager = createTaskWorkspaces(
    { get: () => ({ objects: [], selectedIds: [] }) },
    (_, options) => {
      const taskId = `${options.clientScope}:task`;
      const tab = new Element('button', taskId);
      tab.append(new Element('span', taskId));
      tab.setAttribute('aria-selected', 'true');
      options.navigationChanged([tab]);
      const controller = {
        ready: Promise.resolve(),
        ownsTask: id => id === taskId,
        activeTask: () => taskId,
        selectTask() {},
        close() {},
        open() {},
        exportCount: () => 1,
        exportResults: async () => [{ sourceName: 'same', dataUrl: png(options.clientScope || 'first') }],
        options,
      };
      controllers.push(controller);
      return controller;
    },
    () => {},
  );
  await manager.open();

  const first = controllers[0].options.exportCollection('selected');
  await existenceCheckReached;
  const second = controllers[1].options.exportCollection('selected');
  await assert.rejects(second, /다른 작업 결과를 저장 중/);
  assert.equal(pickerCalls, 1, 'the rejected request must not open a second directory picker');

  releaseExistenceCheck();
  const result = await first;
  assert.equal(result.status, 'stored');
  assert.deepEqual(result.files, ['same.png', 'same (2).png']);
  assert.deepEqual([...stored.keys()], ['same.png', 'same (2).png']);
  assert.equal(Buffer.from(stored.get('same.png')).toString(), 'first');
  assert.equal(Buffer.from(stored.get('same (2).png')).toString(), scope);
});
