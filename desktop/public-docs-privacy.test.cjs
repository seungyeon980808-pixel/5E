// 공개 저장소 문서에 개인 정보가 들어가지 않게 막는 검사(1.7.1).
// docs/ 전체와 루트 안내 문서에서 개인 컴퓨터 절대 경로, 클라우드 드라이브 경로, 이메일 주소를 찾으면 실패한다.
// 규칙: docs/dev/README.md 「문서 쓰는 규칙」.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const TEXT = new Set([".md", ".txt", ".json", ".html", ".csv", ".yml", ".yaml"]);
const SKIP_DIRS = new Set(["media"]);
const ROOT_FILES = ["README.md", "AGENTS.md", "DESIGN.md"];

const RULES = [
  { name: "맥 개인 경로", pattern: /\/Users\/(?!<|…|\.\.\.|\*)[^/\s`'")\]]+\//g },
  { name: "윈도우 개인 경로", pattern: /[A-Za-z]:\\+Users\\+(?!<|…)[^\\\s`'")\]]+/g },
  { name: "리눅스 개인 경로", pattern: /\/home\/(?!<|…)[a-z][^/\s`'")\]]*\//g },
  { name: "클라우드 드라이브 경로", pattern: /GoogleDrive-[^/\s]+|CloudStorage\//g },
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// 이메일처럼 보이지만 괜찮은 것: 자동 서명·예시 주소
const EMAIL_OK = [/^noreply@/i, /@example\.(com|org)$/i, /@users\.noreply\.github\.com$/i];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (TEXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function scan(files) {
  const found = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        for (const m of line.matchAll(rule.pattern)) found.push(`${rel}:${i + 1} ${rule.name}: ${m[0]}`);
      }
      // credits.html은 공개 소프트웨어 저작권 표시(저작자 연락처)라 이메일 검사에서 뺀다
      if (path.basename(file) !== "credits.html") {
        for (const m of line.matchAll(EMAIL)) {
          if (!EMAIL_OK.some((ok) => ok.test(m[0]))) found.push(`${rel}:${i + 1} 이메일: ${m[0]}`);
        }
      }
    });
  }
  return found;
}

test("공개 문서(docs/·루트 안내 문서)에 개인 경로·드라이브 경로·이메일이 없다", () => {
  const files = [...walk(path.join(root, "docs")), ...ROOT_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f))];
  assert.ok(files.length > 10, "검사할 문서를 찾지 못함");
  const found = scan(files);
  assert.deepEqual(found, [], `공개 문서에 개인 정보가 있습니다(docs/dev/README.md 「문서 쓰는 규칙」):\n${found.join("\n")}`);
});

test("검사 규칙이 실제로 잡아낸다", () => {
  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "5e-privacy-"));
  const sample = path.join(tmp, "sample.md");
  fs.writeFileSync(sample, [
    "경로 /Users/someone/Desktop/x",
    "경로 C:\\Users\\someone\\x",
    "드라이브 GoogleDrive-a@b.com/내 드라이브",
    "메일 someone@school.kr",
    "괜찮음 `/Users/…` 예시, noreply@anthropic.com, `/Users/<계정>/`",
  ].join("\n"));
  const found = scan([sample]).map((s) => s.replace(/^[^ ]+ /, ""));
  assert.equal(found.filter((s) => s.startsWith("맥 개인 경로")).length, 1);
  assert.equal(found.filter((s) => s.startsWith("윈도우 개인 경로")).length, 1);
  assert.ok(found.some((s) => s.startsWith("클라우드 드라이브 경로")));
  assert.ok(found.some((s) => s === "이메일: someone@school.kr"));
  assert.ok(!found.some((s) => s.includes("noreply")));
});
