import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export const DEFAULT_CANDIDATE_TIMEOUT_MS = 120_000;
export const MAX_CANDIDATE_TIMEOUT_MS = 300_000;

const OUTPUT_TAIL_BYTES = 16_384;
const FORCE_KILL_GRACE_MS = 1_000;

function appendTail(current, chunk) {
  return (current + chunk.toString()).slice(-OUTPUT_TAIL_BYTES);
}

function appendTerminationError(termination, error) {
  const message = typeof error?.message === "string" ? error.message : String(error);
  termination.error = termination.error ? `${termination.error}; ${message}` : message;
}

function signalPosixProcessTree(child, signal, termination) {
  try {
    process.kill(-child.pid, signal);
  } catch (groupError) {
    if (groupError?.code === "ESRCH") return;
    appendTerminationError(termination, groupError);
    try {
      child.kill(signal);
      termination.fallback = "child-only";
    } catch (childError) {
      if (childError?.code !== "ESRCH") appendTerminationError(termination, childError);
    }
  }
}

function terminateWindowsProcessTree(child, termination) {
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  killer.once("error", error => {
    appendTerminationError(termination, error);
    try {
      child.kill("SIGKILL");
      termination.fallback = "child-only";
    } catch (childError) {
      if (childError?.code !== "ESRCH") appendTerminationError(termination, childError);
    }
  });
  killer.unref();
}

/** Runs one Node benchmark worker with a hard deadline and tree termination. */
export function runCandidateProcess(script, argumentsList, {
  cwd,
  timeoutMs = DEFAULT_CANDIDATE_TIMEOUT_MS,
  timeoutSignal,
  stdout = process.stdout,
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_CANDIDATE_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be an integer from 1 to ${MAX_CANDIDATE_TIMEOUT_MS}`);
  }
  const deadline = timeoutSignal ?? AbortSignal.timeout(timeoutMs);
  if (!deadline || typeof deadline.addEventListener !== "function") {
    throw new TypeError("timeoutSignal must be an AbortSignal");
  }

  return new Promise(resolve => {
    const startedAt = performance.now();
    let child;
    let stderr = "";
    let stdoutTail = "";
    let settled = false;
    let timedOut = false;
    let termination = null;
    let forceKillTimer = null;
    let hardStopTimer = null;

    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(forceKillTimer);
      clearTimeout(hardStopTimer);
      deadline.removeEventListener("abort", onTimeout);
      resolve({
        ...result,
        timedOut,
        timeoutMs,
        termination,
        wallMs: Number((performance.now() - startedAt).toFixed(3)),
        stderr,
        stdout: stdoutTail,
      });
    };
    const scheduleHardStop = () => {
      hardStopTimer = setTimeout(() => {
        if (settled) return;
        appendTerminationError(termination, "Candidate process tree did not report exit after forced termination.");
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
        finish({ exitCode: null, signal: null, spawnError: "Process-tree termination did not produce a close event." });
      }, FORCE_KILL_GRACE_MS * 2);
    };
    const onTimeout = () => {
      if (settled || timedOut) return;
      timedOut = true;
      termination = {
        method: process.platform === "win32" ? "windows-taskkill-tree" : "posix-process-group",
        targetPid: child?.pid ?? null,
        initialSignal: process.platform === "win32" ? "TASKKILL_FORCE" : "SIGTERM",
        forceKillUsed: process.platform === "win32",
        forceSignal: null,
        fallback: null,
        exitObserved: false,
        error: null,
      };
      if (!child?.pid) {
        termination.error = "Candidate process had no PID to terminate.";
        return;
      }
      scheduleHardStop();
      if (process.platform === "win32") {
        terminateWindowsProcessTree(child, termination);
        forceKillTimer = setTimeout(() => {
          if (settled) return;
          try {
            child.kill("SIGKILL");
            termination.fallback = "child-only";
          } catch (error) {
            if (error?.code !== "ESRCH") appendTerminationError(termination, error);
          }
        }, FORCE_KILL_GRACE_MS);
        return;
      }
      signalPosixProcessTree(child, "SIGTERM", termination);
      forceKillTimer = setTimeout(() => {
        if (settled) return;
        termination.forceKillUsed = true;
        termination.forceSignal = "SIGKILL";
        signalPosixProcessTree(child, "SIGKILL", termination);
      }, FORCE_KILL_GRACE_MS);
    };

    try {
      child = spawn(process.execPath, [script, ...argumentsList], {
        cwd,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      finish({ exitCode: null, signal: null, spawnError: error.message });
      return;
    }
    child.stdout.on("data", chunk => {
      stdoutTail = appendTail(stdoutTail, chunk);
      stdout?.write?.(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr = appendTail(stderr, chunk);
    });
    child.once("error", error => finish({ exitCode: null, signal: null, spawnError: error.message }));
    child.once("close", (exitCode, signal) => {
      if (termination) termination.exitObserved = true;
      finish({ exitCode, signal, spawnError: null });
    });
    deadline.addEventListener("abort", onTimeout, { once: true });
    if (deadline.aborted) onTimeout();
  });
}
