const terminalPhases = new Set(['completed', 'failed', 'cancelled']);
const phases = new Set(['preparing', 'confirmation-wait', 'generating', 'validating', ...terminalPhases]);

export function createWorkbenchRequestState({ clock = Date.now } = {}) {
  const tasks = new Map();
  let serial = 0;
  const current = token => Boolean(token && tasks.get(token.taskId)?.token === token);
  const live = token => current(token) && !terminalPhases.has(tasks.get(token.taskId).phase);
  return {
    begin(taskId, revisionId = null) {
      if (!taskId) throw new Error('A request must belong to a task.');
      const previous = tasks.get(taskId);
      if (previous && !terminalPhases.has(previous.phase)) throw new Error('This task already has a request.');
      const token = Object.freeze({ taskId, revisionId, requestId: ++serial });
      tasks.set(taskId, { token, phase: 'preparing', startedAt: clock(), endedAt: null, turnId: null, threadId: null });
      return token;
    },
    live,
    advance(token, phase) {
      if (!phases.has(phase)) throw new Error(`Unknown request phase: ${phase}`);
      if (!live(token)) return false;
      const state = tasks.get(token.taskId);
      state.phase = phase;
      if (terminalPhases.has(phase)) state.endedAt = clock();
      return true;
    },
    bind(token, { turnId, renderThreadId, threadId }) {
      if (!live(token) || !turnId) return false;
      Object.assign(tasks.get(token.taskId), { turnId, threadId: renderThreadId || threadId || null });
      return true;
    },
    accepts(token, event) {
      if (!live(token)) return false;
      const state = tasks.get(token.taskId);
      if (!state.turnId || (!event.turnId && !event.threadId)) return false;
      if (event.turnId && event.turnId !== state.turnId) return false;
      if (event.threadId && state.threadId && event.threadId !== state.threadId) return false;
      return event.turnId === state.turnId || Boolean(state.threadId && event.threadId === state.threadId);
    },
    snapshot(taskId) {
      const state = tasks.get(taskId);
      return state ? { ...state, elapsedMs: Math.max(0, (state.endedAt ?? clock()) - state.startedAt) } : null;
    },
    forget(taskId) { tasks.delete(taskId); },
  };
}
