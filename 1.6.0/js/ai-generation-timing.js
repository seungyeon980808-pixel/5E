const VERSION = 1;
const ACTIVE_PHASES = new Set([
  'accepted',
  'image-generating',
  'image-received',
  'postprocessing',
  'awaiting-terminal',
]);
const OUTCOMES = new Set(['completed', 'no-image', 'failed', 'cancelled', 'interrupted']);
const SNAPSHOT_FIELDS = [
  'version',
  'turnId',
  'startedAtMs',
  'lastElapsedMs',
  'endedAtMs',
  'phase',
  'outcome',
  'imageReceived',
  'postprocessPending',
  'terminalOutcome',
];

const unavailableView = Object.freeze({
  available: false,
  running: false,
  elapsedMs: null,
  formatted: null,
  phase: null,
  outcome: null,
});

const isTimestamp = value => Number.isFinite(value) && value >= 0;
const isElapsed = value => Number.isFinite(value) && value >= 0;
const isTurnId = value => typeof value === 'string' && value.trim().length > 0;

function elapsedAt(timing, nowMs) {
  const clockElapsed = isTimestamp(nowMs) ? nowMs - timing.startedAtMs : 0;
  return Math.max(0, timing.lastElapsedMs, clockElapsed);
}

function withElapsed(timing, nowMs) {
  const lastElapsedMs = elapsedAt(timing, nowMs);
  return lastElapsedMs === timing.lastElapsedMs ? timing : { ...timing, lastElapsedMs };
}

function freeze(timing, outcome, nowMs) {
  const current = withElapsed(timing, nowMs);
  const endedAtMs = isTimestamp(nowMs)
    ? Math.max(current.startedAtMs, nowMs)
    : current.startedAtMs + current.lastElapsedMs;
  return {
    ...current,
    endedAtMs,
    phase: 'terminal',
    outcome,
    postprocessPending: false,
    terminalOutcome: outcome,
  };
}

function normalizeSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!SNAPSHOT_FIELDS.every(field => Object.hasOwn(value, field))) return null;
  if (value.version !== VERSION || !isTurnId(value.turnId)) return null;
  if (!isTimestamp(value.startedAtMs) || !isElapsed(value.lastElapsedMs)) return null;
  if (value.endedAtMs !== null && !isTimestamp(value.endedAtMs)) return null;
  if (typeof value.imageReceived !== 'boolean' || typeof value.postprocessPending !== 'boolean') return null;

  const terminal = value.phase === 'terminal';
  if (!terminal && !ACTIVE_PHASES.has(value.phase)) return null;
  if (terminal && !OUTCOMES.has(value.outcome)) return null;
  if (!terminal && value.outcome !== null) return null;
  if (!terminal && value.endedAtMs !== null) return null;
  if (value.terminalOutcome !== null && !OUTCOMES.has(value.terminalOutcome)) return null;
  if (terminal && value.terminalOutcome !== value.outcome) return null;
  if (!terminal && ![null, 'completed'].includes(value.terminalOutcome)) return null;
  if (value.postprocessPending && !value.imageReceived) return null;
  if (terminal && value.postprocessPending) return null;
  if (['accepted', 'image-generating'].includes(value.phase) && value.imageReceived) return null;
  if (['image-received', 'postprocessing', 'awaiting-terminal'].includes(value.phase) && !value.imageReceived) return null;
  if (['image-received', 'postprocessing'].includes(value.phase) && !value.postprocessPending) return null;
  if (value.phase === 'awaiting-terminal' && (value.postprocessPending || value.terminalOutcome !== null)) return null;
  if (!terminal && value.terminalOutcome === 'completed'
    && (!value.imageReceived || !value.postprocessPending
      || !['image-received', 'postprocessing'].includes(value.phase))) return null;
  if (terminal && value.outcome === 'completed' && !value.imageReceived) return null;
  if (terminal && value.outcome === 'no-image' && value.imageReceived) return null;
  if (terminal && value.outcome !== 'interrupted' && value.endedAtMs === null) return null;

  return {
    version: VERSION,
    turnId: value.turnId,
    startedAtMs: value.startedAtMs,
    lastElapsedMs: value.lastElapsedMs,
    endedAtMs: value.endedAtMs,
    phase: value.phase,
    outcome: value.outcome,
    imageReceived: value.imageReceived,
    postprocessPending: value.postprocessPending,
    terminalOutcome: value.terminalOutcome,
  };
}

