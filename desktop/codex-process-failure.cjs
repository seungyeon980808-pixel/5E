function exitDescription(code, signal) {
  if (code != null) return `exit code ${code}`;
  if (signal) return `signal ${signal}`;
  return "unknown reason";
}

/**
 * Build the renderer-facing terminal signal for an unexpected App Server loss.
 * An exit caused deliberately by the image-turn recovery path is suppressed;
 * that path emits its own `recovered`/`recoveryFailed` finalization signal.
 */
function createProcessFailureFinalization({
  activeTurnId = null,
  recoveryTerminatingTurnId = null,
  error = null,
  code = null,
  signal = null,
} = {}) {
  if (!activeTurnId || activeTurnId === recoveryTerminatingTurnId) return null;
  const message = error?.message
    ? String(error.message)
    : `Codex App Server exited (${exitDescription(code, signal)}).`;
  return {
    turnId: activeTurnId,
    state: "recoveryFailed",
    status: "failed",
    message,
  };
}

module.exports = {
  createProcessFailureFinalization,
  exitDescription,
};
