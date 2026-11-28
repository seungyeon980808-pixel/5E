// 1.8.0 성능 지킴: 새 그림·그래프 엔진(js/ai-figure, js/ai-graph)과 그 무거운 자료
// (기출 그림 색인 assets/ai-figure/tags*.jsonl 약 7MB, KaTeX vendor/katex)는 첫 화면에서 받지 않는다.
// 앱 쪽에서는 처음 쓸 때 import()로만 부른다 — 정적 import·<script>·<link>·미리 읽기 목록에 들어가면 실패.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAVY = /(?:ai-figure\/|ai-graph\/|vendor\/katex|tags-hak\.jsonl|tags\.jsonl)/;
const ENGINE_DIRS = ['js/ai-figure', 'js/ai-graph'].map((dir) => path.join(root, dir) + path.sep);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:m?js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const appScripts = () => walk(path.join(root, 'js')).filter((file) => !ENGINE_DIRS.some((dir) => file.startsWith(dir)));
const rel = (file) => path.relative(root, file);

test('앱 코드는 새 엔진·색인·KaTeX를 정적 import로 부르지 않는다(처음 쓸 때 import()만)', () => {
  const offenders = [];
  for (const file of appScripts()) {
    const source = fs.readFileSync(file, 'utf8');
    const staticImports = source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm);
    for (const match of staticImports) {
      const target = match[1] || match[2];
      if (HEAVY.test(target)) offenders.push(`${rel(file)} → ${target}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('첫 화면 HTML은 새 엔진·색인·KaTeX를 <script>·<link>로 싣지 않는다', () => {
  const pages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  assert.ok(pages.includes('index.html'));
  const offenders = [];
  for (const name of pages) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      if (HEAVY.test(match[1])) offenders.push(`${name} → ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('시작 로딩(js/main.js)의 미리 준비 단계는 새 엔진·색인·KaTeX를 받지 않는다', () => {
  const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const steps = [...main.matchAll(/^\s*step\(.*$/gm)].map((match) => match[0]);
  assert.ok(steps.length > 0, '시작 로딩 단계 목록을 찾음');
  assert.deepEqual(steps.filter((line) => HEAVY.test(line)), []);
});
