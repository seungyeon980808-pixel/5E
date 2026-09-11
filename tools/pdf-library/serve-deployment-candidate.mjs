import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

const candidate = option("--candidate");
const root = candidate ? path.resolve(candidate) : null;
const port = Number(option("--port", "4176"));
if (!root || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Usage: node tools/pdf-library/serve-deployment-candidate.mjs --candidate DIRECTORY [--port 4176]");
}

function target(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const requested = pathname === "/" ? "/app/index.html" : pathname;
  if (!requested.startsWith("/app/") && !requested.startsWith("/pack/")) return null;
  const resolved = path.resolve(root, `.${requested}`);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".pdf": "application/pdf", ".css": "text/css; charset=utf-8",
    ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".woff2": "font/woff2",
    ".otf": "font/otf", ".ttf": "font/ttf", ".pfb": "application/x-font-type1", ".gz": "application/gzip",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

async function respond(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  const file = target(request.url || "/");
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
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
      "Content-Length": end - start + 1, "Content-Type": contentType(file), "Accept-Ranges": "bytes", "Cache-Control": "no-store",
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${details.size}`;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(file, { start, end }).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}

const server = createServer((request, response) => {
  respond(request, response).catch(() => response.writeHead(500).end());
});
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${port}/app/index.html`, candidate: root })}\n`);
