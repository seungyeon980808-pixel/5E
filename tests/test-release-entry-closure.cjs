const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'LICENSE',
  'manifest.json',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon.ico',
  'desktop/ai-thread-profile.cjs',
  'desktop/codex-process-failure.cjs',
  'desktop/codex-turn-runtime.cjs',
  'desktop/splash.html',
  'docs/EXAM_SCIENTIFIC_DIAGRAM_STYLE.md',
  'docs/GPT_KNOWLEDGE_EVALUATION_SCIENCE_LINEART.md',
];

function localModuleClosure(entry) {
  const pending = [entry];
  const visited = new Set();
  while (pending.length) {
    const relativePath = pending.shift();
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const pattern = /(?:from\s*|import\s*\(|import\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1].split('?')[0];
      if (!specifier.startsWith('.')) continue;
      let dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier));
      if (!path.posix.extname(dependency)) dependency += '.js';
      assert.ok(fs.existsSync(path.join(root, dependency)), `missing local module: ${dependency}`);
      if (dependency.endsWith('.js')) pending.push(dependency);
    }
  }
  return visited;
}

test('desktop packages and loads the canonical 1.6.0 root entry', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(!packageJson.build.files.includes('preview/**/*'), 'desktop must not package the historical preview runtime');
  assert.ok(packageJson.build.files.includes('vendor/**/*'), 'canonical PDF dependencies must be packaged');
  const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
  assert.match(main, /loadFile\(path\.join\(__dirname, "\.\.", "index\.html"\)\)/);
  for (const relativePath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `missing release file: ${relativePath}`);
  }
});

test('desktop package excludes the root exam library and carries the rights-clear smoke fixture', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = packageJson.build.files;
  assert.ok(files.includes('!assets/exam-library/**'), 'root exam library must be excluded from the desktop package');
  assert.ok(files.includes('tests/fixtures/rights-clear-smoke.png'), 'rights-clear smoke fixture must be packaged');

  const main = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
  assert.match(main, /tests", "fixtures", "rights-clear-smoke\.png/);
  assert.doesNotMatch(main, /exam-library["/\\].*\.png/);
});

test('stable root has a complete local render and import closure', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = match[1].split('?')[0];
    if (!reference || /^(?:https?:|#|mailto:)/.test(reference)) continue;
    assert.ok(fs.existsSync(path.join(root, reference)), `missing root entry reference: ${reference}`);
  }
  assert.ok(localModuleClosure('js/main.js').size > 100, 'root module closure unexpectedly small');
});
