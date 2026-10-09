const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const root = path.resolve(__dirname, '..');
const surfaceDirectories = ['js', 'css', 'assets', 'fonts', 'vendor'];
const surfaceFiles = ['index.html', '404.html', 'manifest.json', 'LICENSE', 'docs/credits.html', 'experiments/web-codex-auth/editor-bridge.js', 'examlibrary/index.html', 'ourdocs/index.html', ...require('../memo/assets.json'), ...require('../hub/assets.json')];

function filesBelow(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not a publishable file: ${entry.name}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

function assertSource(relative, bytes) {
  if (/\.(?:js|mjs|cjs|html|css|json)$/.test(relative)
      && /^(?:<<<<<<< |>>>>>>> |=======$)/m.test(bytes.toString('utf8'))) {
    throw new Error(`Unresolved conflict in publication input: ${relative}`);
  }
}

function inventory(site) {
  return Object.fromEntries(filesBelow(site).map(file => {
    const relative = path.relative(site, file).split(path.sep).join('/');
    const bytes = fs.readFileSync(file);
    assertSource(relative, bytes);
    return [relative, digest(bytes)];
  }));
}

function verifyArtifact(site, receipt, { expectedSha, expectedVersion, requireClean = false } = {}) {
  const version = receipt.version;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Receipt requires a stable release version');
  if (expectedVersion && version !== expectedVersion) throw new Error('Artifact version differs from the publication candidate');
  if (!/^[a-f0-9]{40}$/.test(receipt.sourceCommit || '')) throw new Error('Receipt requires a full source SHA');
  if (expectedSha && receipt.sourceCommit !== expectedSha) throw new Error('Artifact does not belong to this workflow SHA');
  if (requireClean && receipt.sourceDirty !== false) throw new Error('Dirty or unverified review builds cannot be published');
  const actual = inventory(site);
  const recorded = receipt.files;
  if (!recorded || JSON.stringify(Object.keys(actual).sort()) !== JSON.stringify(Object.keys(recorded).sort())) {
    throw new Error('Publication file inventory changed after validation');
  }
  for (const [file, hash] of Object.entries(actual)) {
    if (recorded[file] !== hash) throw new Error(`Publication file changed after validation: ${file}`);
  }
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const escapedVersion = version.replaceAll('.', '\\.');
  if (!new RegExp(`<title>[^<]*${escapedVersion}\\b`).test(html)
      || !new RegExp(`data-release-version[^>]*>v${escapedVersion}\\b`).test(html)) {
    throw new Error(`Canonical root must be the stable ${version} entry`);
  }
  const releaseReceipt = path.join(site, 'js/release-receipt.js');
  if (fs.existsSync(releaseReceipt)) {
    const displayedSha = fs.readFileSync(releaseReceipt, 'utf8').match(/sourceCommit: '([a-f0-9]{40})'/)?.[1];
    if (displayedSha !== receipt.sourceCommit) throw new Error('Displayed source commit does not match the validated artifact');
  }
  return Object.keys(actual).length;
}

function stage({ output, preservedRoot, allowDirty = false, sourceRoot = root }) {
  const channels = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'release-channels.json'), 'utf8'));
  const version = channels.candidate?.version;
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('A stable candidate version is required');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8' }).trim());
  if (dirty && !allowDirty) throw new Error('Commit and validate an exact source revision before publication');
  if (fs.existsSync(output)) throw new Error('Choose a fresh output directory; existing artifacts are never replaced');
  if (!preservedRoot) throw new Error('A pinned preview/mobile snapshot is required; existing routes must not be dropped');
  const preservedSha = channels.webPublication?.preservePreviewSourceSha;
  if (!/^[a-f0-9]{40}$/.test(preservedSha || '')) throw new Error('Preserved routes require a full SHA');
  const objectRepo = fs.existsSync(path.join(preservedRoot, '.git')) ? preservedRoot : sourceRoot;
  const tree = execFileSync('git', ['ls-tree', '-r', '-z', preservedSha, '--', 'preview', 'mobile', '1.6.0'], { cwd: objectRepo, maxBuffer: 64 * 1024 * 1024 });
  const retained = tree.toString().split('\0').filter(Boolean).map(line => {
    const [metadata, relative] = line.split('\t');
    const [mode, type, blob] = metadata.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unsupported preserved input: ${relative}`);
    return { relative, blob };
  });
  if (!retained.some(file => file.relative === 'preview/index.html')) throw new Error('Pinned preview entry is missing');
  fs.mkdirSync(output, { recursive: true });
  function copy(relative, from = sourceRoot, expectedBlob = null) {
    const source = path.join(from, relative);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Only ordinary files may be published: ${relative}`);
    const bytes = fs.readFileSync(source);
    if (expectedBlob && gitBlob(bytes) !== expectedBlob) throw new Error(`Publication input differs from its validated Git blob: ${relative}`);
    assertSource(relative, bytes);
    const destination = path.join(output, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  if (allowDirty) {
    for (const relative of surfaceFiles) if (fs.existsSync(path.join(sourceRoot, relative))) copy(relative);
    for (const directory of surfaceDirectories) {
      for (const file of filesBelow(path.join(sourceRoot, directory))) copy(path.relative(sourceRoot, file));
    }
  } else {
    // A clean working tree can still contain ignored files. Production inputs
    // must belong to the validated commit, including an exact Git blob match.
    const canonicalTree = execFileSync('git', ['ls-tree', '-r', '-z', sha, '--', ...surfaceFiles, ...surfaceDirectories], { cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024 });
    for (const line of canonicalTree.toString().split('\0').filter(Boolean)) {
      const [metadata, relative] = line.split('\t');
      const [mode, type, blob] = metadata.split(' ');
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Unsupported canonical input: ${relative}`);
      copy(relative, sourceRoot, blob);
    }
  }
  for (const { relative, blob } of retained) copy(relative, preservedRoot, blob);
  const memoConfig = path.join(output, 'memo/config.js');
  if (fs.existsSync(memoConfig)) {
    const { publicConfig, readConfig } = require('./memo-config.cjs');
    if (process.env.MEMO_API_URL || process.env.MEMO_GOOGLE_CLIENT_ID) {
      const config = publicConfig(process.env.MEMO_API_URL, process.env.MEMO_GOOGLE_CLIENT_ID);
      fs.writeFileSync(memoConfig, 'window.MEMO_CONFIG = Object.freeze(' + JSON.stringify(config) + ');\n');
    } else readConfig(memoConfig);
  }
  const releaseReceipt = path.join(output, 'js/release-receipt.js');
  if (fs.existsSync(releaseReceipt)) {
    const source = fs.readFileSync(releaseReceipt, 'utf8');
    if ((source.match(/sourceCommit: null/g) || []).length !== 1) throw new Error('Canonical release receipt requires one source SHA placeholder');
    fs.writeFileSync(releaseReceipt, source.replace('sourceCommit: null', `sourceCommit: '${sha}'`));
  }
  copy('CNAME', sourceRoot, allowDirty ? null : execFileSync('git', ['rev-parse', `${sha}:CNAME`], { cwd: sourceRoot, encoding: 'utf8' }).trim());
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  const receipt = { schemaVersion: 1, version, sourceCommit: sha, sourceDirty: dirty || allowDirty,
    preservedRoutesCommit: preservedSha, files: inventory(output) };
  verifyArtifact(output, receipt, { expectedSha: sha, expectedVersion: version, requireClean: !allowDirty });
  return receipt;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const option = name => {
      const index = args.indexOf(name);
      if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
      return args[index + 1];
    };
    const output = path.resolve(option('--site'));
    const receiptFile = path.resolve(option('--receipt'));
    if (args.includes('--verify')) {
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'release-channels.json'), 'utf8')).candidate.version;
      const count = verifyArtifact(output, receipt, { expectedSha: process.env.GITHUB_SHA, expectedVersion,
        requireClean: !args.includes('--allow-dirty') });
      console.log(`Web artifact verified: ${count} files at ${receipt.sourceCommit}`);
    } else {
      const receipt = stage({ output, preservedRoot: path.resolve(option('--preserved-root')),
        allowDirty: args.includes('--allow-dirty') });
      fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
      fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
      console.log(`Web artifact staged: ${Object.keys(receipt.files).length} files; root ${receipt.version} and preserved preview/mobile/1.6.0`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { verifyArtifact, inventory, stage };
