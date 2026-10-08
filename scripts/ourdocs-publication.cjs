const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const { verifyRoute: verifyExamLibrary } = require('./examlibrary-publication.cjs');
const route = 'ourdocs/index.html';

function verifyRoute(site, receipt) {
  const actual = inventory(site);
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(receipt.files).sort())) throw new Error('Publication inventory changed after validation');
  for (const [file, hash] of Object.entries(actual)) if (hash !== receipt.files[file]) throw new Error(`Publication changed: ${file}`);
  for (const [file, hash] of Object.entries(receipt.baseFiles)) if (file !== route && actual[file] !== hash) throw new Error(`Existing published file changed: ${file}`);
  for (const file of Object.keys(actual)) if (file !== route && !Object.hasOwn(receipt.baseFiles, file)) throw new Error(`Unexpected addition: ${file}`);
  return Object.keys(actual).length;
}

function appendRoute(site, base, sourceRoot) {
  verifyExamLibrary(site, base);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  const bytes = fs.readFileSync(path.join(sourceRoot, route));
  const committed = execFileSync('git', ['show', `${sourceCommit}:${route}`], { cwd: sourceRoot });
  if (!bytes.equals(committed)) throw new Error('Route differs from its committed source');
  fs.mkdirSync(path.join(site, 'ourdocs'), { recursive: true });
  fs.writeFileSync(path.join(site, route), bytes);
  const receipt = { schemaVersion: 1, sourceCommit, baseSourceCommit: base.baseSourceCommit, baseRouteCommit: base.sourceCommit, baseFiles: base.files, files: inventory(site) };
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
    const site = option('--site'), output = option('--receipt');
    if (args.includes('--verify')) console.log(`Verified ${verifyRoute(site, JSON.parse(fs.readFileSync(output, 'utf8')))} files`);
    else {
      const base = JSON.parse(fs.readFileSync(option('--base-receipt'), 'utf8'));
      const receipt = appendRoute(site, base, path.resolve(__dirname, '..'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
      console.log('Added OurDocs while preserving every existing publication file');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { appendRoute, verifyRoute };
