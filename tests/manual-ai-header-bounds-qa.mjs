import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = process.argv[2] || ".omo/evidence/library-page-crop-restore/impl";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try { response.setHeader("content-type", mime[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
const report = { scenarios: [] };


try {
 await page.setViewportSize({width:1440,height:900});await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 await page.waitForSelector('#ai-image-panel',{state:'attached'});
 const results=[];
 for(const zoom of [1,1.25]) {
 await page.evaluate(z=>{document.documentElement.classList.add('desktop-shell','platform-darwin');document.documentElement.style.setProperty('--ui-zoom',String(z));document.querySelector('#ai-image-panel').hidden=false;},zoom);
 await page.waitForTimeout(100);
 const bounds=await page.evaluate(()=>{const b=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {titlebar:b('.desktop-titlebar'),panel:b('#ai-image-panel'),header:b('#ai-image-panel .ai-head'),modal:b('#ai-image-panel .modal-ai')}});
 assert.ok(bounds.header.top>=bounds.titlebar.bottom);results.push({zoom,...bounds});await page.screenshot({path:join(output,`header-${zoom}.png`)});
 }
 await writeFile(join(output,'bounds.json'),JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));}
