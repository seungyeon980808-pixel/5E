// vendor/katex/katex.min.css → assets/ai-graph/graph-stage.css
// 그림으로 만드는 그래프 엔진(js/ai-graph/draw.js)만 쓰는 KaTeX 스타일을 만든다.
//   · 글꼴 이름 KaTeX_* → FEGKaTeX_* : 5E의 MathLive도 KaTeX_Main 같은 이름을 쓰므로 섞이지 않게 바꾼다.
//   · KaTeX_Main(보통)·KaTeX_Math(기울임)는 5E fonts/의 Latin Modern(lmroman10)으로 바꿔 끼운다(image_generator page.html과 같음).
//   · woff·ttf 대체 경로는 빼고 woff2만 남긴다(vendor에는 woff2만 넣음).
//   · 그리는 판(.lb 등) 스타일은 [data-ai-graph-stage] 안으로만.
// 사용: node data/ai-graph/build-stage-css.cjs [--check]  (--check는 파일이 최신인지만 확인)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'vendor', 'katex', 'katex.min.css');
const OUT = path.join(ROOT, 'assets', 'ai-graph', 'graph-stage.css');

function build() {
  let css = fs.readFileSync(SRC, 'utf8');
  css = css.replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '').replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
  css = css.replace(/url\(fonts\//g, 'url(../../vendor/katex/fonts/');
  // 글꼴 이름만 바꾼다(주소 안의 KaTeX_Main-Regular.woff2는 뒤에 '-'가 붙으므로 그대로).
  css = css.replace(/KaTeX_([A-Za-z0-9]+)(?![-A-Za-z0-9])/g, 'FEGKaTeX_$1');
  const main = /@font-face\{font-family:FEGKaTeX_Main;font-style:normal;font-weight:400;src:[^}]*\}/;
  const math = /@font-face\{font-family:FEGKaTeX_Math;font-style:italic;font-weight:400;src:[^}]*\}/;
  if (!main.test(css) || !math.test(css)) throw new Error('KaTeX CSS에서 Main·Math 글꼴 선언을 찾지 못했습니다(판이 바뀜).');
  css = css.replace(main, '@font-face{font-family:FEGKaTeX_Main;font-style:normal;font-weight:400;src:url(../../fonts/lmroman10-regular.woff2) format("woff2")}');
  css = css.replace(math, '@font-face{font-family:FEGKaTeX_Math;font-style:italic;font-weight:400;src:url(../../fonts/lmroman10-italic.woff2) format("woff2")}');
  const stage = `
/* 그림으로 만드는 그래프(js/ai-graph/draw.js)의 숨은 그리기 판 */
[data-ai-graph-stage]{position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;background:#fff;contain:layout style}
[data-ai-graph-stage] .ag-board{position:relative;display:inline-block;background:#fff}
[data-ai-graph-stage] .lb{position:absolute;white-space:nowrap;line-height:1;color:#000}
[data-ai-graph-stage] .lb .ko{font-family:"돋움","Dotum","Apple SD Gothic Neo","맑은 고딕","Malgun Gothic",sans-serif}
[data-ai-graph-stage] .lb .katex{font-size:1em}
[data-ai-graph-stage] .lb .ag-plain{font-family:FEGKaTeX_Math,"Latin Modern Roman",serif;font-style:italic}
[data-ai-graph-stage] .ag-measure{position:absolute;left:0;top:0}
`;
  return `/* 자동 생성: node data/ai-graph/build-stage-css.cjs — 손으로 고치지 말 것. 원본 KaTeX 0.16.11 (MIT) */\n${css}\n${stage}`;
}

function main() {
const built = build();
if (process.argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== built) { console.error('assets/ai-graph/graph-stage.css가 최신이 아닙니다. node data/ai-graph/build-stage-css.cjs'); process.exit(1); }
  console.log('graph-stage.css 최신');
} else {
  fs.writeFileSync(OUT, built);
  console.log('저장:', path.relative(ROOT, OUT));
}
}
if (require.main === module) main();
module.exports = { build };
