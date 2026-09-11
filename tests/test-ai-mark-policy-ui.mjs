import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const css = await readFile(resolve(root, 'css/ai-panel.css'), 'utf8');

const count = (source, pattern) => [...source.matchAll(pattern)].length;
const select = (attribute) => {
  const match = html.match(new RegExp(`<select\\s+id="([^"]+)"\\s+${attribute}>([\\s\\S]*?)<\\/select>`));
  assert.ok(match, `${attribute} select exists once with an id`);
  assert.equal(count(html, new RegExp(`<select[^>]*\\s${attribute}(?=[\\s>])`, 'g')), 1, `${attribute} is unique`);
  return { id: match[1], options: match[2] };
};

assert.match(html, /<section class="ai-mark-policy" data-ai-mark-policy aria-label="표시선 처리">/, 'policy is one labelled group');
assert.equal(count(html, /data-ai-mark-policy(?=[\s>])/g), 1, 'policy group is unique');
assert.match(html, /물체 윤곽·관·도선·실제 눈금선은 보존\. 숫자·단위는 제거\./, 'preservation guidance is present');
assert.match(html, /<details class="ai-conversion-options">[\s\S]*?<section class="ai-mark-policy"[\s\S]*?<\/section>[\s\S]*?<\/details>\s*<button type="button" class="modal-btn modal-btn-primary" data-ai-send/, 'policy stays in the collapsed options before the primary conversion action');

const arrows = select('data-ai-mark-arrows');
assert.match(html, new RegExp(`<label for="${arrows.id}">화살표`), 'arrow label is connected');
assert.match(arrows.options, /<option value="structural" selected>구조 표시만 유지<\/option>/, 'structural arrow policy is default');
assert.match(arrows.options, /<option value="keep">모두 유지<\/option>/);
assert.match(arrows.options, /<option value="remove">모두 제거<\/option>/);

const trends = select('data-ai-mark-trends');
assert.match(html, new RegExp(`<label for="${trends.id}">추세선`), 'trend label is connected');
assert.match(trends.options, /<option value="keep" selected>유지<\/option>/, 'trend keep is default');
assert.match(trends.options, /<option value="remove">제거<\/option>/);

const leaders = select('data-ai-mark-leaders');
assert.match(html, new RegExp(`<label for="${leaders.id}">보조선·지시선`), 'leader label is connected');
assert.match(leaders.options, /<option value="remove" selected>제거<\/option>/, 'leader remove is default');
assert.match(leaders.options, /<option value="keep">유지<\/option>/);

assert.match(css, /#ai-image-panel \.ai-mark-policy-fields \{ grid-template-columns:minmax\(0,1fr\); gap:6px; \}/, 'policy controls use the workbench label column');
assert.match(css, /@media \(max-height: 740px\)[\s\S]*?\.ai-mark-policy select\s*\{\s*height:\s*24px/, 'short-height layout keeps policy controls compact');

console.log('AI mark policy UI checks passed.');
