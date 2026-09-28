const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = name => import(pathToFileURL(path.resolve(__dirname, '../preview/js', name)).href);
const batchScope = { sessionId: 'session', workspaceId: 'batch-host' };
const image = 'data:image/png;base64,iVBORw0KGgo=';
const entry = i => ({ scope: { sessionId: 'session', workspaceId: `workspace-${i % 2}` }, taskId: `task-${i}`, snapshot: { dataUrl: image, revisionId: `original-${i}`, operation: 'generate', options: { quality: 'high' }, comments: [{ text: 'before' }], model: 'sol', candidate: { id: 'candidate-before' } } });
async function fixture(extra = {}) {
  const { createWorkspaceBatch, createWorkspaceSelection } = await load('ai-workspace-batch.js');
  const { createMemoryBatchStore } = await load('ai-batch-store.js');
  const starts = [], commits = [], interrupts = [];
  const store = extra.store || createMemoryBatchStore();
  const batch = createWorkspaceBatch({ store, scope: batchScope, serviceCap: 10,
    preflight: () => null,
    runner: { start(context, emit) { starts.push({ context, emit }); }, interrupt(context) { interrupts.push(context); } },
    async commit(context, result) { commits.push({ context, result }); return { ...context.owner, committed: true, revisionId: `result-${context.jobId}` }; },
    ...extra });
  const complete = start => start.emit({ type: 'completed', result: { ...start.context.owner, operation: start.context.snapshot.operation, candidateId: 'output', approved: true } });
  return { batch, starts, commits, interrupts, complete, store, createWorkspaceSelection };
}

test('selection toggles compound owners independently of any active UI task', async () => {
  const { createWorkspaceSelection } = await fixture();
  const selected = createWorkspaceSelection();
  selected.select(entry(0)); selected.select(entry(1), { toggle: true });
  assert.deepEqual(selected.values().map(x => x.taskId), ['task-0', 'task-1']);
  selected.select(entry(0), { toggle: true });
  assert.deepEqual(selected.values().map(x => x.taskId), ['task-1']);
  selected.select(entry(2));
  const copy = selected.values(); copy[0].scope.workspaceId = 'tampered';
  assert.equal(selected.values()[0].scope.workspaceId, 'workspace-0');
});

test('typed runner cancellation preserves cancelled terminals, peers, capacity and recovery', async () => {
  for (const synchronous of [false, true]) {
    const starts = [], interruptions = [];
    const f = await fixture({ serviceCap: 2, runner: {
      start(context, emit) {
        starts.push({ context, emit });
        if (context.owner.taskId !== 'task-0') return;
        const error = new DOMException('Bounds rejected', 'AbortError');
        if (synchronous) throw error;
        return Promise.reject(error);
      },
      interrupt(context) { interruptions.push(context.jobId); },
    } });
    const inputs = [entry(0), entry(1), entry(2)], before = structuredClone(inputs);
    const jobs = await f.batch.launch(f.batch.prepare(inputs));
    await new Promise(resolve => setImmediate(resolve));
    const settled = await f.batch.list();
    assert.deepEqual(settled.map(job => job.state), ['cancelled', 'running', 'running']);
    assert.equal(starts.length, 3, 'cancelled runner releases its service slot');
    assert.equal(settled[0].error, null);
    assert.equal(settled[0].result, null);
    assert.equal(settled[0].timestamps.failedAt, null);
    assert.equal(f.batch.prepare([entry(0)]).eligible, true, 'cancelled owner can be selected for a new explicit request');
    await assert.rejects(f.batch.retry(jobs[0].id), /Only failed/);
    await starts[0].emit({ type: 'completed', result: { ...starts[0].context.owner, operation: 'generate', candidateId: 'stale' } });
    await starts[0].emit({ type: 'failed', error: 'late failure' });
    assert.deepEqual(await f.batch.list(), settled, 'late completion and failure cannot rewrite cancellation');
    assert.deepEqual(inputs, before);
    assert.equal(f.commits.length, 0);
    const recovered = await fixture({ store: f.store });
    assert.deepEqual((await recovered.batch.recover()).map(job => job.state), ['cancelled', 'failed', 'failed']);
    assert.equal(recovered.starts.length, 0);
    await f.batch.dispose(); await recovered.batch.dispose();
  }
});

