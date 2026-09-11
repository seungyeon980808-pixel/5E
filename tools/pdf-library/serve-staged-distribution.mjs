import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

const appDirectory = option("--app", null);
const packDirectory = option("--pack", null);
const appRoot = appDirectory ? path.resolve(appDirectory) : null;
const packRoot = packDirectory ? path.resolve(packDirectory) : null;
const appPort = Number(option("--app-port", "4175"));
const packPort = Number(option("--pack-port", "4174"));
if (!appRoot || !packRoot || !Number.isInteger(appPort) || !Number.isInteger(packPort)) {
  throw new Error("Usage: node tools/pdf-library/serve-staged-distribution.mjs --app STAGE --pack PACK [--app-port 4175] [--pack-port 4174]");
}

function target(root, requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const resolved = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".pfb": "application/x-font-type1",
    ".gz": "application/gzip",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function sendFile(root, request, response, { corsOrigin = null } = {}) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } : {});
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  const file = target(root, request.url || "/");
  try {
    if (!file) throw new Error("outside root");
    await access(file);
    const details = await stat(file);
    if (!details.isFile()) throw new Error("not a file");
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
    let start = 0;
    let end = details.size - 1;
    if (range) {
      start = range[1] === "" ? Math.max(0, details.size - Number(range[2])) : Number(range[1]);
      end = range[2] === "" ? end : Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= details.size) {
        response.writeHead(416, { "Content-Range": `bytes */${details.size}` }).end();
        return;
      }
      end = Math.min(end, details.size - 1);
    }
    const headers = {
      "Content-Length": end - start + 1,
      "Content-Type": contentType(file),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}),
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${details.size}`;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(file, { start, end }).pipe(response);
  } catch {
    response.writeHead(404, corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin } : {}).end();
  }
}

const appOrigin = `http://127.0.0.1:${appPort}`;
const app = createServer((request, response) => sendFile(appRoot, request, response));
const pack = createServer((request, response) => sendFile(packRoot, request, response, { corsOrigin: appOrigin }));
await Promise.all([
  new Promise((resolve) => app.listen(appPort, "127.0.0.1", resolve)),
  new Promise((resolve) => pack.listen(packPort, "127.0.0.1", resolve)),
]);
process.stdout.write(`${JSON.stringify({ app: appOrigin, pack: `http://127.0.0.1:${packPort}`, appRoot, packRoot })}\n`);
