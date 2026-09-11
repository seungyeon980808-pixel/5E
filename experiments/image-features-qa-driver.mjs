import { createHash } from "node:crypto";

const driverOrigin = process.env.FIVE_E_WEBDRIVER_ORIGIN || "http://127.0.0.1:19424";
const appUrl = process.env.FIVE_E_QA_URL || "http://127.0.0.1:19422/experiments/image-features-qa.html";

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${driverOrigin}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.value?.error) {
    throw new Error(`${method} ${path}: ${payload.value?.message || response.status}`);
  }
  return payload.value ?? payload;
}

let sessionId;
try {
  const created = await request("/session", {
    method: "POST",
    body: { capabilities: { alwaysMatch: { browserName: "safari" } } },
  });
  sessionId = created.sessionId;
  if (!sessionId) throw new Error("SafariDriver did not return a session id.");
  await request(`/session/${sessionId}/timeouts`, {
    method: "POST",
    body: { script: 30_000, pageLoad: 30_000, implicit: 0 },
  });
  await request(`/session/${sessionId}/url`, { method: "POST", body: { url: appUrl } });
  const report = await request(`/session/${sessionId}/execute/async`, {
    method: "POST",
    body: {
      script: `
        const done = arguments[arguments.length - 1];
        const finish = () => done(JSON.parse(JSON.stringify(window.__IMAGE_FEATURE_QA__)));
        if (window.__IMAGE_FEATURE_QA__?.status === "passed" ||
            window.__IMAGE_FEATURE_QA__?.status === "failed") {
          finish();
          return;
        }
        const timeout = setTimeout(() => done({ status: "timeout" }), 25000);
        window.addEventListener("image-feature-qa-complete", () => {
          clearTimeout(timeout);
          finish();
        }, { once: true });
      `,
      args: [],
    },
  });
  const screenshotBase64 = await request(`/session/${sessionId}/screenshot`);
  const screenshot = Buffer.from(screenshotBase64, "base64");
  console.log(JSON.stringify({
    browser: "Safari WebDriver",
    url: appUrl,
    report,
    screenshot: {
      bytes: screenshot.byteLength,
      sha256: createHash("sha256").update(screenshot).digest("hex"),
    },
  }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
} finally {
  if (sessionId) await request(`/session/${sessionId}`, { method: "DELETE" });
}
