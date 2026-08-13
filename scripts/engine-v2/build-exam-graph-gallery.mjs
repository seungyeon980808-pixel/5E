#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "docs", "engine-v2", "graph-validation-manifest.jsonl");
const OUTPUT_DIR = path.join(ROOT, "_repro", "exam-graph-validation");

const rows = fs.readFileSync(MANIFEST, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse)
  .filter((row) => (row.status === "verified" || row.status === "candidate") && row.fixture)
  .map((row) => ({ ...row, fixtureData: JSON.parse(fs.readFileSync(path.join(ROOT, row.fixture), "utf8")) }));

const payload = JSON.stringify(rows).replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>5E 기출 그래프 구조 검증</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#eceae7;color:#161616;font-family:"Malgun Gothic",sans-serif}
h1{margin:0 0 6px;font-size:26px}.summary{margin:0 0 22px;color:#555}.cards{display:grid;gap:20px}.card{width:1320px;background:#fff;border:1px solid #cbc8c3;border-radius:12px;padding:18px;box-shadow:0 3px 12px #0001}
.card h2{font-size:17px;margin:0 0 12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{border:1px solid #d7d4cf;border-radius:8px;padding:10px;background:#fafafa}.label{font-weight:700;font-size:13px;margin-bottom:8px}
.visual{position:relative;height:330px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}.source img{max-width:100%;max-height:100%}.source .overlay{position:absolute;border:2px solid #e22929;pointer-events:none}.output svg{width:100%;height:100%}.checks{margin:11px 0 0;font-size:12px;color:#444;line-height:1.5}
</style></head><body><h1>평가원 기출 그래프 구조 검증 갤러리</h1><p class="summary">붉은 상자: 원본에서 계측한 축 골격 · 오른쪽: 동일 fixture의 실제 5E 네이티브 렌더</p><main class="cards"></main>
<script type="module">
import { compileFastScene } from "../../js/ai-scene-fastpath.js";
import { renderObject } from "../../js/render.js";
const rows=${payload}, NS="http://www.w3.org/2000/svg", query=new URLSearchParams(location.search).get("id");
const selected=query?rows.filter(r=>r.id===query):rows;
function renderScene(f){const result=compileFastScene(f.scene,{idPrefix:"gallery"});if(!result.valid||!result.supported)throw new Error(JSON.stringify(result.errors||result.unsupported));const a=f.scene.artboard,svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox",\`\${-a.w/2} \${-a.h/2} \${a.w} \${a.h}\`);result.objects.forEach(o=>{const node=renderObject(o);if(node)svg.appendChild(node)});return svg}
for(const row of selected){const f=row.fixtureData,card=document.createElement("section");card.className="card";card.innerHTML=\`<h2>\${row.id} · \${row.subject} · \${row.year}</h2><div class="pair"><div class="panel"><div class="label">원본 + 축 골격 계측</div><div class="visual source"><img src="../../\${row.source}"><span class="overlay"></span></div></div><div class="panel"><div class="label">실제 5E 렌더</div><div class="visual output"></div></div></div><p class="checks">\${f.assertions.map(a=>a.kind).join(" · ")}</p>\`;const img=card.querySelector("img"),overlay=card.querySelector(".overlay");img.addEventListener("load",()=>{const box=img.getBoundingClientRect(),host=img.parentElement.getBoundingClientRect(),g=f.graphBox;Object.assign(overlay.style,{left:box.left-host.left+g[0]*box.width+"px",top:box.top-host.top+g[1]*box.height+"px",width:g[2]*box.width+"px",height:g[3]*box.height+"px"})});card.querySelector(".output").appendChild(renderScene(f));document.querySelector(".cards").appendChild(card)}
document.documentElement.dataset.ready="true";
</script></body></html>`;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
console.log(`Graph validation gallery: ${rows.length} candidate/verified panels`);
console.log(`Output: ${path.relative(ROOT, path.join(OUTPUT_DIR, "index.html"))}`);
