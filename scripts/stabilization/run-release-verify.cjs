const { spawnSync } = require("node:child_process");
const path = require("node:path");

const RECEIPT_SCHEMA = "5e-release-gate-v1";
const root = path.resolve(__dirname, "..", "..");
const gates = Object.freeze([
  { name: "unit", args: ["test"] },
  { name: "graph", args: ["run", "test:graph"] },
  { name: "stabilization-harness", args: ["run", "test:stabilization-harness"] },
  { name: "source-electron-smoke", args: ["run", "test:desktop"] },
  { name: "strict-graph-audit", args: ["run", "audit:exam-graphs:strict"] },
  { name: "strict-package-source-audit", args: ["run", "audit:package-assets:strict"] },
  { name: "npm-audit-high", args: ["audit", "--audit-level=high"] },
]);

function receipt(fields) {
  process.stdout.write(`${JSON.stringify({ schema: RECEIPT_SCHEMA, ...fields })}\n`);
}

function npmInvocation(args) {
  if (process.platform === "win32") {
    return {
      file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }
  return { file: "npm", args };
}

function run() {
  const startedAt = new Date().toISOString();
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    const command = ["npm", ...gate.args].join(" ");
    receipt({ gate: gate.name, state: "started", command, ordinal: index + 1, startedAt: new Date().toISOString() });
    const invocation = npmInvocation(gate.args);
    const result = spawnSync(invocation.file, invocation.args, { cwd: root, stdio: "inherit" });
    const exitCode = result.error ? 1 : (result.status ?? 1);
    if (exitCode !== 0) {
      receipt({ gate: gate.name, state: "failed", command, ordinal: index + 1, exitCode, error: result.error?.code });
      return exitCode;
    }
    receipt({ gate: gate.name, state: "passed", command, ordinal: index + 1, exitCode: 0 });
  }
  receipt({ state: "complete", gateCount: gates.length, exitCode: 0, startedAt, finishedAt: new Date().toISOString() });
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { RECEIPT_SCHEMA, gates, run };
