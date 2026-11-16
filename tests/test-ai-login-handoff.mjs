import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import { createAiLoginHandoff, LOGIN_INTENT_SESSION_KEY } from '../js/ai-login-handoff.js?v=1.7.0-four-session-integration';

const ID = '9b1be9a3-ec57-4cdd-aa93-2bd11d7b7c11';
const options = () => ({ references: [{ dataUrl: 'data:image/png;base64,Y3JvcA==', name: '잘라낸 그림', source: { crop: [2, 4, 20, 30] } }], groups: [[0]], placement: 'separate' });
function fixture() {
  const records = new Map(), sessionRecords = new Map(), prepared = [], shown = [], events = new EventEmitter();
  const session = { getItem: key => sessionRecords.get(key) ?? null, setItem: (key, value) => sessionRecords.set(key, value), removeItem: key => sessionRecords.delete(key) };
  let auth, writesFail = false, connected = false;
  const deps = {
    read: async key => structuredClone(records.get(key)),
    write: async (key, value) => { if (writesFail) throw new Error('quota'); records.set(key, structuredClone(value)); },
    remove: async key => records.delete(key),
    session, makeId: () => ID,
    prepare: async value => { prepared.push(structuredClone(value)); return [{ scope: ID, name: value.references[0].name, referenceIndices: [0] }]; },
    reveal: async (receipt, { signal }) => { if (signal?.aborted) throw new DOMException('cancel', 'AbortError'); shown.push(structuredClone(receipt)); },
    requireAi: action => connected ? action({ signal: new AbortController().signal }) : new Promise((resolve, reject) => { auth = { action, resolve, reject, controller: new AbortController() }; events.emit('auth'); }),
  };
  return {
    deps, records, session, prepared, shown,
    authReady:()=>once(events,'auth',{signal:AbortSignal.timeout(5000)}),
    coordinator: () => createAiLoginHandoff(deps),
    failWrites: () => { writesFail = true; },
    async login() { connected = true; const pending = auth; auth = null; pending.resolve(await pending.action({ signal: pending.controller.signal })); },
    cancel() { auth.controller.abort(); auth.reject(new DOMException('cancel', 'AbortError')); auth = null; },
  };
}

test('anonymous handoff checkpoints a pixel snapshot and waits for authentication before returning its receipt', {timeout:5000}, async () => {
  const f = fixture(), coordinator = f.coordinator(), input = options();
  let finished = false;
  const ready=f.authReady();
  const completion = coordinator.open(input).then(value => { finished = true; return value; });
  input.references[0].name = '다른 선택'; input.references[0].source.crop[0] = 999;
  await ready;
  assert.equal(finished, false); assert.equal(f.shown.length, 0);
  assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), ID);
  assert.equal(f.prepared[0].references[0].name, '잘라낸 그림');
  assert.deepEqual(f.prepared[0].references[0].source.crop, [2, 4, 20, 30]);
  assert.equal(f.prepared[0].reveal, false); assert.equal(f.prepared[0].startGeneration, false);
  await f.login();
  assert.deepEqual((await completion)[0].referenceIndices, [0]);
  assert.equal(f.shown.length, 1); assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), null);
  assert.equal(f.records.size, 0);
});

test('cancel then retry reuses the saved destination without importing the crop twice', {timeout:5000}, async () => {
  const f = fixture(), coordinator = f.coordinator();
  const ready=f.authReady();
  const cancelled = assert.rejects(coordinator.open(options()), { name: 'AbortError' });
  await ready; f.cancel(); await cancelled;
  assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), null);
  assert.equal(f.shown.length, 0);
  const retryReady=f.authReady();
  const retry = coordinator.open(options()); await retryReady; await f.login(); await retry;
  assert.equal(f.prepared.length, 1); assert.equal(f.shown.length, 1);
});

test('a new page recovers the pending receipt without reimporting or consulting current selection', {timeout:5000}, async () => {
  const f = fixture();
  const firstReady=f.authReady();
  void f.coordinator().open(options()); await firstReady;
  const nextReady=f.authReady();
  const recovered = f.coordinator().recover(); await nextReady; await f.login(); await recovered;
  assert.equal(f.prepared.length, 1); assert.equal(f.shown.length, 1);
});

test('a reload after initial intent write but before import receipt uses the same import ID', {timeout:5000}, async () => {
  const f = fixture();
  f.records.set(`ai-login-intent:${ID}`, { version: 1, id: ID, options: options(), state: 'preparing', receipt: null });
  f.session.setItem(LOGIN_INTENT_SESSION_KEY, ID);
  const ready=f.authReady();
  const recovered = f.coordinator().recover(); await ready; await f.login(); await recovered;
  assert.equal(f.prepared[0].importId, ID);
  assert.equal(f.shown.length, 1);
});

