const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

function assertCurrentImageDocs({ seam, complexity }) {
  assert.match(seam, /`js\/image-analysis\.js`/);
  assert.match(seam, /`analyzeImageData\(\{ width, height, data, options \}\)`/);
  assert.match(seam, /`createImageAnalysisController\(\)`/);
  assert.doesNotMatch(seam, /소비자\(`js\/image-import-mock\.js`\)/);
  assert.match(complexity, /1개씩 순차 처리/);
  assert.doesNotMatch(complexity, /최대 5개를 동시에 처리/);
}

function assertExamLibraryDocs({ spec, ignore, trackedPngs }) {
  const ignorePatterns = ignore
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const treeEntry = spec.split("\n").find((line) => line.startsWith("├── .gitignore"));

  assert.ok(trackedPngs > 0, "the tracked PNG inventory must be available rather than inferred from .gitignore");
  assert.ok(treeEntry, "the folder tree must describe the current .gitignore policy");
  for (const pattern of ignorePatterns) assert.ok(treeEntry.includes(pattern), `the folder tree must name ${pattern}`);
  assert.doesNotMatch(treeEntry, /images\/\*/);
  assert.match(spec, new RegExp(`PNG ${trackedPngs.toLocaleString("en-US")}개`));
  assert.doesNotMatch(spec, /images\/\s+기출 PNG \(로컬 전용, 커밋 안 됨\)/);
}

