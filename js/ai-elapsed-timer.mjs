const TERMINAL_STATES = new Set(["complete", "failed", "cancelled"]);

export function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}분 ${String(seconds).padStart(2, "0")}초` : `${seconds}초`;
}

export function createMonotonicTimer({ now = () => performance.now() } = {}) {
  let status = "idle";
  let startedAt = null;
  let finalElapsedMs = 0;

  function start() {
    if (status === "running") return snapshot();
    status = "running";
    startedAt = now();
    finalElapsedMs = 0;
    return snapshot();
  }

  function elapsedMs() {
    if (status === "running" && startedAt != null) return Math.max(0, now() - startedAt);
    return finalElapsedMs;
  }

  function finish(nextStatus = "complete") {
    if (!TERMINAL_STATES.has(nextStatus)) throw new Error(`지원하지 않는 타이머 종료 상태: ${nextStatus}`);
    if (status === "running") finalElapsedMs = elapsedMs();
    status = nextStatus;
    startedAt = null;
    return finalElapsedMs;
  }

  function snapshot() {
    return {
      status,
      startedAt,
      finalElapsedMs: status === "running" ? elapsedMs() : finalElapsedMs,
    };
  }

  function restore(saved) {
    status = saved?.status || "idle";
    startedAt = status === "running" && Number.isFinite(saved?.startedAt) ? saved.startedAt : null;
    finalElapsedMs = Number(saved?.finalElapsedMs) || 0;
  }

  return { elapsedMs, finish, restore, snapshot, start };
}

export function createElapsedTicker({
  schedule = (callback) => setInterval(callback, 250),
  cancel = (id) => clearInterval(id),
  render,
} = {}) {
  let tickerId = null;
  return {
    start() {
      if (tickerId != null) return;
      render?.();
      tickerId = schedule(() => render?.());
    },
    stop() {
      if (tickerId == null) return;
      cancel(tickerId);
      tickerId = null;
    },
  };
}