export function startGenerationTiming({ turnId, acceptedAtMs } = {}) {
  if (!isTurnId(turnId)) throw new TypeError('A generation turn id is required.');
  if (!isTimestamp(acceptedAtMs)) throw new TypeError('A finite runtime acceptance timestamp is required.');
  return {
    version: VERSION,
    turnId,
    startedAtMs: acceptedAtMs,
    lastElapsedMs: 0,
    endedAtMs: null,
    phase: 'accepted',
    outcome: null,
    imageReceived: false,
    postprocessPending: false,
    terminalOutcome: null,
  };
}

export function advanceGenerationTiming(timing, event, nowMs) {
  if (!timing || timing.phase === 'terminal') return timing;
  if (!event || event.turnId !== timing.turnId) return timing;

  if (event.type === 'image-started') {
    if (!['accepted', 'image-generating'].includes(timing.phase)) return timing;
    return { ...withElapsed(timing, nowMs), phase: 'image-generating' };
  }
  if (event.type === 'image-received') {
    if (timing.imageReceived) return timing;
    return {
      ...withElapsed(timing, nowMs),
      phase: 'image-received',
      imageReceived: true,
      postprocessPending: true,
    };
  }
  if (event.type === 'postprocess-started') {
    if (!timing.imageReceived || !timing.postprocessPending) return timing;
    return {
      ...withElapsed(timing, nowMs),
      phase: 'postprocessing',
      postprocessPending: true,
    };
  }
  if (event.type === 'postprocess-completed') {
    if (!timing.imageReceived || !timing.postprocessPending) return timing;
    const ready = {
      ...withElapsed(timing, nowMs),
      phase: 'awaiting-terminal',
      postprocessPending: false,
    };
    return ready.terminalOutcome === 'completed' ? freeze(ready, 'completed', nowMs) : ready;
  }
  if (event.type === 'postprocess-failed') {
    return timing.imageReceived && timing.postprocessPending ? freeze(timing, 'failed', nowMs) : timing;
  }
  if (event.type !== 'turn-terminal' || !OUTCOMES.has(event.outcome)) return timing;

  if (event.outcome !== 'completed') return freeze(timing, event.outcome, nowMs);
  if (!timing.imageReceived) return freeze(timing, 'no-image', nowMs);
  if (!timing.postprocessPending) return freeze(timing, 'completed', nowMs);
  return { ...withElapsed(timing, nowMs), terminalOutcome: 'completed' };
}

export function serializeGenerationTiming(timing, nowMs) {
  const normalized = normalizeSnapshot(timing);
  if (!normalized) return null;
  return normalized.phase === 'terminal' ? normalized : withElapsed(normalized, nowMs);
}

export function restoreGenerationTiming(value, { interruptRunning = true } = {}) {
  const timing = normalizeSnapshot(value);
  if (!timing || timing.phase === 'terminal' || !interruptRunning) return timing;
  return {
    ...timing,
    endedAtMs: null,
    phase: 'terminal',
    outcome: 'interrupted',
    postprocessPending: false,
    terminalOutcome: 'interrupted',
  };
}

export function sampleGenerationTiming(timing, nowMs) {
  const normalized = normalizeSnapshot(timing);
  if (!normalized) return { timing: null, view: { ...unavailableView } };
  const running = normalized.phase !== 'terminal';
  const sampled = running ? withElapsed(normalized, nowMs) : normalized;
  const elapsedMs = sampled.lastElapsedMs;
  const seconds = Math.floor(elapsedMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  return {
    timing: sampled,
    view: {
      available: true,
      running,
      elapsedMs,
      formatted: `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
      phase: sampled.phase,
      outcome: sampled.outcome,
    },
  };
}