function assertCurrentPairingDocs({ readme, bridge, server, transport }) {
  assert.match(bridge, /app_pairing 또는 app_status/);
  assert.match(bridge, /capability는 이 모듈 메모리에만/);
  assert.match(server, /name: "app_pairing"/);
  assert.match(server, /name: "app_status"/);
  assert.match(transport, /\/health.*비밀을 포함하지 않고/);
  assert.match(readme, /## AI로 그리기 \(MCP\) 연결/);
  assert.match(readme, /`app_pairing`.*`app_status`/s);
  assert.match(readme, /MCP 배지/);
  assert.match(readme, /메모리에만/);
  assert.match(readme, /재시작.*새 페어링/);
  assert.match(readme, /페어링 기록.*(?:공유|스크린샷)/s);
  assert.match(readme, /`\/health`.*(?:비밀|토큰).*(?:없|포함하지 않)/s);
}

function assertCurrentCutoutDocs({ guide, index, tools, erase, cutout, trackedJs }) {
  assert.match(index, /data-tool="ERASE"/);
  assert.match(tools, /activeTool === "ERASE"/);
  assert.match(erase, /activeTool === "ERASE"/);
  assert.match(cutout, /export function startImageEditSession/);
  assert.match(cutout, /\.closest\?\.\("\.image-edit-tool-btn"\)/);
  assert.match(cutout, /if \(!btn \|\| !sessionObj\(\)\) return/);
  assert.equal((trackedJs.match(/startImageEditSession\s*\(/g) || []).length, 1,
    "the retained image-edit session starter must not be documented as reachable without a caller");
  assert.match(guide, /상단.*`가위.*지우개`.*자유.*올가미/s);
  assert.match(guide, /`startImageEditSession\(\)`.*호출 경로가 없/s);
  assert.doesNotMatch(guide, /#tool-cut-merged.*사각형·자유 영역 지우기/s);
}

test("current image-conversion documentation names the callable analysis seam, not the retired mock proposal", () => {
  const seam = read("docs/IMAGE_OBJECT_SEAM_CONTRACT.md");
  const analysis = read("js/image-analysis.js");
  const controller = read("js/image-analysis-controller.js");

  assert.equal(exists("js/image-import-mock.js"), false, "the documented old mock entry path must not be presented as current");
  assert.match(analysis, /export function inspectImageData/);
  assert.match(analysis, /export function analyzeImageData/);
  assert.match(controller, /export function createImageAnalysisController/);
  assertCurrentImageDocs({ seam, complexity: read("docs/IMAGE_COMPLEXITY_MODE_SPEC.md") });
});

test("complexity and engine docs track serialized batch admission and complete second-pass cache entries", () => {
  const complexity = read("docs/IMAGE_COMPLEXITY_MODE_SPEC.md");
  const panel = read("js/ai-panel.js");
  const engine = read("docs/engine-v2/ENGINE_V2_INTERFACE.md");

  assert.match(panel, /const BATCH_CONCURRENCY = 1/);
  assert.match(panel, /Number\(output\.complexPass\) === 2/);
  assertCurrentImageDocs({ seam: read("docs/IMAGE_OBJECT_SEAM_CONTRACT.md"), complexity });
  assert.match(engine, /완료된 결과만 exact cache에 저장/);
  assert.match(engine, /복잡.*2차.*완료/);
});

test("schema/design documentation preserves world-mm storage, pt editor conversion, and dual box labels", () => {
  const schema = read("docs/OBJECT_SCHEMA.md");
  const design = read("DESIGN.md");
  const state = read("js/state.js");
  const editor = read("js/text-editor.js");

  assert.match(state, /export const DEFAULT_TEXT_SIZE_MM = 3\.7/);
  assert.match(state, /export const ptToMm/);
  assert.match(editor, /fontSize.*ptToMm/);
  assert.match(schema, /world mm/);
  assert.match(schema, /pt 입력을 mm로 저장/);
  assert.match(design, /labelInner \/ labelInnerType/);
  assert.match(design, /labelOuter \/ labelOuterType/);
});

test("documentation checker rejects an adversarial stale entry path and parallel-batch claim", () => {
  const seam = read("docs/IMAGE_OBJECT_SEAM_CONTRACT.md");
  const complexity = read("docs/IMAGE_COMPLEXITY_MODE_SPEC.md");
  const staleSeam = seam.replace("`js/image-analysis.js`", "소비자(`js/image-import-mock.js`)");
  const parallelComplexity = complexity.replace("1개씩 순차 처리", "최대 5개를 동시에 처리");

  assert.throws(() => assertCurrentImageDocs({ seam: staleSeam, complexity }));
  assert.throws(() => assertCurrentImageDocs({ seam, complexity: parallelComplexity }));
});

test("exam-library documentation derives the tracked image inventory instead of repeating the retired local-only policy", () => {
  const spec = read("docs/EXAM_LIBRARY_SPEC_20260706.md");
  const ignore = read("assets/exam-library/.gitignore");
  const trackedPngs = childProcess.execFileSync(
    "git",
    ["--no-optional-locks", "ls-files", "assets/exam-library/images"],
    { cwd: root, encoding: "utf8", env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } },
  ).trim().split("\n").filter((entry) => entry.endsWith(".png")).length;

  assert.match(ignore, /기출 이미지·manifest\.json.*커밋/);
  assertExamLibraryDocs({ spec, ignore, trackedPngs });

  const staleSpec = spec.replace(
    /^├── \.gitignore.*$/m,
    "├── .gitignore        images/* 패턴 (이미 신규 파일을 무시하지만 tracked 파일에는 소급하지 않음)",
  );
  assert.notEqual(staleSpec, spec, "the negative fixture must mutate the real folder-tree entry");
  assert.throws(() => assertExamLibraryDocs({ spec: staleSpec, ignore, trackedPngs }));
});

test("current README pairing guidance follows the selected-process capability flow", () => {
  const readme = read("README.md");
  const inputs = {
    readme,
    bridge: read("js/mcp-bridge.js"),
    server: read("tools/mcp-5e/server.js"),
    transport: read("tools/mcp-5e/lib/bridge.js"),
  };

  assertCurrentPairingDocs(inputs);
  const historicalOnly = readme.replace(
    /^## AI로 그리기 \(MCP\) 연결[\s\S]*?(?=^##\s|\Z)/m,
    "## AI로 그리기 (MCP) 연결\n\nMCP 기능은 v1.3.0 릴리스 이력입니다.\n\n",
  );
  assert.notEqual(historicalOnly, readme, "the negative fixture must replace the real current pairing section");
  assert.throws(() => assertCurrentPairingDocs({ ...inputs, readme: historicalOnly }));
});

test("current cutout guidance distinguishes the exposed lasso eraser from the unreachable edit-session controls", () => {
  const trackedJsPaths = childProcess.execFileSync(
    "git",
    ["--no-optional-locks", "ls-files", "js"],
    { cwd: root, encoding: "utf8", env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } },
  ).trim().split("\n").filter((entry) => entry.endsWith(".js"));
  const inputs = {
    guide: read("docs/USER_GUIDE.md"),
    index: read("index.html"),
    tools: read("js/tools.js"),
    erase: read("js/erase-tool.js"),
    cutout: read("js/image-cutout.js"),
    trackedJs: trackedJsPaths.map(read).join("\n"),
  };

  assertCurrentCutoutDocs(inputs);
  const conflatedGuide = inputs.guide.replace(
    /^### 5\.5[\s\S]*?(?=^###\s|\Z)/m,
    "### 5.5 오려내기\n\n`#tool-cut-merged`에서 사각형·자유 영역 지우기를 사용합니다.\n\n",
  );
  assert.notEqual(conflatedGuide, inputs.guide, "the negative fixture must replace the real cutout section");
  assert.throws(() => assertCurrentCutoutDocs({ ...inputs, guide: conflatedGuide }));
});
