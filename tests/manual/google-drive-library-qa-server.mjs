import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writePdfPackFixture } from "../helpers/pdf-pack-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const port = Number(process.argv[2] || 48152);
const folderId = "Folder_123456789";
const packRoot = await mkdtemp(path.join(os.tmpdir(), "5e-drive-browser-qa-"));
await writePdfPackFixture(packRoot);

function mimeType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function fileBelow(base, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch { return null; }
  const candidate = path.resolve(base, `.${decoded}`);
  const relative = path.relative(base, candidate);
  return !relative.startsWith("..") && !path.isAbsolute(relative) ? candidate : null;
}

async function sendFile(response, filePath, cors = false) {
  try {
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error("not a file");
    const headers = { "content-type": mimeType(filePath), "content-length": String(details.size) };
    if (cors) headers["access-control-allow-origin"] = "*";
    response.writeHead(200, headers);
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/assets/pdf-library/google-drive.json") {
    const body = JSON.stringify({ schemaVersion: 1, gatewayBaseUrl: `http://127.0.0.1:${port}/` });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(body)) });
    response.end(body);
    return;
  }
  const gatewayPrefix = `/v1/google-drive/folders/${folderId}/public/`;
  if (url.pathname.startsWith(gatewayPrefix)) {
    const assetPath = fileBelow(packRoot, `/${url.pathname.slice(gatewayPrefix.length)}`);
    if (!assetPath || !/[.](?:json|pdf)$/iu.test(assetPath)) response.writeHead(404).end("Not found");
    else await sendFile(response, assetPath, true);
    return;
  }
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = fileBelow(root, requestPath);
  if (!filePath) response.writeHead(404).end("Not found");
  else await sendFile(response, filePath);
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
process.stdout.write(`http://127.0.0.1:${port}/index.html\n`);

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await rm(packRoot, { recursive: true, force: true });
}
process.once("SIGINT", () => void stop().then(() => process.exit(0)));
process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
