// 웹 사이트 묶음을 Cloudflare 미리보기 Worker(cloudflare/web/, 이름 5e-web-preview)에 올릴 모양으로 만든다(1.7.1).
//
// 파일 고르기는 GitHub Pages 배포(scripts/web-release.cjs stage())를 그대로 쓴다. 같은 커밋이면 같은 파일이 나온다.
// 그 위에서 그림 Worker(5e-images)로 옮긴 두 묶음만 올리지 않는다(.assetsignore):
//   assets/pdf-library/previews/**/*.webp   — 쪽 미리보기(앱은 js/library/image-hosts.js pagePreviewUrl로 Worker에서 받음)
//                                             manifest.js는 js/library/provider.js가 불러오므로 남긴다
//   assets/exam-library/images/             — 기출 문항 그림(examFigureUrl)
// 과학 부품 SVG(assets/parts-library/svg/)는 남긴다: js/parts-library.js가 아직 같은 사이트의 상대 경로로 SVG를 읽는다.
// GitHub Pages 전용 파일(CNAME, .nojekyll)도 올리지 않는다.
//
// 실행:  node data/web/build-site.mjs                 — 깨끗한 커밋에서 out/site 만들기 + out/site-summary.json(개수·크기)
//        node data/web/build-site.mjs --allow-dirty   — 커밋 안 한 변경까지 담기(확인용, 올리지 말 것)
// 예전 out/site는 지우지 않고 ~/.Trash로 옮긴다.
// 올리기: cloudflare/web/README.md
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { stage } = require("../../scripts/web-release.cjs");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const site = join(out, "site");
const allowDirty = process.argv.includes("--allow-dirty");

const MAX_FILES = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;

// .assetsignore(gitignore 문법)와 아래 skip()은 같은 규칙이어야 한다.
const IGNORE_LINES = [
  ".assetsignore",
  "CNAME",
  ".nojekyll",
  "assets/pdf-library/previews/**/*.webp",
  "assets/exam-library/images/",
];
const skip = (rel) => rel === ".assetsignore" || rel === "CNAME" || rel === ".nojekyll"
  || (rel.startsWith("assets/pdf-library/previews/") && rel.endsWith(".webp"))
  || rel.startsWith("assets/exam-library/images/");

function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

if (existsSync(site)) {
  const trash = join(homedir(), ".Trash", `5e-web-site-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  renameSync(site, trash);
  console.log(`예전 묶음을 휴지통으로: ${trash}`);
}
mkdirSync(out, { recursive: true });
const receipt = stage({ output: site, allowDirty });
writeFileSync(join(site, ".assetsignore"), IGNORE_LINES.join("\n") + "\n");

let files = 0, bytes = 0, skipped = 0;
const tooBig = [];
const byTop = {};
for (const full of walk(site)) {
  const rel = relative(site, full).split("\\").join("/");
  if (skip(rel)) { skipped++; continue; }
  const size = statSync(full).size;
  files++; bytes += size;
  const top = rel.includes("/") ? rel.split("/")[0] + "/" : rel;
  byTop[top] = (byTop[top] || 0) + 1;
  if (size > MAX_BYTES) tooBig.push(`${rel} (${(size / 1048576).toFixed(1)}MiB)`);
}
const summary = { version: receipt.version, sourceCommit: receipt.sourceCommit, sourceDirty: receipt.sourceDirty,
  files, bytes, megabytes: +(bytes / 1048576).toFixed(1), skippedForImageWorker: skipped, byTop };
writeFileSync(join(out, "site-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`사이트 묶음: ${files}개 · ${summary.megabytes}MiB (그림 Worker로 뺀 것 ${skipped}개) · ${receipt.version} @ ${receipt.sourceCommit.slice(0, 8)}${receipt.sourceDirty ? " (커밋 안 한 변경 포함)" : ""}`);
if (files > MAX_FILES) { console.error(`파일이 ${MAX_FILES}개를 넘습니다.`); process.exitCode = 1; }
if (tooBig.length) { console.error(`25MiB 넘는 파일:\n${tooBig.join("\n")}`); process.exitCode = 1; }
