const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'preview/assets/parts-library/manifest.json';
const DEFAULT_CREDITS = ['preview/docs/credits.html', 'docs/credits.html'];
const LI_PATTERN = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
const ATTRIBUTE_PATTERN = /\b([\w-]+)="([^"]*)"/g;
const HREF_PATTERN = /<a\b[^>]*\bhref="([^"]*)"/i;

function decodeHtml(value) {
  return value.replace(/&(amp|quot|lt|gt|#39);/g, (_, entity) => ({
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
    '#39': "'",
  })[entity]);
}

function normalizedSource(value) {
  return decodeURIComponent(decodeHtml(value)).replaceAll('_', ' ').replace(/\s+/g, ' ');
}

function digest(entries) {
  const content = [...entries]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((entry) => `${entry.id}\0${entry.source}\0${entry.license}`)
    .join('\n');
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function readCredits(creditsPath) {
  const html = fs.readFileSync(creditsPath, 'utf8');
  const entries = [];
  const sourceUrls = new Set();
  let liCount = 0;
  let incompleteLiCount = 0;
  let match;
  while ((match = LI_PATTERN.exec(html)) !== null) {
    liCount += 1;
    const attributes = Object.fromEntries(
      [...match[1].matchAll(ATTRIBUTE_PATTERN)].map((attribute) => [attribute[1], decodeHtml(attribute[2])]),
    );
    const href = match[2].match(HREF_PATTERN)?.[1] ?? '';
    const source = decodeHtml(href);
    sourceUrls.add(normalizedSource(source));
    const entry = { id: attributes['data-asset-id'] ?? '', source, license: attributes['data-license'] ?? '' };
    if (entry.id && entry.source && entry.license) {
      entries.push(entry);
    } else {
      incompleteLiCount += 1;
    }
  }
  return { entries, sourceUrls, liCount, incompleteLiCount };
}

function inspect(manifest, creditsPath) {
  const parsed = readCredits(creditsPath);
  const expected = new Map(manifest.map((entry) => [entry.id, entry]));
  const actual = new Map(parsed.entries.map((entry) => [entry.id, entry]));
  const duplicateIds = [...new Set(parsed.entries
    .filter((entry, index, entries) => entries.findIndex((item) => item.id === entry.id) !== index)
    .map((entry) => entry.id))].sort();
  const missingAssetIds = [...expected.keys()].filter((id) => !actual.has(id)).sort();
  const unexpectedAssetIds = [...actual.keys()].filter((id) => !expected.has(id)).sort();
  const mismatchedAssetIds = [...expected.keys()]
    .filter((id) => actual.has(id) && JSON.stringify(expected.get(id)) !== JSON.stringify(actual.get(id)))
    .sort();
  const missingSourceIds = manifest
    .filter((entry) => !parsed.sourceUrls.has(normalizedSource(entry.source)))
    .map((entry) => entry.id)
    .sort();
  return {
    credits_path: path.relative(ROOT, creditsPath),
    manifest_items: manifest.length,
    credits_li_count: parsed.liCount,
    source_url_matches: manifest.length - missingSourceIds.length,
    missing_source_ids: missingSourceIds,
    strict_entry_count: parsed.entries.length,
    missing_asset_ids: missingAssetIds,
    unexpected_asset_ids: unexpectedAssetIds,
    duplicate_asset_ids: duplicateIds,
    mismatched_asset_ids: mismatchedAssetIds,
    incomplete_li_count: parsed.incompleteLiCount,
    manifest_entries_sha256: digest(manifest),
    credits_entries_sha256: digest(parsed.entries),
  };
}

function parsePaths(args) {
  let manifest = DEFAULT_MANIFEST;
  const credits = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--manifest') {
      manifest = args[index + 1];
      index += 1;
    } else if (args[index] === '--credits') {
      credits.push(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`unsupported argument: ${args[index]}`);
    }
  }
  return { manifest: path.resolve(ROOT, manifest), credits: (credits.length ? credits : DEFAULT_CREDITS).map((item) => path.resolve(ROOT, item)) };
}

function main() {
  const paths = parsePaths(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(paths.manifest, 'utf8')).items.map(({ id, source, license }) => ({ id, source, license }));
  const reports = paths.credits.map((creditsPath) => inspect(manifest, creditsPath));
  const exact = reports.every((report) => report.missing_source_ids.length === 0
    && report.missing_asset_ids.length === 0
    && report.unexpected_asset_ids.length === 0
    && report.duplicate_asset_ids.length === 0
    && report.mismatched_asset_ids.length === 0
    && report.incomplete_li_count === 0);
  process.stdout.write(`${JSON.stringify({ exact, reports }, null, 2)}\n`);
  process.exitCode = exact ? 0 : 1;
}

main();
