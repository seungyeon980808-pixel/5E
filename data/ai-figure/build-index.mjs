// 그림 엔진(js/ai-figure/) 검색 색인을 앱에 싣는다: image_generator catalog → assets/ai-figure/.
//
//   tags.jsonl      평가원 그림 꼬리표(id·subject·year·type·style·tags·desc·labels)   ← catalog/tags.jsonl
//   tags-hak.jsonl  학평 그림 꼬리표(같은 형식)                                          ← catalog/tags-hak.jsonl
//   taxonomy.json   그림 종류·화풍 목록                                                   ← catalog/taxonomy.json
//
// 그림 파일은 싣지 않는다. 참고 그림은 그릴 때 5e-exam-pdf·5e-exam-hak Worker의 /q/<문항>.json에서 받는다
// (js/library/image-hosts.js EXAM_QUESTION_HOSTS, js/ai-figure/reference-images.js). 학평인지는 실린 파일(src)로 안다
// — image_generator의 figures-hak.json(4.9MB)은 싣지 않는다.
// 꼬리표를 새로 다는 일(AI 호출, 로컬 그림 1.4GB 필요)은 image_generator `catalog/tag.cjs`·`build-figs*.cjs`에서 하고, 여기서는 옮기기·검사만 한다.
//
// 실행:  node data/ai-figure/build-index.mjs [--from <image_generator>/catalog]   — 검사 후 복사
//        node data/ai-figure/build-index.mjs --check                              — assets/ai-figure만 검사(아무것도 안 바꿈)
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dest = join(repo, "assets", "ai-figure");
const args = process.argv.slice(2);
const check = args.includes("--check");
const fromArg = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const from = resolve(fromArg || process.env.IMAGE_GENERATOR_CATALOG || join(homedir(), "Projects", "image_generator", "catalog"));
const FILES = ["taxonomy.json", "tags.jsonl", "tags-hak.jsonl"];

function validate(dir) {
  const problems = [];
  const taxonomy = JSON.parse(readFileSync(join(dir, "taxonomy.json"), "utf8"));
  if (!Array.isArray(taxonomy.types) || !taxonomy.types.length) problems.push("taxonomy.types가 비어 있음");
  const types = new Set(taxonomy.types || []);
  const ids = new Set();
  const counts = {};
  for (const file of ["tags.jsonl", "tags-hak.jsonl"]) {
    let n = 0;
    readFileSync(join(dir, file), "utf8").split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      let j;
      try { j = JSON.parse(line); } catch { problems.push(`${file}:${i + 1} JSON 아님`); return; }
      if (typeof j.id !== "string" || !/^.+-[^-]+$/u.test(j.id)) problems.push(`${file}:${i + 1} id 형식 아님`);
      else if (ids.has(j.id)) problems.push(`${file}:${i + 1} id 겹침 ${j.id}`);
      ids.add(j.id);
      if (!types.has(j.type)) problems.push(`${file}:${i + 1} 종류가 목록 밖: ${j.type}`);
      n++;
    });
    counts[file] = n;
  }
  return { problems, counts };
}

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12);
const report = (dir) => Object.fromEntries(FILES.map((f) => [f, { bytes: statSync(join(dir, f)).size, sha: sha(join(dir, f)) }]));

const target = check ? dest : from;
for (const f of FILES) if (!existsSync(join(target, f))) { console.error(`파일이 없습니다: ${join(target, f)}${check ? "" : "\n--from <image_generator>/catalog 로 위치를 알려 주세요."}`); process.exit(2); }
const { problems, counts } = validate(target);
if (problems.length) { console.error(`색인 검사 실패 ${problems.length}건:\n` + problems.slice(0, 20).join("\n")); process.exit(1); }
if (!check) for (const f of FILES) copyFileSync(join(from, f), join(dest, f));
console.log(JSON.stringify({ [check ? "checked" : "copiedFrom"]: target, counts, files: report(dest) }, null, 1));