test('12 immutable workspace snapshots overflow at ten; explicit failure retry and cancellation isolate owners', async () => {
  const f = await fixture();
  const inputs = Array.from({ length: 12 }, (_, i) => entry(i));
  const prepared = f.batch.prepare(inputs);
  inputs[0].snapshot.comments[0].text = 'after'; inputs[0].snapshot.options.quality = 'low'; inputs[0].snapshot.model = 'luna'; inputs[0].snapshot.candidate.id = 'after';
  const launching = f.batch.launch(prepared);
  const duplicate = f.batch.launch(prepared);
  const jobs = await launching; assert.deepEqual(await duplicate, jobs);
  assert.equal(f.starts.length, 10);
  assert.equal((await f.batch.list()).filter(j => j.state === 'queued').length, 2);
  assert.equal(f.starts[0].context.snapshot.comments[0].text, 'before');
  assert.equal(f.starts[0].context.snapshot.options.quality, 'high');
  assert.equal(f.starts[0].context.snapshot.model, 'sol');
  assert.equal(f.starts[0].context.snapshot.candidate.id, 'candidate-before');
  await f.starts[0].emit({ type: 'failed', error: 'provider rejected' });
  await f.batch.cancel(jobs[1].id);
  assert.equal(f.starts.length, 12);
  await f.complete(f.starts[1]);
  await f.batch.retry(jobs[0].id);
  await f.complete(f.starts[0]);
  for (const start of f.starts.slice(2, 12)) await f.complete(start);
  assert.equal(f.starts.length, 13);
  await f.complete(f.starts[12]);
  const finished = await f.batch.list();
  assert.equal(finished.filter(j => j.state === 'completed').length, 11);
  assert.equal(finished.find(j => j.id === jobs[1].id).state, 'cancelled');
  assert.equal(finished.find(j => j.id === jobs[0].id).attempt, 2);
  assert.equal(f.commits.length, 11);
  assert.equal(new Set(f.commits.map(x => JSON.stringify(x.context.owner))).size, 11);
  assert.equal(f.interrupts.length, 1);
  await f.batch.dispose();
});

test('preflight reports all ineligible selections before any dispatch and rejects forged preparations', async () => {
  const f = await fixture({ preflight: item => item.taskId === 'task-1' ? 'Busy task' : null });
  const invalid = entry(2); invalid.snapshot.dataUrl = 'invalid';
  const report = f.batch.prepare([entry(0), entry(1), invalid]);
  assert.equal(report.eligible, false); assert.equal(report.issues.length, 2);
  await assert.rejects(f.batch.launch(report), /ineligible/i);
  await assert.rejects(f.batch.launch({ eligible: true }), /preparation/i);
  assert.equal(f.starts.length, 0);
  assert.equal((await f.batch.list()).length, 0);
});

test('recovery never resends running or queued work until explicit retry', async () => {
  const original = await fixture({ serviceCap: 1 });
  await original.batch.launch(original.batch.prepare([entry(0), entry(1)]));
  const recovered = await fixture({ store: original.store, serviceCap: 1 });
  const jobs = await recovered.batch.recover();
  assert.deepEqual(jobs.map(j => j.state), ['failed', 'failed']);
  assert.equal(recovered.starts.length, 0);
  await recovered.batch.retry(jobs[0].id);
  assert.equal(recovered.starts.length, 1);
  await recovered.complete(recovered.starts[0]);
  assert.equal((await recovered.batch.list())[0].state, 'completed');
});

test('dirty provenance, misleading success, and missing scoped approval never commit', async () => {
  const f = await fixture();
  const scoped = entry(2); scoped.snapshot.operation = 'scoped-edit'; scoped.snapshot.scopeEdit = { rect: [1, 2, 3, 4] };
  await f.batch.launch(f.batch.prepare([entry(0), entry(1), scoped]));
  await f.starts[0].emit({ type: 'completed', result: { ...f.starts[0].context.owner, taskId: 'wrong', operation: 'generate', candidateId: 'output' } });
  await f.starts[1].emit({ type: 'completed', result: undefined });
  await f.starts[2].emit({ type: 'completed', result: { ...f.starts[2].context.owner, operation: 'generate', candidateId: 'output', approved: true } });
  assert.deepEqual((await f.batch.list()).map(j => j.state), ['failed', 'failed', 'failed']);
  assert.equal(f.commits.length, 0);
});

