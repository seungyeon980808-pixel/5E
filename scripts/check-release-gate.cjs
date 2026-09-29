#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith('--'), `${name} requires a value`);
  return value;
}

try {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tag = argument('--tag') || `v${version}`;
  assert.equal(tag, `v${version}`, 'release tag must match package version');
  const holdFile = argument('--hold-file') || path.join(root, 'docs', 'RELEASE_HOLD.md');
  const document = fs.readFileSync(holdFile, 'utf8');
  const declarations = [...document.matchAll(/^The (\d+\.\d+\.\d+) candidate (?:remains|is) \*\*([A-Z]+)\*\*/gm)]
    .filter(match => match[1] === version);
  assert.equal(declarations.length, 1, `missing or ambiguous release decision for ${version}`);
  const status = declarations[0][2];
  assert.ok(status === 'HOLD' || status === 'CLEARED', `unrecognized release decision for ${version}: ${status}`);
  assert.equal(status, 'CLEARED', `release ${version} is HOLD in ${holdFile}; release creation is blocked`);
  console.log(`Release gate OK: ${version} CLEARED`);
} catch (error) {
  console.error(`Release gate FAILED: ${error.message}`);
  process.exitCode = 1;
}
