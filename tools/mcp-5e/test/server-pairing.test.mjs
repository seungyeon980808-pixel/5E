import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("MCP stdio exposes a per-process app pairing record without writing it to arguments", async () => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "app_pairing", arguments: {} },
    })}\n`);
    const deadline = Date.now() + 3000;
    while (!stdout.includes("\n") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.doesNotMatch(stderr, /(?:Error|ERR_)/);
    const response = JSON.parse(stdout.trim().split("\n")[0]);
    const text = response.result.content[0].text;
    assert.match(text, /mcp-5e:\/\/127\.0\.0\.1:85(?:79|80|81|82|83)\/#[-_A-Za-z0-9]{43}/);
    assert.equal(child.spawnargs.some((argument) => /mcp-5e:\/\//.test(argument)), false);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
});