test('pending progress is not completion and disposal prevents queued sends or stale commits', async () => {
  const f = await fixture({ serviceCap: 1 });
  await f.batch.launch(f.batch.prepare([entry(0), entry(1)]));
  for (let i = 0; i < 30; i++) await f.starts[0].emit({ type: 'progress', progress: { phase: 'candidate-review', elapsedMs: i * 60000 } });
  assert.deepEqual((await f.batch.list()).map(j => j.state), ['running', 'queued']);
  assert.equal(f.commits.length, 0);
  await f.batch.dispose();
  await f.complete(f.starts[0]);
  assert.equal(f.starts.length, 1);
  assert.equal(f.commits.length, 0);
  assert.deepEqual((await f.batch.list()).map(j => j.state), ['cancelled', 'cancelled']);
});

test('overlapping preparations and concurrent explicit retries cannot send the same owner twice', async () => {
  const f = await fixture();
  const one = f.batch.prepare([entry(0)]), two = f.batch.prepare([entry(0)]);
  const jobs = await f.batch.launch(one);
  await assert.rejects(f.batch.launch(two), /already/);
  await f.starts[0].emit({ type: 'failed', error: 'Rejected' });
  const retries = await Promise.allSettled([f.batch.retry(jobs[0].id), f.batch.retry(jobs[0].id)]);
  assert.equal(retries.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(f.starts.length, 2);
  await f.complete(f.starts[1]);
  await assert.rejects(f.batch.retry(jobs[0].id), /Only failed/);
  assert.equal(f.starts.length, 2);
});

test('scoped edits preserve captured regions and require both approval receipts before task-owned commit', async () => {
  const f = await fixture();
  const a = entry(0), b = entry(1);
  for (const item of [a, b]) {
    item.snapshot.operation = 'scoped-edit'; item.snapshot.scopeEdit = { rect: [10, 20, 30, 40], mask: 'captured-mask', instruction: 'change only this area' };
  }
  const prepared = f.batch.prepare([a, b]);
  a.snapshot.scopeEdit.rect[0] = 999;
  await f.batch.launch(prepared);
  assert.equal(f.starts[0].context.snapshot.scopeEdit.rect[0], 10);
  await f.starts[0].emit({ type: 'completed', result: { ...f.starts[0].context.owner, operation: 'scoped-edit', candidateId: 'output', approved: true } });
  await f.starts[1].emit({ type: 'completed', result: { ...f.starts[1].context.owner, operation: 'scoped-edit', candidateId: 'output', approved: true, scopeConfirmed: true } });
  assert.deepEqual((await f.batch.list()).map(item => item.state), ['failed', 'completed']);
  assert.equal(f.commits.length, 1); assert.equal(f.commits[0].context.owner.taskId, 'task-1');
});

test('missing or wrong-owner durable receipts do not report successful completion', async () => {
  for (const receipt of [undefined, { committed: false }, { ...entry(1), committed: true, revisionId: 'wrong-owner' }]) {
    const f = await fixture({ commit: async () => receipt });
    await f.batch.launch(f.batch.prepare([entry(0)]));
    await f.complete(f.starts[0]);
    const [job] = await f.batch.list();
    assert.equal(job.state, 'failed'); assert.equal(job.result, null);
  }
});

test('malformed selections, unsupported operations and missing model stop before sends', async () => {
  const f = await fixture();
  for (const input of [null, [], {}, 'task']) assert.throws(() => f.batch.prepare(input));
  for (const input of [null, {}, { ...entry(0), scope: {} }, { ...entry(0), snapshot: {} }, { ...entry(0), snapshot: { ...entry(0).snapshot, model: '' } }, { ...entry(0), snapshot: { ...entry(0).snapshot, operation: 'fallback' } }]) {
    const report = f.batch.prepare([input]); assert.equal(report.eligible, false);
    await assert.rejects(f.batch.launch(report), /ineligible/);
  }
  assert.equal(f.batch.prepare([entry(0), entry(0)]).eligible, false);
  assert.equal(f.starts.length, 0);
});

test('service limits above ten remain capped and async undefined is a failure', async () => {
  const f = await fixture({ serviceCap: 50 });
  await f.batch.launch(f.batch.prepare(Array.from({ length: 12 }, (_, i) => entry(i))));
  assert.equal(f.starts.length, 10);
  await f.batch.dispose();
  const g = await fixture({ runner: { start: async () => undefined } });
  await g.batch.launch(g.batch.prepare([entry(0)]));
  const [job] = await g.batch.list();
  assert.equal(job.state, 'failed'); assert.equal(g.commits.length, 0);
});

test('failed initial durability prevents any runner invocation', async () => {
  const f = await fixture({ store: { load: async () => [], save: async () => { throw new Error('disk unavailable'); } } });
  await assert.rejects(f.batch.launch(f.batch.prepare([entry(0)])), /disk unavailable/);
  assert.equal(f.starts.length, 0); assert.deepEqual(await f.batch.list(), []);
});

test('identical task IDs in distinct workspaces are separate selection and result owners', async () => {
  const f = await fixture();
  const a = entry(0), b = entry(1); b.taskId = a.taskId;
  const selection = f.createWorkspaceSelection(); selection.select(a); selection.select(b, { toggle: true });
  assert.equal(selection.values().length, 2);
  await f.batch.launch(f.batch.prepare([a, b]));
  for (const start of f.starts) await f.complete(start);
  assert.equal(f.commits.length, 2);
  assert.equal(new Set(f.commits.map(x => x.context.owner.scope.workspaceId)).size, 2);
});

test('zero, fractional and unknown service capacities are rejected without dispatch', async () => {
  for (const serviceCap of [0, -1, 0.5, NaN, '10']) await assert.rejects(fixture({ serviceCap }), /concurrency/);
});

test('cancel waits for async transport interruption before filling its physical service slot', async () => {
  const live = new Set(); const calls = []; let peak = 0, acknowledge;
  let interrupted;
  const interruptionStarted = new Promise(resolve => { interrupted = resolve; });
  const f = await fixture({ serviceCap: 1, runner: {
    start(context, emit) { live.add(context.jobId); peak = Math.max(peak, live.size); calls.push({ context, emit }); },
    interrupt(context) {
      if (calls[0].context.jobId !== context.jobId) { live.delete(context.jobId); return; }
      interrupted();
      return new Promise(resolve => { acknowledge = () => { live.delete(context.jobId); resolve(); }; });
    },
  } });
  const jobs = await f.batch.launch(f.batch.prepare([entry(0), entry(1)]));
  const cancelled = f.batch.cancel(jobs[0].id);
  await interruptionStarted;
  await f.batch.launch(f.batch.prepare([entry(2)]));
  assert.equal(calls.length, 1); assert.equal(peak, 1);
  assert.deepEqual((await f.batch.list()).map(j => j.state), ['cancelled', 'queued', 'queued']);
  acknowledge(); await cancelled;
  assert.equal(calls.length, 2); assert.equal(peak, 1);
  await f.batch.dispose();
  assert.equal(live.size, 0);
});

test('synchronous cancellation keeps actual runner peak within caps one and ten', async () => {
  for (const cap of [1, 10]) {
    const live = new Set(); let peak = 0;
    const f = await fixture({ serviceCap: cap, runner: {
      start(context) { live.add(context.jobId); peak = Math.max(peak, live.size); },
      interrupt(context) { live.delete(context.jobId); },
    } });
    const jobs = await f.batch.launch(f.batch.prepare(Array.from({ length: cap + 2 }, (_, i) => entry(i))));
    await f.batch.cancel(jobs[0].id);
    assert.equal(peak, cap);
    await f.batch.dispose(); assert.equal(live.size, 0);
  }
});

test('interruption can await a terminal callback without deadlocking the queue', async () => {
  let emit;
  const f = await fixture({ serviceCap: 1, runner: {
    start(context, callback) { emit = callback; },
    async interrupt() { await emit({ type: 'failed', error: 'transport stopped' }); },
  } });
  const [job] = await f.batch.launch(f.batch.prepare([entry(0)]));
  await f.batch.cancel(job.id);
  assert.equal((await f.batch.list())[0].state, 'cancelled');
  await f.batch.dispose();
});

test('failed interruption retains capacity until terminal stop evidence arrives', async () => {
  const starts = [];
  const f = await fixture({ serviceCap: 1, runner: {
    start(context, emit) { starts.push({ context, emit }); },
    interrupt() { throw new Error('cannot confirm transport stopped'); },
  } });
  const jobs = await f.batch.launch(f.batch.prepare([entry(0), entry(1)]));
  await assert.rejects(f.batch.cancel(jobs[0].id), /cannot confirm/);
  assert.equal(starts.length, 1);
  await starts[0].emit({ type: 'failed', error: 'transport eventually stopped' });
  assert.equal(starts.length, 2);
  assert.equal(f.batch.prepare([entry(0)]).eligible, true);
  await starts[1].emit({ type: 'failed', error: 'finished' });
  await f.batch.dispose();
});

test('recovered malformed workspace snapshots remain failed with actionable retry errors and zero sends', async () => {
  const original = await fixture();
  await original.batch.launch(original.batch.prepare([entry(0)]));
  const saved = await original.batch.list(); await original.batch.dispose();
  const { createMemoryBatchStore } = await load('ai-batch-store.js');
  for (const mutate of [
    source => { source.snapshot.model = ''; },
    source => { source.snapshot.operation = 'invented'; },
    source => { source.snapshot.revisionId = ''; },
    source => { source.owner.scope.workspaceId = ''; },
    source => { source.snapshot.options = []; },
    source => { source.snapshot.dataUrl = 'invalid'; },
    source => { source.snapshot.operation = 'scoped-edit'; source.snapshot.scopeEdit = null; },
    source => { source.snapshot.operation = 'scoped-edit'; source.snapshot.scopeEdit = []; },
  ]) {
    const records = structuredClone(saved); mutate(records[0].sourceSnapshot);
    const store = createMemoryBatchStore({ [JSON.stringify([batchScope.sessionId, batchScope.workspaceId])]: records });
    const f = await fixture({ store });
    const [job] = await f.batch.recover();
    const retried = await f.batch.retry(job.id);
    assert.equal(retried.state, 'failed'); assert.match(retried.error, /^Retry blocked:/);
    assert.equal(retried.attempt, job.attempt); assert.equal(f.starts.length, 0);
    const [persisted] = await store.load(batchScope); assert.equal(persisted.error, retried.error);
    await f.batch.dispose();
  }
});

test('legacy generic queue still resumes by default and starts after synchronous cancellation', async () => {
  const { createBatchQueue } = await load('ai-batch-queue.js');
  const { createMemoryBatchStore } = await load('ai-batch-store.js');
  const store = createMemoryBatchStore(); const starts = [];
  const queue = createBatchQueue({ store, maxRunning: 1, generation: { start: job => { starts.push(job); } } });
  const jobs = await queue.enqueue({ ...batchScope, sources: [{ dataUrl: image }, { dataUrl: image }] });
  await queue.cancel(jobs[0].id); assert.equal(starts.length, 2);
  const resumed = [];
  const other = createBatchQueue({ store, generation: { start: job => { resumed.push(job); } } });
  const records = await other.resume(batchScope);
  assert.equal(resumed.length, 1); assert.equal(resumed[0].attempt, 2);
  await queue.cancel(jobs[1].id);
  await other.cancel(records[1].id);
});

test('dispose and repeated cancel wait for a previously journalled cancellation to actually stop transport', async () => {
  let acknowledge, entered, calls = 0;
  const live = new Set(); const interruptionStarted = new Promise(resolve => { entered = resolve; });
  const f = await fixture({ serviceCap: 1, runner: {
    start(context) { live.add(context.jobId); },
    interrupt(context) { calls++; entered(); return new Promise(resolve => { acknowledge = () => { live.delete(context.jobId); resolve(); }; }); },
  } });
  const jobs = await f.batch.launch(f.batch.prepare([entry(0), entry(1)]));
  const cancellation = f.batch.cancel(jobs[0].id);
  await interruptionStarted;
  let secondCancelSettled = false, disposalSettled = false, secondDisposeSettled = false;
  const secondCancel = f.batch.cancel(jobs[0].id).then(() => { secondCancelSettled = true; });
  const disposal = f.batch.dispose().then(() => { disposalSettled = true; });
  const secondDispose = f.batch.dispose().then(() => { secondDisposeSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  const before = { secondCancelSettled, disposalSettled, secondDisposeSettled, live: live.size };
  acknowledge(); await Promise.all([cancellation, secondCancel, disposal, secondDispose]);
  assert.deepEqual(before, { secondCancelSettled: false, disposalSettled: false, secondDisposeSettled: false, live: 1 });
  assert.equal(calls, 1); assert.equal(live.size, 0);
  assert.deepEqual((await f.batch.list()).map(j => j.state), ['cancelled', 'cancelled']);
});

test('terminal callback during interruption does not let dispose skip pending interruption cleanup', async () => {
  let emit, terminalSent, finishCleanup;
  const sent = new Promise(resolve => { terminalSent = resolve; });
  const f = await fixture({ runner: {
    start(context, callback) { emit = callback; },
    async interrupt() {
      await emit({ type: 'failed', error: 'transport stopped' });
      terminalSent();
      await new Promise(resolve => { finishCleanup = resolve; });
    },
  } });
  const [job] = await f.batch.launch(f.batch.prepare([entry(0)]));
  const cancellation = f.batch.cancel(job.id);
  await sent;
  let settled = false;
  const disposal = f.batch.dispose().then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  const prematurelySettled = settled;
  finishCleanup(); await Promise.all([cancellation, disposal]);
  assert.equal(prematurelySettled, false);
  assert.equal(settled, true);
});

test('one bounded selected image round-trips without repeated image bytes and stays immutable across explicit recovery', async () => {
  const bytes = Buffer.alloc(900000, 19); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const data = 'data:image/png;base64,' + bytes.toString('base64');
  const value = entry(0);
  value.snapshot.dataUrl = data;
  value.snapshot.candidate = { id: value.snapshot.revisionId, data, comments: [{text:'before'}] };
  value.snapshot.options.generated = [structuredClone(value.snapshot.candidate)];
  value.snapshot.options.attachments = [];
  const expected = structuredClone(value.snapshot);
  const first = await fixture();
  const report = first.batch.prepare([value]);
  assert.equal(report.eligible, true);
  value.snapshot.dataUrl = image; value.snapshot.candidate.comments[0].text = 'after';
  value.snapshot.options.quality = 'tampered'; value.snapshot.model = 'tampered';
  const [job] = await first.batch.launch(report);
  assert.deepEqual(first.starts[0].context.snapshot, expected);
  const persisted = (await first.batch.list())[0];
  assert.equal(persisted.sourceSnapshot.snapshot.dataUrl, undefined);
  assert.equal(persisted.sourceSnapshot.snapshot.candidate.data, undefined);
  assert.equal(persisted.sourceSnapshot.snapshot.options.generated[0].data, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify({sourceSnapshot:persisted.sourceSnapshot,options:persisted.options})) < 1500000);
  const recovered = await fixture({ store: first.store });
  await recovered.batch.recover(); assert.equal(recovered.starts.length, 0);
  await recovered.batch.retry(job.id);
  assert.deepEqual(recovered.starts[0].context.snapshot, expected);
  await recovered.batch.cancel(job.id);
  assert.equal((await recovered.batch.list())[0].state, 'cancelled');
  await recovered.batch.dispose(); await first.batch.dispose();
});

test('compact workspace records enforce transport-aligned image/record caps and refuse corrupt encodings before retry', async () => {
  const f = await fixture();
  for (const mutate of [
    value => { value.snapshot.options.padding = 'x'.repeat(12000000); },
    value => { const bytes=Buffer.alloc(8000001); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); value.snapshot.dataUrl='data:image/png;base64,'+bytes.toString('base64'); },
    value => { value.snapshot.dataUrl='data:image/png;base64,AAAA'; },
    value => { value.snapshot.options=[]; },
  ]) { const value=entry(0);mutate(value);assert.equal(f.batch.prepare([value]).eligible,false); }
  assert.equal(f.starts.length,0);
  for (const corrupt of [source=>{source.snapshotVersion=99;},source=>{source.snapshot.dataUrl=image;},source=>{source.snapshot.options.generated={};}]) {
    const original=await fixture();const [job]=await original.batch.launch(original.batch.prepare([entry(0)]));
    const records=await original.store.load(batchScope);corrupt(records[0].sourceSnapshot);await original.store.save(batchScope,records);
    const recovered=await fixture({store:original.store});await recovered.batch.recover();assert.equal(recovered.starts.length,0);
    const retried=await recovered.batch.retry(job.id);assert.equal(retried.state,'failed');assert.match(retried.error,/Retry blocked/);assert.equal(recovered.starts.length,0);
    await recovered.batch.dispose();await original.batch.dispose();
  }
  await f.batch.dispose();
});
