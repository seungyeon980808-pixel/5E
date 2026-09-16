#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function checkReleaseIdentity(root, { tag } = {}) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const metadata = JSON.parse(read('release-channels.json'));
  assert(metadata.schemaVersion === 1, 'release-channels.json: schemaVersion must be 1');
  const channels = metadata.channels;
  for (const [name, status] of Object.entries({ web: 'stable', windows: 'published', preview: 'preview' })) {
    const channel = channels?.[name];
    assert(channel && VERSION.test(channel.version), `${name}: valid version required`);
    assert(channel.status === status, `${name}: status must be ${status}`);
    let url;
    try { url = new URL(channel.url); } catch { throw new Error(`${name}: valid URL required`); }
    assert(url.protocol === 'https:' && !url.username && !url.password, `${name}: HTTPS URL required`);
  }
  assert(channels.windows.url.endsWith(`/releases/tag/v${channels.windows.version}`), 'windows: release URL must match published version');
  assert(channels.preview.version.includes('-preview'), 'preview: version must identify preview');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert(pkg.version === channels.web.version, 'package.version must match channels.web.version (not published Windows)');
  assert(lock.version === pkg.version, 'package-lock.version must match package.version');
  assert(lock.packages?.['']?.version === pkg.version, 'package-lock.packages[""].version must match package.version');
  const footer = read('index.html').match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] || '';
  assert(new RegExp(`\\bv${escape(pkg.version)}(?=[\\s<·]|$)`).test(footer), 'index.html footer must show web version');
  const preview = read('preview/index.html');
  const previewBase = channels.preview.version.split('-')[0];
  const previewIdentity = new RegExp(`\\bv?${escape(previewBase)}\\s+Preview\\b`, 'i');
  assert(previewIdentity.test(preview.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), 'preview/index.html title must show preview version and Preview');
  assert(previewIdentity.test(preview.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] || ''), 'preview/index.html footer must show preview version and Preview');
  const rows = read('README.md').split(/\r?\n/).filter(line => /^\s*\|/.test(line));
  for (const [name, channel] of Object.entries(channels)) {
    const version = new RegExp(`(?:^|[^0-9A-Za-z.])v?${escape(channel.version)}(?=$|[^0-9A-Za-z.-])`);
    assert(rows.some(row => version.test(row) && (row.includes(`](${channel.url})`) || row.includes(`href="${channel.url}"`) || row.includes(`<${channel.url}>`))), `README channel table: ${name} version and exact URL must share a row`);
  }
  if (tag !== undefined) {
    assert(typeof tag === 'string' && tag.startsWith('v') && VERSION.test(tag.slice(1)), '--tag must be a version prefixed with v');
    assert(tag === `v${pkg.version}`, `release tag ${tag} must equal package version v${pkg.version}`);
    const notes = `docs/RELEASE_NOTES_${tag}.md`;
    assert(fs.existsSync(path.join(root, notes)) && fs.statSync(path.join(root, notes)).isFile() && read(notes).trim().length > 0, `release notes required: ${notes}`);
  }
  return { web: channels.web.version, windows: channels.windows.version, preview: channels.preview.version, tag };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--tag')) throw new Error('Usage: node scripts/check-release-identity.cjs [--tag vVERSION]');
    const result = checkReleaseIdentity(path.resolve(__dirname, '..'), args.length ? { tag: args[1] } : {});
    console.log(`Release identity OK: web=${result.web}, published Windows=${result.windows}, preview=${result.preview}${result.tag ? `, tag=${result.tag}` : ''}`);
  } catch (error) {
    console.error(`Release identity FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { checkReleaseIdentity };
