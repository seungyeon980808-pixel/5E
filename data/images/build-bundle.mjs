// 그림 세 묶음을 Cloudflare 그림 Worker(cloudflare/images/)에 올릴 모양으로 묶는다(1.7.1 준비 — 올리지는 않음).
//
//   assets/pdf-library/previews/<sha>/<쪽>[-thumb].webp  → out/site/previews/<sha>/<쪽>[-thumb].webp
//   assets/parts-library/svg/<파일>.svg                  → out/site/parts/<파일>.svg
//   assets/exam-library/images/<문항 id>.png             → out/site/exam/<문항 id>.png
//
// 이 경로는 js/library/image-hosts.js(pagePreviewUrl·partsSvgUrl·examFigureUrl)가 Worker 주소 뒤에 붙이는 경로와 같다.
// 복사하지 않고 링크만 만든다(exam-pdf/build-site.mjs와 같은 방식). Workers 정적 파일 한도(무료: Worker당 2만 개,
// 한 파일 25MiB)를 넘으면 멈춘다.
//
// 실행:  node data/images/build-bundle.mjs           — out/site 만들기 + out/bundle.json(개수·크기)
//        node data/images/build-bundle.mjs --check   — 한도만 확인(아무것도 만들지 않음)
// 올리기(사용자 승인 뒤, 이 스크립트는 하지 않음): cloudflare/images/README.md
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const out = join(here, "out");
const site = join(out, "site");
const check = process.argv.includes("--check");

const MAX_FILES = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;
const BUNDLES = [
  { name: "previews", from: "assets/pdf-library/previews", keep: (rel) => rel.endsWith(".webp") },
  { name: "parts", from: "assets/parts-library/svg", keep: (rel) => rel.endsWith(".svg") },
  { name: "exam", from: "assets/exam-library/images", keep: (rel) => rel.endsWith(".png") },
];

function walk(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, found);
    else if (entry.isFile()) found.push(relative(base, full).split("\\").join("/"));
  }
  return found;
}

const plan = [];
const summary = {};
for (const bundle of BUNDLES) {
  const source = join(repo, bundle.from);
  if (!existsSync(source)) { console.error(`묶음 원본이 없습니다: ${bundle.from}`); process.exit(1); }
  const files = walk(source).filter(bundle.keep).sort();
  let bytes = 0;
  for (const rel of files) {
    const size = statSync(join(source, rel)).size;
    bytes += size;
    plan.push({ src: join(source, rel), dst: `${bundle.name}/${rel}`, size });
  }
  summary[bundle.name] = { from: bundle.from, files: files.length, bytes };
}

const total = plan.length;
const big = plan.filter((item) => item.size > MAX_BYTES);
const totalBytes = plan.reduce((sum, item) => sum + item.size, 0);
for (const [name, info] of Object.entries(summary)) console.log(`${name}: ${info.files.toLocaleString()}개 · ${(info.bytes / 1e6).toFixed(0)}MB (${info.from})`);
console.log(`합계 ${total.toLocaleString()}개 · ${(totalBytes / 1e6).toFixed(0)}MB · 한도 ${MAX_FILES.toLocaleString()}개 중 ${(total / MAX_FILES * 100).toFixed(0)}%`);
if (big.length) { console.error("25MiB 넘는 파일(정적 파일 한도):", big.slice(0, 5).map((item) => item.dst)); process.exit(1); }
// _headers 한 개도 파일 수에 들어간다.
if (total + 1 > MAX_FILES) { console.error(`파일 수가 Worker 한도(${MAX_FILES})를 넘습니다. 묶음을 Worker 두 개로 나눠야 합니다.`); process.exit(1); }
if (check) process.exit(0);

// 지난번 링크 중 이번 묶음에 없는 것은 지운다(링크만 — 원본은 그대로).
const wanted = new Set(plan.map((item) => item.dst));
if (existsSync(site)) for (const rel of walk(site)) {
  if (rel === "_headers" || wanted.has(rel)) continue;
  const full = join(site, rel);
  if (lstatSync(full).isSymbolicLink()) rmSync(full);
}
let made = 0;
for (const item of plan) {
  const dst = join(site, item.dst);
  mkdirSync(dirname(dst), { recursive: true });
  let ok = false;
  try { ok = lstatSync(dst).isSymbolicLink() && readlinkSync(dst) === item.src; } catch {}
  if (!ok) { rmSync(dst, { force: true }); symlinkSync(item.src, dst); made += 1; }
}
// 설치판(file:·127.0.0.1)과 웹이 canvas에 그릴 수 있게 CORS를 연다. 쪽 미리보기는 PDF sha로 이름이 정해져 바뀌지 않는다.
const CORS = "  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Content-Length, ETag\n";
writeFileSync(join(site, "_headers"), [
  `/previews/*\n${CORS}  Cache-Control: public, max-age=31536000, immutable\n`,
  `/parts/*\n${CORS}  Cache-Control: public, max-age=86400\n`,
  `/exam/*\n${CORS}  Cache-Control: public, max-age=86400\n`,
].join(""));
writeFileSync(join(out, "bundle.json"), `${JSON.stringify({ files: total, bytes: totalBytes, bundles: summary }, null, 2)}\n`);
console.log(`새 링크 ${made}개 → ${site}`);
