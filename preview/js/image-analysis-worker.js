import { analyzeImageData } from "./image-analysis.js";

self.postMessage({ type: "ready" });

self.onmessage = ({ data }) => {
  const { jobId, width, height, buffer, options } = data;
  try {
    const value = analyzeImageData({ width, height, data: buffer, options });
    self.postMessage({ jobId, ok: true, value });
  } catch (error) {
    self.postMessage({
      jobId,
      ok: false,
      error: {
        code: error?.code || "ANALYSIS_FAILED",
        message: error?.message || String(error),
        inkRatio: Number.isFinite(error?.inkRatio) ? error.inkRatio : null,
      },
    });
  }
};
