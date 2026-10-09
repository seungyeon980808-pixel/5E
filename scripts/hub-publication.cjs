const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const assets = require('../hub/assets.json');
const requiredBase = ['index.html', '404.html', 'js/release-receipt.js', 'examlibrary/index.html', 'ourdocs/index.html'];

function exactInventory(site, files) {
  const actual = inventory(site);
  if (JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(files).sort())) {
    throw new Error('Publication inventory changed');
  }
  for (const [file, hash] of Object.entries(files)) {
    if (actual[file] !== hash) throw new Error(`Publication changed: ${file}`);
  }
  return actual;
}

function verifyRoute(site, receipt) {
  const actual = exactInventory(site, receipt.files);
  for (const file of requiredBase) {
    if (!receipt.baseFiles[file]) throw new Error(`Incomplete published base: ${file}`);
  }
  for (const [file, hash] of Object.entries(receipt.baseFiles)) {
    if (!assets.includes(file) && actual[file] !== hash) throw new Error(`Existing file changed: ${file}`);
  }
  for (const file of Object.keys(actual)) {
    if (!assets.includes(file) && !Object.hasOwn(receipt.baseFiles, file)) throw new Error(`Unexpected addition: ${file}`);
  }
  for (const file of assets) {
    if (!actual[file]) throw new Error(`Hub asset missing: ${file}`);
  }
  return Object.keys(actual).length;
}

function appendRoute(site, base, sourceRoot) {
  exactInventory(site, base.files);
  for (const file of requiredBase) {
    if (!base.files[file]) throw new Error(`Incomplete published base: ${file}`);
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  const committedAssets = assets.map(asset => {
    if (!/^(?:hub\/(?:index\.html|family\.html|style\.css|app\.js|assets\/[a-z0-9._-]+)|docfinder\/index\.html)$/.test(asset)) {
      throw new Error(`Unexpected hub source path: ${asset}`);
    }
    const source = path.join(sourceRoot, asset);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Only ordinary hub files may be published: ${asset}`);
    const committed = execFileSync('git', ['show', `${sourceCommit}:${asset}`], { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
    if (!fs.readFileSync(source).equals(committed)) throw new Error(`Uncommitted route input: ${asset}`);
    return [asset, committed];
  });
  for (const [asset, bytes] of committedAssets) {
    const destination = path.join(site, asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  const receipt = {
    schemaVersion: 1, sourceCommit,
    baseSourceCommit: base.baseSourceCommit || base.sourceCommit,
    baseRouteCommit: base.sourceCommit, baseFiles: base.files, files: inventory(site),
  };
  verifyRoute(site, receipt);
  return receipt;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const option = name => {
      const value = args[args.indexOf(name) + 1];
      if (!args.includes(name) || !value || value.startsWith('--')) throw new Error(`${name} required`);
      return path.resolve(value);
    };
    const site = option('--site'), output = option('--receipt');
    if (args.includes('--verify')) {
      console.log(`Verified ${verifyRoute(site, JSON.parse(fs.readFileSync(output, 'utf8')))} files`);
    } else {
      const receipt = appendRoute(site, JSON.parse(fs.readFileSync(option('--base-receipt'), 'utf8')), path.resolve(__dirname, '..'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
      console.log('Added 5E Hub and DocFinder entry; every other published file is unchanged');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { assets, appendRoute, verifyRoute };
