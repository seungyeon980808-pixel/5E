import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverScript = path.join(root, "tools", "pdf-library", "serve-staged-distribution.mjs");
const candidateServerScript = path.join(root, "tools", "pdf-library", "serve-deployment-candidate.mjs");

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForStart(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Stage server did not start: ${output}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (!output.includes("\n")) return;
      clearTimeout(timeout);
      resolve(JSON.parse(output));
    });
    child.once("error", reject);
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => reject(new Error(`Stage server exited ${code}: ${output}`)));
  });
}

test("Given a separate staged app and PDF pack host, when PDF runtime and pack assets are fetched, then modules, catalog CORS, and PDF ranges satisfy browser loading", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "5e-stage-server-"));
  const app = path.join(directory, "app");
  const pack = path.join(directory, "pack");
  await Promise.all([
    mkdir(path.join(app, "vendor", "pdfjs"), { recursive: true }),
    mkdir(path.join(pack, "documents"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(app, "index.html"), "<!doctype html>"),
    writeFile(path.join(app, "vendor", "pdfjs", "pdf.mjs"), "export const ready = true;"),
    writeFile(path.join(pack, "catalog.json"), "{}"),
    writeFile(path.join(pack, "documents", "sample.pdf"), "%PDF-test"),
  ]);
  const [appPort, packPort] = await Promise.all([unusedPort(), unusedPort()]);
  const child = spawn(process.execPath, [serverScript, "--app", app, "--pack", pack, "--app-port", String(appPort), "--pack-port", String(packPort)], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  });
  await waitForStart(child);

  const [module, catalog, pdf] = await Promise.all([
    fetch(`http://127.0.0.1:${appPort}/vendor/pdfjs/pdf.mjs`),
    fetch(`http://127.0.0.1:${packPort}/catalog.json`, { headers: { Origin: `http://127.0.0.1:${appPort}` } }),
    fetch(`http://127.0.0.1:${packPort}/documents/sample.pdf`, { headers: { Origin: `http://127.0.0.1:${appPort}`, Range: "bytes=0-3" } }),
  ]);
  assert.match(module.headers.get("content-type") || "", /^text\/javascript/);
  assert.equal(catalog.headers.get("access-control-allow-origin"), `http://127.0.0.1:${appPort}`);
  assert.equal(pdf.status, 206);
  assert.equal(pdf.headers.get("content-range"), "bytes 0-3/9");
  assert.equal(await pdf.text(), "%PDF");
});

test("Given a portable candidate, when served on one port, then its relative app and pack paths resolve with PDF range support", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "5e-portable-candidate-"));
  await Promise.all([
    mkdir(path.join(directory, "app"), { recursive: true }),
    mkdir(path.join(directory, "pack", "recent-three", "documents"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(directory, "app", "index.html"), "<!doctype html>"),
    writeFile(path.join(directory, "pack", "recent-three", "pack.json"), "{}"),
    writeFile(path.join(directory, "pack", "recent-three", "documents", "sample.pdf"), "%PDF-test"),
  ]);
  const port = await unusedPort();
  const child = spawn(process.execPath, [candidateServerScript, "--candidate", directory, "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    child.kill();
    await rm(directory, { recursive: true, force: true });
  });
  await waitForStart(child);

  const [page, manifest, pdf] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/app/index.html`),
    fetch(`http://127.0.0.1:${port}/pack/recent-three/pack.json`),
    fetch(`http://127.0.0.1:${port}/pack/recent-three/documents/sample.pdf`, { headers: { Range: "bytes=0-3" } }),
  ]);

  assert.equal(page.status, 200);
  assert.equal(manifest.status, 200);
  assert.equal(pdf.status, 206);
  assert.equal(await pdf.text(), "%PDF");
});
