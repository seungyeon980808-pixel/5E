import { isBatchRecord, parseBatchSource } from './ai-batch-source.js?v=1.6.0-preview-labeler-0917-1111';

const STATES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const clone = value => structuredClone(value);
const scopeKey = scope => JSON.stringify([String(scope.sessionId || ''), String(scope.workspaceId || '')]);

function parseRecord(value, scope) {
  if (!isBatchRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id || !STATES.has(value.state)) return null;
  if (!Number.isInteger(value.attempt) || value.attempt < 1) return null;
  if (!isBatchRecord(value.timestamps)) return null;
  if (value.sessionId !== scope.sessionId || value.workspaceId !== scope.workspaceId) return null;
  try {
    const parsed = parseBatchSource(value.sourceSnapshot, value.options);
    return clone({ ...value, sourceSnapshot: parsed.snapshot, options: parsed.options, eventIds: Array.isArray(value.eventIds) ? value.eventIds.filter(id => typeof id === 'string') : [] });
  }
  catch { return null; }
}

function freshId() {
  return globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBatchQueue({ store, generation, output, maxRunning = 10, now = Date.now, createId = freshId } = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') throw new TypeError('Batch queue requires a store.');
  if (!generation || typeof generation.start !== 'function') throw new TypeError('Batch queue requires a generation adapter.');
  if (!Number.isInteger(maxRunning) || maxRunning < 1) throw new RangeError('maxRunning must be a positive integer.');
  const jobs = new Map();
  const scopes = new Map();
  let operations = Promise.resolve();

  const serialize = action => {
    const next = operations.then(action, action);
    operations = next.then(() => undefined, () => undefined);
    return next;
  };

  const mutate = action => serialize(async () => {
    const previousJobs = clone(Array.from(jobs.entries()));
    const previousScopes = clone(Array.from(scopes.entries()));
    try { return await action(); }
    catch (error) {
      jobs.clear();
      scopes.clear();
      for (const [id, job] of previousJobs) jobs.set(id, job);
      for (const [key, ids] of previousScopes) scopes.set(key, ids);
      throw error;
    }
  });

  function scopeOf(job) {
    return { sessionId: job.sessionId, workspaceId: job.workspaceId };
  }

  function jobsIn(scope) {
    return (scopes.get(scopeKey(scope)) || []).map(id => jobs.get(id)).filter(Boolean);
  }

  async function persistAll() {
    for (const ids of scopes.values()) {
      const records = ids.map(id => jobs.get(id)).filter(Boolean);
      if (records.length) await store.save(scopeOf(records[0]), records);
    }
  }

  function beginQueuedJobs() {
    const starts = [];
    let running = Array.from(jobs.values()).filter(job => job.state === 'running').length;
    for (const job of jobs.values()) {
      if (running >= maxRunning) break;
      if (job.state !== 'queued') continue;
      const timestamp = now();
      job.state = 'running';
      job.timestamps.startedAt = timestamp;
      job.timestamps.updatedAt = timestamp;
      starts.push(clone(job));
      running += 1;
    }
    return starts;
  }

  function launch(started) {
    for (const snapshot of started) {
      const emit = event => handleEvent({ ...event, jobId: snapshot.id, attempt: snapshot.attempt });
      try {
        const returned = generation.start(snapshot, emit);
        if (returned !== undefined) {
          void Promise.resolve(returned).then(
            result => handleEvent({ jobId: snapshot.id, attempt: snapshot.attempt, type: 'completed', result }),
            error => handleEvent({ jobId: snapshot.id, attempt: snapshot.attempt, type: 'failed', error: error instanceof Error ? error.message : String(error) }),
          );
        }
      } catch (error) {
        void handleEvent({ jobId: snapshot.id, attempt: snapshot.attempt, type: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  async function settleAndPump() {
    const started = beginQueuedJobs();
    await persistAll();
    launch(started);
  }

  async function enqueue({ sessionId, workspaceId, sources, options = {} } = {}) {
    return mutate(async () => {
      if (typeof sessionId !== 'string' || typeof workspaceId !== 'string') throw new TypeError('Batch scope requires string sessionId and workspaceId.');
      if (!Array.isArray(sources) || sources.length === 0) throw new TypeError('Batch sources must be a non-empty array.');
      const parsedSources = sources.map(source => parseBatchSource(source, options));
      const scope = { sessionId, workspaceId };
      const key = scopeKey(scope);
      const ids = scopes.get(key) || [];
      const created = parsedSources.map(parsed => {
        const timestamp = now();
        const record = {
          id: createId(), sessionId, workspaceId,
          sourceSnapshot: parsed.snapshot, options: parsed.options,
          state: 'queued', attempt: 1, result: null, error: null, eventIds: [],
          timestamps: { createdAt: timestamp, queuedAt: timestamp, startedAt: null, completedAt: null, failedAt: null, cancelledAt: null, updatedAt: timestamp },
        };
        jobs.set(record.id, record);
        ids.push(record.id);
        return record;
      });
      scopes.set(key, ids);
      await settleAndPump();
      return created.map(record => clone(jobs.get(record.id)));
    });
  }

  async function list(scope) {
    await operations;
    return jobsIn(scope).map(clone);
  }

  async function cancel(jobId) {
    return mutate(async () => {
      const job = jobs.get(jobId);
      if (!job || TERMINAL_STATES.has(job.state)) return job ? clone(job) : null;
      const wasRunning = job.state === 'running';
      const interruptSnapshot = clone(job);
      const timestamp = now();
      job.state = 'cancelled';
      job.timestamps.cancelledAt = timestamp;
      job.timestamps.updatedAt = timestamp;
      await settleAndPump();
      if (wasRunning && typeof generation.interrupt === 'function') {
        try { void Promise.resolve(generation.interrupt(interruptSnapshot)).catch(() => {}); } catch {}
      }
      return clone(job);
    });
  }

  async function retryFailed(jobId) {
    return mutate(async () => {
      const job = jobs.get(jobId);
      if (!job || job.state !== 'failed') throw new Error('Only failed jobs can be retried.');
      const timestamp = now();
      job.state = 'queued';
      job.attempt += 1;
      job.result = null;
      job.error = null;
      job.eventIds = [];
      job.timestamps.queuedAt = timestamp;
      job.timestamps.startedAt = null;
      job.timestamps.failedAt = null;
      job.timestamps.updatedAt = timestamp;
      await settleAndPump();
      return clone(job);
    });
  }

  async function handleEvent(event = {}) {
    return mutate(async () => {
      const job = jobs.get(event.jobId);
      if (!job || job.state !== 'running' || event.attempt !== job.attempt) return null;
      if (event.eventId && job.eventIds.includes(event.eventId)) return clone(job);
      if (event.eventId) job.eventIds.push(event.eventId);
      const timestamp = now();
      if (event.type === 'progress') {
        job.progress = clone(event.progress ?? null);
        job.timestamps.updatedAt = timestamp;
        await persistAll();
        return clone(job);
      }
      if (event.type === 'completed') {
        try {
          const generationResult = clone(event.result);
          const outputResult = output?.write ? await output.write({ job: clone(job), result: generationResult }) : null;
          job.result = { generation: generationResult, output: outputResult == null ? null : clone(outputResult) };
          job.state = 'completed';
          job.timestamps.completedAt = timestamp;
        } catch (error) {
          job.state = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          job.timestamps.failedAt = timestamp;
        }
      } else if (event.type === 'failed') {
        job.state = 'failed';
        job.error = typeof event.error === 'string' ? event.error : 'Generation failed';
        job.timestamps.failedAt = timestamp;
      } else {
        return clone(job);
      }
      job.timestamps.updatedAt = timestamp;
      await settleAndPump();
      return clone(job);
    });
  }

  async function resume(scope) {
    return mutate(async () => {
      const key = scopeKey(scope);
      if (!scopes.has(key)) {
        const loaded = await store.load(scope);
        const ids = [];
        for (const value of Array.isArray(loaded) ? loaded : []) {
          const record = parseRecord(value, scope);
          if (!record || jobs.has(record.id)) continue;
          if (record.state === 'running') {
            const timestamp = now();
            record.state = 'queued';
            record.attempt += 1;
            record.eventIds = [];
            record.error = null;
            record.result = null;
            record.timestamps.queuedAt = timestamp;
            record.timestamps.startedAt = null;
            record.timestamps.updatedAt = timestamp;
          }
          jobs.set(record.id, record);
          ids.push(record.id);
        }
        scopes.set(key, ids);
      }
      await settleAndPump();
      return jobsIn(scope).map(clone);
    });
  }

  return { enqueue, list, cancel, retryFailed, handleEvent, resume };
}