test('storage failure leaves source ownership at the library and never opens login or workbench', {timeout:5000}, async () => {
  const f = fixture(); f.failWrites();
  await assert.rejects(f.coordinator().open(options()), /quota/);
  assert.equal(f.prepared.length, 0); assert.equal(f.shown.length, 0);
  assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), null);
});

test('partial hidden staging never acknowledges library sources as transferred', {timeout:5000}, async () => {
  const f = fixture();
  f.deps.prepare = async () => { throw Object.assign(new Error('second group failed'), { transferredReferenceIndices: [0] }); };
  await assert.rejects(f.coordinator().open(options()), error => error.message === 'second group failed' && error.transferredReferenceIndices === undefined);
  assert.equal(f.records.size, 0); assert.equal(f.shown.length, 0);
});

test('cancelled image payloads do not accumulate when a different crop is submitted', {timeout:5000}, async () => {
  const f = fixture(), coordinator = f.coordinator();
  for (let index = 0; index < 3; index++) {
    const next = options(); next.references[0].name += index;
    const ready=f.authReady();
    const completion = assert.rejects(coordinator.open(next), { name: 'AbortError' });
    await ready; f.cancel(); await completion;
    assert.equal(f.records.size, 0);
  }
});

test('repeated clicks share the same operation while a different image cannot replace it', {timeout:5000}, async () => {
  const f = fixture(), coordinator = f.coordinator();
  const ready=f.authReady();
  const first = coordinator.open(options()), repeated = coordinator.open(options());
  assert.equal(first, repeated);
  const other = options(); other.references[0].dataUrl += 'other';
  await assert.rejects(coordinator.open(other), /로그인/);
  await ready; await f.login(); await first;
  assert.equal(f.prepared.length, 1); assert.equal(f.shown.length, 1);
});

test('dismissal during source preparation cannot reopen a closed library', {timeout:5000}, async () => {
  const f = fixture(); let active = true, release; const prepared=Promise.withResolvers();
  f.deps.prepare = async () => { await new Promise(resolve => { release = resolve; prepared.resolve(); }); return [{ scope: ID, referenceIndices: [0] }]; };
  const completion = assert.rejects(f.coordinator().open({ ...options(), isCurrent: () => active }), { name: 'AbortError' });
  await prepared.promise; active = false; release(); await completion;
  assert.equal(f.shown.length, 0); assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), null);
});

test('a cancelled or obsolete persisted intent never autoopens an AI workbench', {timeout:5000}, async () => {
  const f = fixture();
  f.records.set(`ai-login-intent:${ID}`, { version: 1, id: ID, options: options(), state: 'cancelled' });
  f.session.setItem(LOGIN_INTENT_SESSION_KEY, ID);
  assert.equal(await f.coordinator().recover(), null);
  assert.equal(f.shown.length, 0); assert.equal(f.session.getItem(LOGIN_INTENT_SESSION_KEY), null);
});

test('graph conversion intent survives a preparation checkpoint and recovery', {timeout:5000}, async () => {
  const f = fixture(), input = { ...options(), conversionKind: 'graph' };
  f.records.set(`ai-login-intent:${ID}`, { version: 1, id: ID, options: input, state: 'preparing', receipt: null });
  f.session.setItem(LOGIN_INTENT_SESSION_KEY, ID);
  const ready = f.authReady();
  const recovered = f.coordinator().recover();
  await ready;
  assert.equal(f.prepared[0].conversionKind, 'graph');
  assert.deepEqual(f.prepared[0].references, input.references);
  assert.deepEqual(f.prepared[0].groups, input.groups);
  await f.login();
  await recovered;
  assert.equal(f.shown.length, 1);
});

test('mixed image and graph classification is snapshotted and recovered through login', async () => {
  const f = fixture(), input = options();
  input.references.push({...input.references[0], name:'그래프'});
  input.groups = [[0], [1]]; input.groupKinds = ['image', 'graph']; input.placement = 'advanced';
  const ready = f.authReady();
  void f.coordinator().open(input); input.groupKinds[1] = 'image'; await ready;
  assert.deepEqual(f.prepared[0].groupKinds, ['image', 'graph']);
  const recoveryReady = f.authReady();
  const recovered = f.coordinator().recover(); await recoveryReady; await f.login(); await recovered;
  assert.equal(f.prepared.length, 1);
  assert.deepEqual(f.prepared[0].groups, [[0], [1]]);
  assert.deepEqual(f.prepared[0].groupKinds, ['image', 'graph']);
});
