// 그림 주소 한 곳(js/library/image-hosts.js) 검사 — 1.7.1 갈래 C.
// 기본값(Worker 없음)에서 웹은 1.7.0과 같은 주소, 설치판은 실리지 않는 묶음만 사이트에서 받는지 본다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const load = () => import(pathToFileURL(path.join(root, "js/library/image-hosts.js")).href);
const web = { location: { origin: "https://www.5e.ai.kr" } };
const installed = { fiveEDesktop: {}, location: { origin: "file://" } };
const examWindow = { fiveEExam: {}, location: { origin: "http://127.0.0.1:39821" } };
const SHA = "026de395d75798152c612676bee5d1f53c48f8192b0ea03f2737a4aaad03b340";

test("Worker 주소는 기본으로 비어 있다(지금 주소 그대로)", async () => {
  const hosts = await load();
  assert.equal(hosts.IMAGE_WORKER_BASE, "");
});

test("쪽 미리보기: 웹은 같은 사이트 상대 경로, 설치판 두 창은 사이트에서 받는다", async () => {
  const { pagePreviewUrl } = await load();
  const local = pathToFileURL(path.join(root, `assets/pdf-library/previews/${SHA}/3-thumb.webp`)).href;
  assert.equal(pagePreviewUrl(SHA, "3-thumb.webp", web), local);
  assert.equal(pagePreviewUrl(SHA, "3.webp", installed), `https://www.5e.ai.kr/assets/pdf-library/previews/${SHA}/3.webp`);
  assert.equal(pagePreviewUrl(SHA, "3.webp", examWindow), `https://www.5e.ai.kr/assets/pdf-library/previews/${SHA}/3.webp`);
});

test("부품 SVG: 웹·설치판 모두 1.7.0과 같은 상대 경로(설치판에 실려 있음)", async () => {
  const { partsSvgUrl } = await load();
  assert.equal(partsSvgUrl("a b.svg", web), "assets/parts-library/svg/a%20b.svg");
  assert.equal(partsSvgUrl("a b.svg", installed), "assets/parts-library/svg/a%20b.svg");
});

test("기출 문항 그림: 웹은 상대 경로, 설치판은 사이트", async () => {
  const { examFigureUrl } = await load();
  assert.equal(examFigureUrl("b1_2007_11_05", web), pathToFileURL(path.join(root, "assets/exam-library/images/b1_2007_11_05.png")).href);
  assert.equal(examFigureUrl("b1_2007_11_05", installed), "https://www.5e.ai.kr/assets/exam-library/images/b1_2007_11_05.png");
});

test("기출 카드 그림: 두 색인의 cards 값과 같은 주소를 만든다", async () => {
  const { EXAM_CARD_TEMPLATES, examCardUrl, isExamCardUrl } = await load();
  const kice = JSON.parse(fs.readFileSync(path.join(root, "assets/exampool/convert/data/index.json"), "utf8")).cards;
  const hak = JSON.parse(fs.readFileSync(path.join(root, "assets/exampool/convert/data/hakpyeong/index.json"), "utf8")).cards;
  assert.equal(EXAM_CARD_TEMPLATES.kice, kice);
  assert.equal(EXAM_CARD_TEMPLATES.hakpyeong, hak);
  for (const template of [kice, hak]) {
    const url = examCardUrl("p1_2024_11_03", template);
    assert.equal(url, template.replace("{id}", "p1_2024_11_03"));
    assert.ok(isExamCardUrl(url), url);
  }
  assert.equal(examCardUrl("x"), kice.replace("{id}", "x"));
  assert.ok(!isExamCardUrl("https://www.5e.ai.kr/assets/pdf-library/previews/a/1.webp"));
});

test("다른 출처 그림만 CORS로 받는다", async () => {
  const { needsCors } = await load();
  assert.equal(needsCors("data:image/webp;base64,AA", installed), false);
  assert.equal(needsCors("blob:file:///x", installed), false);
  assert.equal(needsCors("https://www.5e.ai.kr/assets/a.webp", web), false);
  assert.equal(needsCors("https://www.5e.ai.kr/assets/a.webp", installed), true);
  assert.equal(needsCors("file:///Applications/5E.app/a.webp", installed), false);
});

test("설치판은 쪽 미리보기 그림을 싣지 않고, 목록(manifest.js)과 부품 그림은 싣는다", () => {
  const files = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).build.files;
  assert.ok(files.includes("!assets/pdf-library/previews/**/*.webp"));
  assert.ok(!files.some((entry) => /^!assets\/(pdf-library\/previews\/?(\*\*)?$|pdf-library\/previews\/\*\*$|parts-library)/.test(entry)), "manifest.js·부품 그림은 실려야 한다");
  assert.ok(fs.existsSync(path.join(root, "assets/pdf-library/previews/manifest.js")));
});

test("쪽 미리보기·기출 문항 그림 주소는 image-hosts.js에서만 만든다", () => {
  const offenders = [];
  const pattern = /pdf-library\/previews\/(?!manifest\.js)|exam-library\/images\//;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) { if (!/^assets\/exampool\/convert\/es\/vendor/.test(rel)) walk(rel); continue; }
      if (!/\.(?:m?js)$/.test(entry.name) || rel === "js/library/image-hosts.js") continue;
      fs.readFileSync(path.join(root, rel), "utf8").split("\n").forEach((line, index) => {
        if (pattern.test(line) && !/^\s*(?:\/\/|\*)/.test(line)) offenders.push(`${rel}:${index + 1}`);
      });
    }
  };
  walk("js");
  walk("assets/exampool/sheet");
  assert.deepEqual(offenders, []);
});
