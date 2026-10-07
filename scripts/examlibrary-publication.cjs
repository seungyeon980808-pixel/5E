const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inventory, verifyArtifact } = require('./web-release.cjs');
const route = 'examlibrary/index.html';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function verifyRoute(site, receipt) {
  const actual = inventory(site);
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(receipt.files).sort())) {
    throw new Error('Route publication inventory changed after testing');
  }
  for (const [file, hash] of Object.entries(actual)) {
    if (hash !== receipt.files[file]) throw new Error(`Route publication changed: ${file}`);
  }
  for (const [file, hash] of Object.entries(receipt.baseFiles)) {
    if (file !== route && actual[file] !== hash) throw new Error(`Existing published 5E file changed: ${file}`);
  }
  for (const file of Object.keys(actual)) {
    if (file !== route && !Object.hasOwn(receipt.baseFiles, file)) throw new Error(`Unexpected publication addition: ${file}`);
  }
  if (actual[route] !== receipt.routeSha256) throw new Error('The route differs from its approved source');
  return Object.keys(actual).length;
}

function appendRoute(site, baseReceipt, sourceRoot, expectedBaseSha) {
  verifyArtifact(site, baseReceipt, { expectedSha: expectedBaseSha, requireClean: true });
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  const bytes = fs.readFileSync(path.join(sourceRoot, route));
  const committed = execFileSync('git', ['show', `${sourceCommit}:${route}`], { cwd: sourceRoot });
  if (!bytes.equals(committed)) throw new Error('Route source must match its committed Git blob');
  fs.mkdirSync(path.join(site, 'examlibrary'), { recursive: true });
  fs.writeFileSync(path.join(site, route), bytes);
  const receipt = { schemaVersion: 1, sourceCommit, baseSourceCommit: baseReceipt.sourceCommit,
    routeSha256: digest(bytes), baseFiles: baseReceipt.files, files: inventory(site) };
  verifyRoute(site, receipt);
  return receipt;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const option = name => {
      const value = args[args.indexOf(name) + 1];
      if (!args.includes(name) || !value || value.startsWith('--')) throw new Error(`${name} requires a value`);
      return path.resolve(value);
    };
    const site = option('--site'), receiptFile = option('--receipt');
    if (args.includes('--verify')) {
      console.log(`Verified ${verifyRoute(site, JSON.parse(fs.readFileSync(receiptFile, 'utf8')))} publication files`);
    } else {
      if (!/^[a-f0-9]{40}$/.test(process.env.BASE_SOURCE_SHA || '')) throw new Error('A validated base release SHA is required');
      const base = JSON.parse(fs.readFileSync(option('--base-receipt'), 'utf8'));
      const receipt = appendRoute(site, base, path.resolve(__dirname, '..'), process.env.BASE_SOURCE_SHA);
      fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
      fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
      console.log(`Added ${route}; existing 5E release ${receipt.baseSourceCommit} is unchanged`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { appendRoute, verifyRoute };
