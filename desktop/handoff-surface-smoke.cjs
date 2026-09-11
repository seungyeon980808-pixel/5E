const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electron = require("electron");
const resultPath = process.env.FIVE_E_HANDOFF_EVIDENCE || path.join(os.tmpdir(), `5e-handoff-surface-${process.pid}.json`);
const screenshotPath = process.env.FIVE_E_HANDOFF_SCREENSHOT || "";
const run = spawnSync(electron, [root, "--no-sandbox", "--disable-gpu", "--disable-gpu-compositing"], {
  cwd: root,
  env: {
    ...process.env,
    FIVE_E_HANDOFF_SMOKE_TEST: "1",
    FIVE_E_HANDOFF_SMOKE_RESULT: resultPath,
    FIVE_E_HANDOFF_SMOKE_SCREENSHOT: screenshotPath,
    FIVE_E_SMOKE_USER_DATA: path.join(os.tmpdir(), `5e-handoff-profile-${process.pid}`),
    FIVE_E_DISABLE_GPU: "1",
  },
  encoding: "utf8",
  timeout: 30_000,
});

const report = JSON.parse(fs.readFileSync(resultPath, "utf8"));
if (run.error) throw run.error;
if (run.status !== 0 || report.ok !== true) throw new Error(`Electron handoff surface failed: ${JSON.stringify(report)}`);
console.log(JSON.stringify(report));
