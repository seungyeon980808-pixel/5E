const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const assets = require('../bug/assets.json');
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
    if (!actual[file]) throw new Error(`Bug board asset missing: ${file}`);
  }
  return Object.keys(actual).length;
}

// bug/config.js에 적힌 공개 Worker 주소(로컬 주소는 공개 사이트에서 쓰지 않는다).
function publicApi(site) {
  const source = fs.readFileSync(path.join(site, 'bug/config.js'), 'utf8');
  const match = source.match(/'(https:\/\/[a-z0-9.-]+\.workers\.dev\/api\/bug-board)'/);
  if (!match) throw new Error('bug/config.js must name the public Worker /api/bug-board URL');
  return match[1];
}

// 게시 전 확인: 공개 Worker가 FAQ를 돌려주고, 출처 없는 쓰기와 다른 출처를 거부하며,
// www.5e.ai.kr에서 오는 요청은 허용하는지.
async function readiness(site, fetchImpl = fetch) {
  const api = publicApi(site), timeout = () => AbortSignal.timeout(20000);
  const faqs = await fetchImpl(api + '/faqs', { headers:{ Origin:'https://www.5e.ai.kr' }, signal:timeout() });
  const body = await faqs.json().catch(() => ({}));
  if (!faqs.ok || !Array.isArray(body.faqs)) throw new Error('Bug board Worker is not ready (database or bindings missing)');
  if (faqs.headers.get('access-control-allow-origin') !== 'https://www.5e.ai.kr') throw new Error('Bug board Worker must allow https://www.5e.ai.kr');
  const anonymous = await fetchImpl(api, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}', signal:timeout() });
  if (anonymous.status !== 403) throw new Error('Bug board Worker must reject writes without the board origin');
  const foreign = await fetchImpl(api + '/faqs', { headers:{ Origin:'https://example.invalid' }, signal:timeout() });
  if (foreign.status !== 403) throw new Error('Bug board Worker must reject other origins');
  return api;
}

function appendRoute(site, base, sourceRoot) {
  exactInventory(site, base.files);
  for (const file of requiredBase) {
    if (!base.files[file]) throw new Error(`Incomplete published base: ${file}`);
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  const committedAssets = assets.map(asset => {
    // 화면 파일만 공개한다. API·저장소·DB 구조·Worker 코드는 Pages에 올리지 않는다.
    if (!/^bug\/(?:index\.html|board\.css|board\.js|config\.js|draft\.js|capture\.js)$/.test(asset)) {
      throw new Error(`Unexpected bug board source path: ${asset}`);
    }
    const source = path.join(sourceRoot, asset);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Only ordinary bug board files may be published: ${asset}`);
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

if (require.main === module) (() => {
  try {
    const args = process.argv.slice(2);
    const option = name => {
      const value = args[args.indexOf(name) + 1];
      if (!args.includes(name) || !value || value.startsWith('--')) throw new Error(`${name} required`);
      return path.resolve(value);
    };
    const site = option('--site');
    if (args.includes('--ready')) {
      readiness(site).then(api => console.log(`Bug board Worker ready: ${api}`), error => { console.error(error.message); process.exitCode = 1; });
      return;
    }
    const output = option('--receipt');
    if (args.includes('--verify')) {
      console.log(`Verified ${verifyRoute(site, JSON.parse(fs.readFileSync(output, 'utf8')))} files`);
    } else {
      const receipt = appendRoute(site, JSON.parse(fs.readFileSync(option('--base-receipt'), 'utf8')), path.resolve(__dirname, '..'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
      console.log('Added the 5E bug board; every other published file is unchanged');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
})();
module.exports = { assets, appendRoute, verifyRoute, readiness, publicApi };
