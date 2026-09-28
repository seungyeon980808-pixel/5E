import { createBatchQueue } from './ai-batch-queue.js?v=1.6.0-workbench-polish-0928-final';
import { parseBatchSource } from './ai-batch-source.js?v=1.6.0-preview-labeler-0917-1111';

const clone = value => structuredClone(value);
const key = owner => JSON.stringify([owner.scope.sessionId, owner.scope.workspaceId, owner.taskId]);
const terminal = state => ['completed', 'failed', 'cancelled'].includes(state);

function ownerOf(value) {
  if (!value || !value.scope || [value.scope.sessionId, value.scope.workspaceId, value.taskId].some(id => typeof id !== 'string' || !id.trim())) {
    throw new TypeError('Workspace selection requires scope and taskId.');
  }
  return { scope: { sessionId: value.scope.sessionId, workspaceId: value.scope.workspaceId }, taskId: value.taskId };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function sourceSnapshot(source) {
  const snapshot = clone(source.snapshot);
  if (source.snapshotVersion === undefined) return snapshot;
  if (source.snapshotVersion !== 1 || !snapshot || snapshot.dataUrl !== undefined) throw new TypeError('Invalid workspace snapshot encoding.');
  snapshot.dataUrl = source.dataUrl;
  for (const item of [snapshot.candidate, ...(snapshot.options?.generated || []), ...(snapshot.options?.attachments || [])]) {
    if (item?.id === snapshot.revisionId && item.data === undefined) item.data = source.dataUrl;
  }
  return snapshot;
}

function encodeSource(owner, snapshot) {
  const compact = clone(snapshot);
  delete compact.dataUrl;
  for (const item of [compact.candidate, ...(compact.options?.generated || []), ...(compact.options?.attachments || [])]) {
    if (item?.id === snapshot.revisionId && item.data === snapshot.dataUrl) delete item.data;
  }
  return { dataUrl: snapshot.dataUrl, owner, snapshotVersion: 1, snapshot: compact };
}

export function createWorkspaceSelection() {
  const selected = new Map();
  return {
    select(value, { toggle = false } = {}) {
      const owner = ownerOf(value);
      const id = key(owner);
      if (!toggle) selected.clear();
      if (toggle && selected.has(id)) selected.delete(id);
      else selected.set(id, owner);
      return clone([...selected.values()]);
    },
    values: () => clone([...selected.values()]),
    clear: () => selected.clear(),
  };
}

export function createWorkspaceBatch({ store, scope, serviceCap = 10, runner, preflight, commit, onError = error => console.error('Workspace batch event could not be persisted.', error) } = {}) {
  if (!scope || [scope.sessionId, scope.workspaceId].some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('Batch scope is required.');
  if (!Number.isInteger(serviceCap) || serviceCap < 1) throw new RangeError('Service concurrency must be a positive integer.');
  if (typeof runner?.start !== 'function' || typeof preflight !== 'function' || typeof commit !== 'function' || typeof onError !== 'function') throw new TypeError('Workspace batch requires runner, preflight and commit callbacks.');
  scope = clone(scope);
  const prepared = new WeakMap();
  const owners = new Set();
  const contexts = new Map();
  const cancellations = new Map();
  let disposal = null;
  let disposed = false;
  const contextKey = job => `${job.id}:${job.attempt}`;
  const contextFor = job => contexts.get(contextKey(job));
  const queue = createBatchQueue({
    store, maxRunning: Math.min(10, serviceCap),
    generation: {
      start(job, emit) {
        if (disposed) return;
        const abort = new AbortController();
        const context = Object.freeze({ jobId: job.id, attempt: job.attempt, owner: freeze(clone(job.sourceSnapshot.owner)), snapshot: freeze(sourceSnapshot(job.sourceSnapshot)), signal: abort.signal });
        contexts.set(contextKey(job), { context, abort });
        const deliver = async event => {
          const updated = await emit(event);
          if (updated && terminal(updated.state)) {
            contexts.delete(contextKey(job));
            owners.delete(key(context.owner));
            if (updated.state === 'cancelled' && cancellations.get(job.id)?.failed) cancellations.delete(job.id);
          }
          return updated;
        };
        const reject = error => error?.name === 'AbortError' && !abort.signal.aborted
          ? cancel(job.id)
          : deliver({ type: 'failed', error: error instanceof Error ? error.message : String(error) });
        try {
          const returned = runner.start(context, deliver);
          if (returned !== undefined) void Promise.resolve(returned).then(
            result => deliver({ type: 'completed', result }),
            reject,
          ).catch(onError);
        } catch (error) {
          void reject(error).catch(onError);
        }
      },
      interrupt(job) {
        const running = contextFor(job);
        if (!running) return;
        running.abort.abort();
        contexts.delete(contextKey(job));
        return runner.interrupt?.(running.context);
      },
    },
    output: {
      async write({ job, result }) {
        const { owner, snapshot } = job.sourceSnapshot;
        if (disposed || !result || key(ownerOf(result)) !== key(owner) || result.operation !== snapshot.operation || typeof result.candidateId !== 'string' || !result.candidateId) {
          throw new Error('Result does not match the captured task and operation.');
        }
        if (snapshot.operation === 'scoped-edit' && (result.approved !== true || result.scopeConfirmed !== true)) throw new Error('Scoped edit requires task-bound scope confirmation and candidate approval.');
        const running = contextFor(job);
        if (!running || running.abort.signal.aborted) throw new Error('Request is no longer active.');
        const receipt = await commit(running.context, clone(result));
        if (!receipt || receipt.committed !== true || key(ownerOf(receipt)) !== key(owner) || typeof receipt.revisionId !== 'string' || !receipt.revisionId) throw new Error('Controller did not confirm durable task-owned registration.');
        return clone(receipt);
      },
    },
  });

  function validateSource(entry) {
    const owner = ownerOf(entry);
    const snapshot = clone(entry.snapshot);
    if (!snapshot || !['generate', 'scoped-edit'].includes(snapshot.operation) || typeof snapshot.revisionId !== 'string' || !snapshot.revisionId || typeof snapshot.model !== 'string' || !snapshot.model) throw new TypeError('Task requires revision, model and explicit operation.');
    if (snapshot.operation === 'scoped-edit' && (!snapshot.scopeEdit || typeof snapshot.scopeEdit !== 'object' || Array.isArray(snapshot.scopeEdit))) throw new TypeError('Scoped edit requires its captured scope.');
    if (!snapshot.options || typeof snapshot.options !== 'object' || Array.isArray(snapshot.options)) throw new TypeError('Task options must be a record.');
    const source = parseBatchSource(encodeSource(owner, snapshot), {}).snapshot;
    const reason = preflight(freeze(clone({ ...owner, snapshot })));
    if (reason !== null && reason !== undefined) throw new Error(typeof reason === 'string' ? reason : 'Preflight must return a synchronous reason or null.');
    return source;
  }

  function prepare(entries) {
    if (disposed) throw new Error('Workspace batch has been disposed.');
    if (!Array.isArray(entries) || !entries.length) throw new TypeError('Select at least one workspace task.');
    const sources = [], issues = [], seen = new Set();
    for (let index = 0; index < entries.length; index++) {
      try {
        const owner = ownerOf(entries[index]);
        if (seen.has(key(owner))) throw new Error('Task selected more than once.');
        seen.add(key(owner));
        if (owners.has(key(owner))) throw new Error('Task already has a batch request.');
        const source = validateSource(entries[index]);
        sources.push(source);
      } catch (error) { issues.push({ index, reason: error instanceof Error ? error.message : String(error) }); }
    }
    const report = freeze({ eligible: issues.length === 0, count: entries.length, issues });
    prepared.set(report, { sources, launch: null });
    return report;
  }

  async function launch(report) {
    if (disposed) throw new Error('Workspace batch has been disposed.');
    const plan = prepared.get(report);
    if (!plan) throw new Error('Unknown batch preparation.');
    if (!report.eligible) throw new Error('Batch contains ineligible tasks; inspect preparation issues.');
    if (plan.launch) return plan.launch;
    for (const source of plan.sources) if (owners.has(key(source.owner))) throw new Error('Task already has a batch request.');
    for (const source of plan.sources) owners.add(key(source.owner));
    plan.launch = queue.enqueue({ ...scope, sources: plan.sources }).catch(error => {
      for (const source of plan.sources) owners.delete(key(source.owner));
      throw error;
    });
    return plan.launch;
  }

  function cancel(id) {
    if (cancellations.has(id)) return cancellations.get(id).promise;
    const cancellation = { failed: false, promise: null };
    cancellation.promise = queue.cancel(id).then(job => {
      if (job && terminal(job.state)) owners.delete(key(job.sourceSnapshot.owner));
      cancellations.delete(id);
      return job;
    }, error => {
      cancellation.failed = true;
      throw error;
    });
    cancellations.set(id, cancellation);
    return cancellation.promise;
  }

  async function retry(id) {
    if (disposed) throw new Error('Workspace batch has been disposed.');
    const job = (await queue.list(scope)).find(item => item.id === id);
    if (!job || job.state !== 'failed') throw new Error('Only failed jobs can be retried.');
    try { validateSource({ ...job.sourceSnapshot.owner, snapshot: sourceSnapshot(job.sourceSnapshot) }); }
    catch (error) { return queue.retryFailed(id, { validate: () => { throw error; } }); }
    const ownerKey = key(job.sourceSnapshot.owner);
    if (owners.has(ownerKey)) throw new Error('Task already has a batch request.');
    owners.add(ownerKey);
    try { return await queue.retryFailed(id); }
    catch (error) { owners.delete(ownerKey); throw error; }
  }

  return {
    prepare, launch, cancel, retry,
    list: () => queue.list(scope),
    recover: () => {
      if (disposed) throw new Error('Workspace batch has been disposed.');
      return queue.resume(scope, { restartInterrupted: false });
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        const jobs = await queue.list(scope);
        const pending = new Set([...cancellations.values()].map(cancellation => cancellation.promise));
        for (const job of jobs) if (!terminal(job.state)) pending.add(cancel(job.id));
        const settled = await Promise.allSettled(pending);
        const errors = settled.filter(result => result.status === 'rejected').map(result => result.reason);
        if (errors.length) throw new AggregateError(errors, 'Workspace batch transport shutdown failed.');
      })();
      return disposal;
    },
  };
}
