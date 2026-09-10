#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MessageChannel } from "node:worker_threads";

const mode = process.argv[2];

function keepEventLoopAlive() {
  const channel = new MessageChannel();
  channel.port1.on("message", () => {});
  return channel;
}

if (mode === "success") {
  process.stdout.write("success\n");
} else if (mode === "descendant") {
  const channel = keepEventLoopAlive();
  process.once("SIGTERM", () => {
    channel.port1.close();
    channel.port2.close();
    process.stdout.write("descendant-sigterm\n", () => process.exit(0));
  });
  process.stdout.write("descendant-ready\n");
} else if (mode === "tree") {
  const fixture = fileURLToPath(import.meta.url);
  const descendant = spawn(process.execPath, [fixture, "descendant"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  let terminating = false;
  process.once("SIGTERM", () => {
    terminating = true;
    process.stdout.write("parent-sigterm\n");
  });
  descendant.once("exit", () => {
    if (terminating) process.stdout.write("parent-after-descendant\n", () => process.exit(0));
  });
  process.stdout.write("parent-ready\n");
} else {
  throw new RangeError(`Unknown benchmark process fixture mode: ${String(mode)}`);
}
