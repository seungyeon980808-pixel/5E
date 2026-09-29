function abortError(reason = "Render was superseded") {
  return reason instanceof Error ? reason : new DOMException(String(reason), "AbortError");
}

export function createRenderScheduler() {
  const pending = [];
  let active = null;
  let sequence = 0;

  function settle(task, method, value) {
    if (task.settled) return;
    task.settled = true;
    task.signal?.removeEventListener("abort", task.cancel);
    method(value);
  }

  function cancel(task, reason) {
    const error = abortError(reason);
    task.controller.abort(error);
    const index = pending.indexOf(task);
    if (task !== active && index >= 0) pending.splice(index, 1);
    settle(task, task.reject, error);
  }

  function pump() {
    if (active || pending.length === 0) return;
    active = pending.shift();
    if (active.controller.signal.aborted) {
      const cancelled = active;
      active = null;
      settle(cancelled, cancelled.reject, abortError(cancelled.controller.signal.reason));
      pump();
      return;
    }
    Promise.resolve()
      .then(() => active.operation(active.controller.signal))
      .then((value) => settle(active, active.resolve, value), (error) => settle(active, active.reject, error))
      .finally(() => {
        active = null;
        pump();
      });
  }

  function run(operation, options = {}) {
    if (typeof operation !== "function") return Promise.reject(new TypeError("Render operation must be a function"));
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const task = {
        operation, priority: Number(options.priority) || 0, key: options.key ?? null,
        sequence: sequence += 1, signal: options.signal ?? null, controller, resolve, reject,
        settled: false, cancel: null,
      };
      task.cancel = () => cancel(task, task.signal?.reason);
      if (task.signal?.aborted) {
        settle(task, reject, abortError(task.signal.reason));
        return;
      }
      if (task.key !== null) {
        if (active?.key === task.key) cancel(active, "Render was superseded");
        for (const queued of [...pending]) {
          if (queued.key === task.key) cancel(queued, "Render was superseded");
        }
      }
      task.signal?.addEventListener("abort", task.cancel, { once: true });
      pending.push(task);
      pending.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
      pump();
    });
  }

  return Object.freeze({ run });
}
