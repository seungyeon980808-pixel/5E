const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { scripts } = require('../package.json');

for (const [name, command] of Object.entries(scripts)) {
  const targets = [...command.matchAll(/(?:^|\s)(?:(--only)\s+)?["']?((?:\.?\.?\/)?[\w./-]+\.(?:cjs|mjs|js))(?=["']?(?:\s|$))/g)]
    .filter(match => !match[1]) // --only is a suite name resolved by the browser runner.
    .map(match => match[2]);
  if (!targets.length) continue;
  test(`package script ${name} points to existing local JavaScript files`, () => {
    for (const target of targets) {
      assert.ok(fs.existsSync(path.join(root, target)), `${name}: missing ${target}`);
      assert.ok(fs.statSync(path.join(root, target)).isFile(), `${name}: ${target} must be a file`);
    }
  });
}
