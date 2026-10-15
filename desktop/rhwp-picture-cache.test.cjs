const test = require('node:test');
const assert = require('node:assert/strict');

async function fixture() {
  const { RhwpExamBridge } = await import('../js/rhwp-exam-bridge.js');
  let controls = [];
  const snapshots = new Map();
  let serial = 0;
  const input = {
    getCursorPosition: () => ({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0 }),
    executeOperation: ({ operation }) => operation(),
    cursor: { moveTo() {} },
  };
  const bridge = Object.create(RhwpExamBridge.prototype);
  Object.defineProperty(bridge, 'input', { value: input });
  bridge.revision = 0;
  bridge.deps = {
    eventBus: { emit: () => { bridge.revision++; } },
    wasm: {
      documentGeneration: 1, pageCount: 1,
      getPageControlLayout: () => ({ controls }),
      getCellPicturePropertiesByPath: () => ({ description: '5e-exam:inserted' }),
      saveSnapshot() { const id = ++serial; snapshots.set(id, structuredClone(controls)); return id; },
      restoreSnapshot(id) { controls = structuredClone(snapshots.get(id)); },
      discardSnapshot: id => snapshots.delete(id),
    },
  };
  const insert = () => controls.push({ type: 'image', secIdx: 0, paraIdx: 0, controlIdx: 1,
    cellPath: [{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }] });
  return { bridge, insert, snapshots };
}

test('picture lookups see native mutations before the document revision changes', async () => {
  const { bridge, insert, snapshots } = await fixture();
  assert.deepEqual(bridge.documentPictures(), []);
  bridge.transaction('insert-test', () => {
    assert.deepEqual(bridge.documentPictures(), []);
    insert();
    assert.equal(bridge.documentPictures()[0].id, 'inserted');
    assert.equal(bridge.documentPictures()[0].ref.cellPath.length, 1);
    return true;
  });
  assert.equal(bridge.documentPictures().length, 1);
  assert.equal(bridge.pictureMutationDepth, 0);
  assert.equal(snapshots.size, 0);
});

test('failed native mutations restore controls and discard speculative picture caches', async () => {
  const { bridge, insert, snapshots } = await fixture();
  assert.deepEqual(bridge.documentPictures(), []);
  assert.throws(() => bridge.transaction('rollback-test', () => {
    insert();
    assert.equal(bridge.documentPictures().length, 1);
    throw new Error('failed insert');
  }), /failed insert/);
  assert.equal(bridge.revision, 0);
  assert.deepEqual(bridge.documentPictures(), []);
  assert.equal(bridge.pictureMutationDepth, 0);
  assert.equal(snapshots.size, 0);
});
