import { analyzeImageData } from "./image-analysis.js";

function controllerError(code, message) {
  const error = new Error(message);
  error.name = "ImageAnalysisControllerError";
  error.code = code;
  return error;
}

function workerError(payload) {
  const error = new Error(payload?.message || "Image analysis failed.");
  error.name = "ImageAnalysisError";
  error.code = payload?.code || "ANALYSIS_FAILED";
  if (Number.isFinite(payload?.inkRatio)) error.inkRatio = payload.inkRatio;
  return error;
}

export function createImageAnalysisController({
  WorkerClass = typeof Worker === "function" ? Worker : null,
  workerUrl = new URL("./image-analysis-worker.js", import.meta.url),
  fallbackAnalyze = analyzeImageData,
  scheduleFallback = (callback) => setTimeout(callback, 0),
  cancelFallback = (timer) => clearTimeout(timer),
  workerReadyTimeoutMs = 5000,
  scheduleWorkerTimeout = (callback, delay) => setTimeout(callback, delay),
  cancelWorkerTimeout = (timer) => clearTimeout(timer),
} = {}) {
  let nextJobId = 0;
  let active = null;
  let closed = false;
  let currentMode = WorkerClass ? "worker" : "fallback";

  function stopActive(code) {
    if (!active) return;
    const pending = active;
    active = null;
    if (pending.worker) pending.worker.terminate();
    if (pending.timer !== null) cancelFallback(pending.timer);
    if (pending.readyTimer !== null) cancelWorkerTimeout(pending.readyTimer);
    pending.reject(controllerError(code, code === "SUPERSEDED" ? "Image analysis was superseded." : "Image analysis was cancelled."));
  }

  function analyze(payload) {
    if (closed) return Promise.reject(controllerError("CONTROLLER_CLOSED", "Image analysis controller is closed."));
    stopActive("SUPERSEDED");
    const jobId = ++nextJobId;

    return new Promise((resolve, reject) => {
      const pending = { jobId, reject, worker: null, timer: null, readyTimer: null };
      active = pending;

      const settle = (callback) => {
        if (active !== pending) return;
        active = null;
        if (pending.worker) pending.worker.terminate();
        if (pending.readyTimer !== null) cancelWorkerTimeout(pending.readyTimer);
        callback();
      };

      const startFallback = () => {
        if (active !== pending) return;
        if (pending.worker) pending.worker.terminate();
        pending.worker = null;
        if (pending.readyTimer !== null) {
          cancelWorkerTimeout(pending.readyTimer);
          pending.readyTimer = null;
        }
        currentMode = "fallback";
        pending.timer = scheduleFallback(() => {
          pending.timer = null;
          if (active !== pending) return;
          try {
            const value = fallbackAnalyze(payload);
            settle(() => resolve({ ...value, mode: "fallback", jobId }));
          } catch (error) {
            settle(() => reject(error));
          }
        });
      };

      if (!WorkerClass) {
        startFallback();
        return;
      }

      let worker;
      try {
        worker = new WorkerClass(workerUrl, { type: "module", name: `image-analysis-${jobId}` });
      } catch {
        startFallback();
        return;
      }

      try {
        pending.worker = worker;
        pending.started = false;
        worker.onmessage = ({ data }) => {
          if (active !== pending) return;
          if (data?.type === "ready" && !pending.started) {
            if (pending.readyTimer !== null) {
              cancelWorkerTimeout(pending.readyTimer);
              pending.readyTimer = null;
            }
            const view = payload.data instanceof Uint8Array
              ? payload.data
              : new Uint8ClampedArray(payload.data);
            const transferable = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
              ? view
              : view.slice();
            worker.postMessage({
              jobId,
              width: payload.width,
              height: payload.height,
              buffer: transferable.buffer,
              options: payload.options || {},
            }, [transferable.buffer]);
            pending.started = true;
            currentMode = "worker";
            return;
          }
          if (data?.jobId !== jobId) return;
          if (!data.ok) {
            settle(() => reject(workerError(data.error)));
            return;
          }
          settle(() => resolve({ ...data.value, mode: "worker", jobId }));
        };
        worker.onerror = (event) => {
          event?.preventDefault?.();
          if (!pending.started) {
            startFallback();
            return;
          }
          settle(() => reject(controllerError("WORKER_FAILED", event?.message || "Image analysis worker failed.")));
        };
        pending.readyTimer = scheduleWorkerTimeout(() => startFallback(), workerReadyTimeoutMs);
      } catch (error) {
        if (pending.worker) pending.worker.terminate();
        settle(() => reject(controllerError("WORKER_FAILED", error?.message || "Image analysis worker failed.")));
      }
    });
  }

  return {
    analyze,
    cancel() { stopActive("CANCELLED"); },
    suspend() { stopActive("CANCELLED"); },
    close() {
      if (closed) return;
      closed = true;
      stopActive("CANCELLED");
    },
    get mode() { return currentMode; },
  };
}
