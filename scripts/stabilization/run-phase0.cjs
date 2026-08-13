const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const steps = Object.freeze([
  ["test"],
  ["run", "test:graph"],
  ["run", "test:stabilization-harness"],
  ["run", "test:desktop"],
  ["run", "audit:exam-graphs:strict"],
  ["run", "audit:package-assets"],
]);

for (const args of steps) {
  const invocation = process.platform === "win32"
    ? { file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { file: "npm", args };
  const result = spawnSync(invocation.file, invocation.args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
