'use strict';

// Standalone: RELEASE_URL/EXAM_URL must point to the externally owned candidate.
// `node this-file --self-test` exercises the oracles without loading Playwright.
// Browser runs always cover both entries and engines, sequentially. No server,
// provider fixture, source mutation, or old Task6 seal is started here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { entryConfiguration, mainModuleUrl, runtimeConfiguration, assertLoadedRuntime } = require('./helpers/four-session-entry.cjs');

const root = path.resolve(__dirname, '..');
const fixedSource = 'b032d2b6946a6297793b51b95b00a29aae6f3b89';
const sdkVersion = '0.8.7';
const fixedFonts = Object.freeze([
  'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_four@1.0/HCRDotum.woff',
  'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2104@1.0/HANBatang.woff',
]);
const mimeTypes = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};
const requiredModules = [
  'main', 'state', 'store', 'idb-store', 'text-editor', 'project-io', 'project-status',
  'ai-workbench', 'ai-task-workspaces', 'ai-candidate-snapshot', 'ai-image-review',
  'ai-label-background', 'rhwp-exam-workspace', 'rhwp-exam-source-tabs',
];
// Transcribed from preserved Task6 vendor-hashes.json (sourceSha256 and bytes),
// not learned from the candidate at test time. Runtime receipts are fresh.
const pinnedVendor = new Map([
  ["vendor/rhwp-editor/LICENSE", { sha256: "1c3a7d5643b163a3ead4965e1bea33b832caee5bfca265efe42afcd7bc696b5b", bytes: 1072 }],
  ["vendor/rhwp-editor/README.md", { sha256: "7c190bc8954cc71b17edb684bfd0279c78d39099930a2c2dec9d7a79e911a876", bytes: 25055 }],
  ["vendor/rhwp-editor/document-agent-contract.js", { sha256: "9319ec9ddaec5c0a33cc45d24ff03122b1c9191b127dda2086621ac86b9655f1", bytes: 9725 }],
  ["vendor/rhwp-editor/index.d.ts", { sha256: "6b8a88ff8c43c0df024e0c9013f87520d8831890393be9ced890363742514471", bytes: 15356 }],
  ["vendor/rhwp-editor/index.js", { sha256: "c9fab3743e713c46fd72c20f798333a4e70021ed7fcc7bdc56f0e144dd7b9431", bytes: 18350 }],
  ["vendor/rhwp-editor/package.json", { sha256: "39c9930d7b63ade9ef23d29f26e99b78060cd3c93a2f6b0bbe198e3d492061a0", bytes: 888 }],
  ["vendor/rhwp-editor/transport.js", { sha256: "2ee9f915e70b9621b90fd9f578c269a085757da85565ee649877832e312c7877", bytes: 10656 }],
  ["vendor/rhwp-studio/LICENSE", { sha256: "1c3a7d5643b163a3ead4965e1bea33b832caee5bfca265efe42afcd7bc696b5b", bytes: 1072 }],
  ["vendor/rhwp-studio/LICENSE-FONTS", { sha256: "d28c4c4ba705a6a40ea0f5f950afb9dceca146d94ddf432572190921fecf5d94", bytes: 4686 }],
  ["vendor/rhwp-studio/assets/canvaskit-renderer-qwNCZ9x6.js", { sha256: "3b7efb4d890bbdc9d59780d43a6041ac37b88d3dbb76682a0c31983c2b2e6788", bytes: 247494 }],
  ["vendor/rhwp-studio/assets/index-CJqHfaJX.css", { sha256: "77febd44c7840da15121989e64d344123d5d353b9d7c4ecc66f44ac8d544110e", bytes: 113835 }],
  ["vendor/rhwp-studio/assets/index-zNX2Cct6.js", { sha256: "b78ebda7b1f3b521485d4109f5fe2d1faefb9f495b4481e73b17c7401d1b19f2", bytes: 2116313 }],
  ["vendor/rhwp-studio/assets/rhwp_bg-BkVWMBaR.wasm", { sha256: "54cf95014312e605c51b98eb9021247ea79ef2bbd0a7080e11c011d0246e3989", bytes: 11821756 }],
  ["vendor/rhwp-studio/assets/studio-plugin-7wns0tfd.js", { sha256: "3523819ac5b02bf6ae7cbe43d818ac0abaacf2dd09e03594c5b3172ed835e828", bytes: 54381 }],
  ["vendor/rhwp-studio/fonts/Cafe24Ssurround-v2.0.woff2", { sha256: "2d726dbf8863d66e6d5cf56e2532c5d14d8a4b514461b565c513c1da6ae2f41a", bytes: 391868 }],
  ["vendor/rhwp-studio/fonts/Cafe24Supermagic-Regular-v1.0.woff2", { sha256: "65434a217b9532867a1fe41417d0ad51210a60027a51dca40748aafed48ef0ba", bytes: 765684 }],
  ["vendor/rhwp-studio/fonts/D2Coding-Regular.woff2", { sha256: "358df12fdf9b65d0fd31554a826f97af4eeefd96a047297a28a856315fe872c1", bytes: 1485508 }],
  ["vendor/rhwp-studio/fonts/GowunBatang-Regular.woff2", { sha256: "0c6a288aa0c12081dccde769c312f71f290b353243747dd24fb8c57f94f01d72", bytes: 495092 }],
  ["vendor/rhwp-studio/fonts/GowunDodum-Regular.woff2", { sha256: "349c098a6181952dab564bf891b8efcacfbf855adc28d40b4aa2e5937c101c56", bytes: 406476 }],
  ["vendor/rhwp-studio/fonts/Happiness-Sans-Bold.woff2", { sha256: "54becdfd4f7f58e872eba8fbc67778e29cff94c1cd03f9a0ebadfbe482b4aba0", bytes: 336604 }],
  ["vendor/rhwp-studio/fonts/Happiness-Sans-Regular.woff2", { sha256: "4fc37e7663c3d440b5a6af6938bde0c6618b666553ed521745f3362050bd4988", bytes: 291556 }],
  ["vendor/rhwp-studio/fonts/Happiness-Sans-Title.woff2", { sha256: "057e6821a062d9192964d99cf058fe6608230e9e4a464c9652b3756e02460e22", bytes: 348700 }],
  ["vendor/rhwp-studio/fonts/HappinessSansVF.woff2", { sha256: "cd29de60acf8c466938400561fcbfb14812dd5981f4f78b0c8da74609682423c", bytes: 613412 }],
  ["vendor/rhwp-studio/fonts/LatinModernMath-Regular.woff2", { sha256: "1177d9025d1e797c54b3c7676976365abd90f903423091de7f0f4e7a4b372162", bytes: 391760 }],
  ["vendor/rhwp-studio/fonts/NanumGothic-Regular.woff2", { sha256: "4a000e3bca1298c43c70dc97447e537a27e0a8c1585f410be57dfeff06d3f713", bytes: 340688 }],
  ["vendor/rhwp-studio/fonts/NanumGothicCoding-Regular.woff2", { sha256: "87ab32ebaf4e1f803099ad1d096744092c8f985b2e08a24e2304f5ac05d81d6a", bytes: 521332 }],
  ["vendor/rhwp-studio/fonts/NanumMyeongjo-Regular.woff2", { sha256: "561e9193a6e848b3f7ce9f8f5907310a13e175bc9d69e77da2842a7517a97c16", bytes: 502068 }],
  ["vendor/rhwp-studio/fonts/NotoSansKR-Bold.woff2", { sha256: "dab3d492daa687386292cff1499225db580f931f800ee0d124eb0636378c6020", bytes: 559192 }],
  ["vendor/rhwp-studio/fonts/NotoSansKR-ExtraLight.woff2", { sha256: "3b5cac6af73fd94fa91ded10f6cfc54c7ce52189986fe7ca6fd457208f1d3673", bytes: 592496 }],
  ["vendor/rhwp-studio/fonts/NotoSansKR-Regular.woff2", { sha256: "d1bf8649914a4fe9477a8735bf056383e44e466141fb3d61897252e06d900c1a", bytes: 562220 }],
  ["vendor/rhwp-studio/fonts/NotoSerifKR-Bold.woff2", { sha256: "504d6af6abb882acd912d47bafa383c4512a6c8c33635e4e8fb37111d9310941", bytes: 1033556 }],
  ["vendor/rhwp-studio/fonts/NotoSerifKR-Regular.woff2", { sha256: "c9a1e3ac69994d680883b53b1fd83d520733b704792522a932bfaa276117de45", bytes: 971428 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Black.woff2", { sha256: "c5fd0c3568fc1368a3edc0d0fbb36df029935954276e3573451b3bae09e27296", bytes: 800404 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Bold.woff2", { sha256: "4609c3356e536fafe38f4add0daeceb3d8595d3057bce13c428c33ddbd43d362", bytes: 791156 }],
  ["vendor/rhwp-studio/fonts/Pretendard-ExtraBold.woff2", { sha256: "dd7c1e156f508eb962acc7a33a7a1896d1e0b71e11156fad96e731689ceb6dc3", bytes: 793540 }],
  ["vendor/rhwp-studio/fonts/Pretendard-ExtraLight.woff2", { sha256: "df43dc9165dff4542114674bcd8b79b7daae6dec004004586d5d076fec6fe2aa", bytes: 734392 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Light.woff2", { sha256: "b7426635cce2ea2b95c9c802e43fba1c620e0dafaf25f737c069b8b4e09fa841", bytes: 757000 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Medium.woff2", { sha256: "d03481330eeba0659ab5b87f25ceb504a35de377dd90a0d0aba2982eb2d05e2c", bytes: 778432 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Regular.woff2", { sha256: "fad853f7f47c6c8b103171e7193fa095708cdcd70850a71d93aa5379e8a61d63", bytes: 765892 }],
  ["vendor/rhwp-studio/fonts/Pretendard-SemiBold.woff2", { sha256: "c863f76a7de5c1ddc1ed8b2fa794964530774592c4f31407a84e2a2ae93f17f0", bytes: 785856 }],
  ["vendor/rhwp-studio/fonts/Pretendard-Thin.woff2", { sha256: "1539755224a64719d5b18406762c476db74fcc299b9e4641ca1e9812fbc7a09b", bytes: 694804 }],
  ["vendor/rhwp-studio/fonts/SourceHanSerifK-OldHangul-subset.woff2", { sha256: "9e419cd16df2ea3b220aa7751320d956ac2493440ba412484d98325078f09d43", bytes: 239628 }],
  ["vendor/rhwp-studio/fonts/SpoqaHanSans-Regular.woff2", { sha256: "6568bf80b50c14f2e54f56f2c07e668416f39f880baf5ea2825d315767f98f69", bytes: 275144 }],
  ["vendor/rhwp-studio/images/icon_small_ko.svg", { sha256: "a0ac1200a41b6a75e9afb30cda5bb850276087d45c2f25870605888238ba9b39", bytes: 469618 }],
  ["vendor/rhwp-studio/images/icon_small_ko_dark.svg", { sha256: "9d02ea0b8c1d399a89290d97613759826f19f3e3f392b6d79dcf6109e7e15fa6", bytes: 451775 }],
  ["vendor/rhwp-studio/index.html", { sha256: "5bd733cb7edfa921da36dc7b0a6d68b7c13590d2d57d43ee7aa7821139a24be4", bytes: 86815 }],
  ["vendor/rhwp-studio/locale-init.js", { sha256: "633d47a6a53b2211cf816769f8c084b097c1b60b6ab263803d8610c0531539fa", bytes: 1342 }],
  ["vendor/rhwp-studio/provenance.json", { sha256: "9a9606deef144eeee0064c376ae56b848479932892f612bb0e9a808a197d5fe0", bytes: 7332 }],
  ["vendor/rhwp-studio/theme-init.js", { sha256: "5a3afcc0139187bfe509414cd60fde2a0dfea72fd72751c4e6e696cdc0f6c587", bytes: 2783 }],
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonFile = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function ownedFile(pathname, siteRoot = root) {
  const decoded = decodeURIComponent(pathname);
  assert.ok(decoded.startsWith('/') && !decoded.includes('\\') && !decoded.includes('\0'), 'Unsafe local URL');
  assert.equal(path.posix.normalize(decoded), decoded, `Noncanonical local URL: ${pathname}`);
  const base = fs.realpathSync(siteRoot);
  let file = path.resolve(base, '.' + decoded);
  assert.ok(file === base || file.startsWith(base + path.sep), 'Local URL escapes owned root');
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  file = fs.realpathSync(file);
  assert.ok(file.startsWith(base + path.sep), 'Local symlink escapes owned root');
  assert.ok(fs.statSync(file).isFile(), `Unknown static local URL: ${pathname}`);
  return file;
}

function classifyUrl(href, origin) {
  const url = new URL(href);
  if (!['http:', 'https:'].includes(url.protocol)) return 'non-http';
  if (url.origin === origin) return url.pathname.startsWith('/api/') ? 'api' : 'local-static';
  return fixedFonts.includes(url.href) ? 'conditional-external-font' : 'blocked-external-ui';
}

function checkBody(record, bytes, origin, siteRoot = root) {
  record.bytes = bytes.length;
  record.sha256 = sha256(bytes);
  record.contentType = record.headers['content-type'] || '';
  if (record.classification === 'local-static') {
    const file = ownedFile(new URL(record.url).pathname, siteRoot);
    const disk = fs.readFileSync(file);
    record.diskPath = path.relative(siteRoot, file).split(path.sep).join('/');
    record.diskBytes = disk.length;
    record.diskSha256 = sha256(disk);
    record.matchesOwnedDisk = record.bytes === record.diskBytes && record.sha256 === record.diskSha256;
    assert.equal(record.status, 200, `Static HTTP status: ${record.url}`);
    assert.ok(record.matchesOwnedDisk, `Response differs from owned disk: ${record.url}`);
    assert.equal(record.contentType.split(';')[0].trim().toLowerCase(),
      mimeTypes[path.extname(file)] || 'application/octet-stream', `Static MIME: ${record.url}`);
    if (/^vendor\/rhwp-(?:editor|studio)\//.test(record.diskPath)) {
      const pin = pinnedVendor.get(record.diskPath);
      assert.ok(pin, `RHWP resource absent from fixed source inventory: ${record.diskPath}`);
      record.fixedSource = fixedSource;
      record.sourceSha256 = pin.sha256;
      assert.equal(record.sha256, pin.sha256, `RHWP source hash: ${record.diskPath}`);
      assert.equal(record.bytes, pin.bytes, `RHWP source bytes: ${record.diskPath}`);
    }
  } else if (record.classification === 'api') {
    // APIs cannot acquire a static-disk success by falling through the mapper.
    assert.equal(new URL(record.url).origin, origin);
    assert.equal(new URL(record.url).pathname, '/api/local-ai-config', 'Unexpected local API response');
    assert.equal(record.method, 'GET', 'Only read-only local configuration is permitted');
    assert.equal(record.status, 200, 'Local configuration HTTP status');
    assert.equal(record.contentType.split(';')[0].trim(), 'application/json');
    assert.equal(typeof JSON.parse(bytes.toString('utf8')).local, 'boolean');
    record.diskComparison = 'not-applicable: dynamic API response';
  } else if (record.classification === 'conditional-external-font') {
    assert.equal(record.status, 200, `Requested existing font: ${record.url}`);
    assert.ok(bytes.length > 0 && record.contentType, 'Requested font has a body and MIME');
    record.hashApproval = 'observed-only; no approved byte hash is known for this existing fixed URL';
  } else {
    assert.fail(`Unexpected response classification: ${record.classification} ${record.url}`);
  }
}

function deadline(promise, label, timeout = 90_000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} completion deadline`)), timeout);
  })]).finally(() => clearTimeout(timer));
}

class ResourceCollector {
  constructor(context, origin, siteRoot = root) {
    this.context = context; this.origin = origin; this.siteRoot = siteRoot;
    this.records = []; this.requests = new Map(); this.active = new Set();
    this.pendingBodies = new Set(); this.waiters = new Set(); this.generation = 0;
    this.handlers = {
      request: request => this.request(request),
      response: response => this.response(response),
      requestfinished: request => this.complete(request),
      requestfailed: request => this.complete(request, request.failure()?.errorText || 'Request failed'),
    };
    for (const [event, handler] of Object.entries(this.handlers)) context.on(event, handler);
  }
  changed() {
    this.generation++;
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
  }
  request(request) {
    if (this.requests.has(request) || classifyUrl(request.url(), this.origin) === 'non-http') return;
    const record = { url: request.url(), method: request.method(), resourceType: request.resourceType(),
      classification: classifyUrl(request.url(), this.origin) };
    this.requests.set(request, record); this.records.push(record); this.active.add(request); this.changed();
  }
  response(response) {
    const request = response.request(); this.request(request);
    const record = this.requests.get(request);
    if (!record) return;
    record.status = response.status(); record.headers = response.headers();
    // Keep every body task, including ones appended while earlier tasks settle.
    const task = (async () => {
      try {
        const bytes = await response.body();
        record.body = bytes;
        checkBody(record, bytes, this.origin, this.siteRoot);
      } catch (error) { record.bodyError = error.message; }
    })();
    record.bodyTask = task; this.pendingBodies.add(task); this.changed();
    void task.finally(() => { this.pendingBodies.delete(task); this.changed(); });
  }
  complete(request, error) {
    const record = this.requests.get(request);
    if (record) { record.completed = true; if (error) record.requestError = error; }
    this.active.delete(request); this.changed();
  }
  async settle() {
    await deadline((async () => {
      for (;;) {
        if (this.active.size || this.pendingBodies.size) {
          await new Promise(resolve => this.waiters.add(resolve));
          continue;
        }
        const generation = this.generation;
        await Promise.resolve();
        if (generation === this.generation && !this.active.size && !this.pendingBodies.size) return;
      }
    })(), 'All requested resources and appended response bodies');
  }
  async body(url) {
    const record = this.records.find(item => item.url === url && item.bodyTask);
    assert.ok(record, `Actual browser response is missing: ${url}`);
    await record.bodyTask;
    assert.ok(!record.bodyError, record.bodyError);
    return record.body;
  }
  assertClosed() {
    assert.equal(this.active.size, 0, 'Outstanding browser requests at resource boundary');
    assert.equal(this.pendingBodies.size, 0, 'Outstanding body promises at resource boundary');
    const failures = this.records.filter(record => record.classification !== 'blocked-external-ui'
      && (!record.completed || record.requestError || record.bodyError || !record.sha256));
    assert.deepEqual(failures.map(({ body, bodyTask, ...record }) => record), [], 'Requested body closure failures');
    for (const record of this.records.filter(item => item.classification === 'local-static')) {
      const current = fs.readFileSync(ownedFile(new URL(record.url).pathname, this.siteRoot));
      record.finalDiskBytes = current.length; record.finalDiskSha256 = sha256(current);
      record.finalMatchesOwnedDisk = record.bytes === current.length && record.sha256 === record.finalDiskSha256;
      assert.ok(record.finalMatchesOwnedDisk, `Disk changed after response capture: ${record.url}`);
    }
  }
  receipt() { return this.records.map(({ body, bodyTask, ...record }) => record); }
  detach() { for (const [event, handler] of Object.entries(this.handlers)) this.context.off(event, handler); }
}

function assertModuleIdentities(runtime, records) {
  const urls = records.filter(record => record.classification === 'local-static')
    .map(record => record.url);
  assertLoadedRuntime(runtime, urls);
  const byFile = new Map();
  const declaredUrls = new Set();
  // The network URL omits fragments, and symlink aliases can resolve to a
  // canonical file from outside /js/. Inspect both disk identities and literal
  // imports in observed module bodies to catch those otherwise invisible cases.
  for (const record of records.filter(item => item.classification === 'local-static')) {
    const url = new URL(record.url);
    if (record.diskPath?.startsWith('js/') && record.diskPath.endsWith('.js'))
      assert.equal(url.pathname, '/' + record.diskPath, `Canonical module disk path alias: ${record.url}`);
    const basename = path.posix.basename(decodeURIComponent(url.pathname), '.js');
    if (url.pathname.endsWith('.js') && requiredModules.includes(basename))
      assert.equal(url.pathname, `/js/${basename}.js`, `Stateful module path alias: ${record.url}`);
    const graphPath = decodeURIComponent(url.pathname).match(/\/((?:graph|function-graph)\/.+\.js)$/);
    if (graphPath) assert.equal(url.pathname, '/js/' + graphPath[1], `Graph module path alias: ${record.url}`);
    if (!record.body || !url.pathname.startsWith('/js/') || !url.pathname.endsWith('.js')) continue;
    const imports = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}\/|\/)[^"']+\.js(?:[?#][^"']*)?)["']/g;
    for (const match of record.body.toString('utf8').matchAll(imports)) {
      const imported = new URL(match[1], url);
      if (imported.pathname.startsWith('/preview/js/')) assert.fail(`Declared preview module duplicate: ${imported.href}`);
      if (!imported.pathname.startsWith('/js/')) continue;
      assert.equal(imported.href, new URL(imported.pathname + runtime.moduleQuery, runtime.entryUrl).href,
        `Declared canonical module identity: ${imported.href}`);
      assert.equal(imported.pathname, decodeURIComponent(imported.pathname), `Declared encoded module alias: ${imported.href}`);
      declaredUrls.add(imported.href);
    }
  }
  for (const href of urls) {
    const url = new URL(href), decoded = decodeURIComponent(url.pathname);
    if (!/\/(?:js)\/.*\.js$/.test(decoded)) continue;
    assert.ok(url.pathname.startsWith('/js/'), `Preview duplicate or module path alias: ${href}`);
    assert.equal(url.pathname, decoded, `Encoded module alias: ${href}`);
    assert.equal(url.pathname, path.posix.normalize(url.pathname), `Module path alias: ${href}`);
    assert.equal(url.search, runtime.moduleQuery, `Canonical module query identity: ${href}`);
    assert.equal(url.hash, '', `Module fragment alias: ${href}`);
    if (!byFile.has(decoded)) byFile.set(decoded, new Set());
    byFile.get(decoded).add(href);
  }
  for (const [file, identities] of byFile) assert.deepEqual([...identities], [new URL(file + runtime.moduleQuery, runtime.entryUrl).href]);
  for (const name of requiredModules) assert.ok(byFile.has(`/js/${name}.js`), `Required module never loaded: ${name}`);
  for (const file of ['/js/graph/graph-modal.js', '/js/function-graph/plane-modal.js'])
    assert.ok(byFile.has(file), `Graph stateful module never loaded: ${file}`);
  const graphModules = [...byFile.keys()].filter(file => /^\/js\/(?:graph|function-graph)\//.test(file));
  assert.ok(graphModules.length > 2, 'Actual graph dependency closure is loaded');
  return { requiredModules, graphModules, declaredCanonicalModuleUrls: [...declaredUrls],
    allLoadedCanonicalModules: [...byFile].map(([file, urls]) => ({ file, url: [...urls][0] })) };
}

function pinnedDiskProof() {
  assert.ok(pinnedVendor.size > 40, 'Complete fixed RHWP source inventory is required');
  const files = [...pinnedVendor].map(([file, pin]) => {
    const bytes = fs.readFileSync(ownedFile('/' + file));
    assert.equal(bytes.length, pin.bytes, `Fixed source disk length: ${file}`);
    assert.equal(sha256(bytes), pin.sha256, `Fixed source disk SHA256: ${file}`);
    return { path: file, bytes: bytes.length, sha256: pin.sha256 };
  });
  const pkg = jsonFile(path.join(root, 'vendor/rhwp-editor/package.json'));
  const provenance = jsonFile(path.join(root, 'vendor/rhwp-studio/provenance.json'));
  assert.equal(pkg.version, sdkVersion); assert.equal(provenance.editorSdkVersion, sdkVersion);
  for (const item of provenance.files.filter(item => !item.unavailable)) {
    const pin = pinnedVendor.get('vendor/rhwp-studio/' + item.path);
    assert.ok(pin, `Provenance entry absent from fixed source: ${item.path}`);
    assert.equal(item.sha256, pin.sha256); assert.equal(item.bytes, pin.bytes);
  }
  return { fixedSource, sdkVersion, files, provenanceSha256: pinnedVendor.get('vendor/rhwp-studio/provenance.json').sha256 };
}

function embeddedOcrWasm(source) {
  const matches = [...source.matchAll(/\bGa\("(AGFzbQ[A-Za-z0-9+/=]+)"\)/g)];
  assert.equal(matches.length, 1, 'Bundled OCR core must contain exactly one embedded WASM binary');
  const bytes = Buffer.from(matches[0][1], 'base64');
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0], 'Embedded OCR WASM header');
  assert.ok(WebAssembly.validate(bytes), 'Embedded OCR WASM is valid');
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function externalOrigin(env = process.env) {
  const configured = env.RELEASE_URL || env.EXAM_URL;
  assert.ok(configured, 'RELEASE_URL or EXAM_URL must name the externally owned candidate (for example http://127.0.0.1:65177/)');
  const base = new URL(configured);
  assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password);
  for (const value of [env.RELEASE_URL, env.EXAM_URL].filter(Boolean))
    assert.equal(new URL(value).origin, base.origin, 'RELEASE_URL and EXAM_URL must identify the same candidate origin');
  return base;
}

function privateEvidenceDirectory(env = process.env) {
  const directory = path.resolve(env.EVIDENCE_DIR || path.join(root, '.omo/evidence/four-session-resource-closure'));
  const relative = path.relative(root, directory);
  assert.ok(relative === '.omo' || relative.startsWith('.omo' + path.sep), 'Resource evidence must remain in private .omo');
  fs.mkdirSync(directory, { recursive: true });
  assert.ok(fs.realpathSync(directory).startsWith(fs.realpathSync(path.join(root, '.omo')) + path.sep), 'Evidence symlink escapes private .omo');
  return directory;
}

async function probeFeatures(page, runtime) {
  const { waitForState } = require('./helpers/rhwp-exam.cjs');
  await waitForState(page, () => {
    const panel = document.querySelector('#rhwp-exam-workspace');
    const deps = document.querySelector('#exam-studio iframe')?.contentWindow?.rhwpStudio?.plugins?.deps;
    return panel?.getAttribute('aria-busy') === 'false' && deps?.wasm?.pageCount > 0 && !!deps.getInputHandler();
  });
  assert.equal(await page.locator('#exam-status').getAttribute('data-error'), 'false', await page.locator('#exam-status').textContent());
  const rhwp = await page.evaluate(() => {
    const deps = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;
    const input = deps.getInputHandler(), before = input.history.undoStack.length;
    input.executeOperation({ kind: 'snapshot', operationType: 'resource-closure-proof', operation: () => {
      deps.wasm.insertText(0, 0, 0, '자원 검증');
      return { sectionIndex: 0, paragraphIndex: 0, charOffset: 5 };
    } });
    deps.eventBus.emit('document-changed');
    return { before, after: input.history.undoStack.length, pages: deps.wasm.pageCount, generation: deps.wasm.documentGeneration };
  });
  assert.equal(rhwp.after, rhwp.before + 1, 'Pinned RHWP executes a real document operation');
  assert.ok(rhwp.pages > 0);
  await page.locator('[data-exam-action="close"]').click();
  await page.locator('#rhwp-exam-workspace').waitFor({ state: 'hidden' });

  await page.locator('#graph-tool-open').click();
  await page.locator('#graph-modal-overlay:not([hidden])').waitFor();
  await page.locator('#gm-labelx').fill('시간');
  await page.locator('#gm-tab-func-btn').click();
  await page.locator('#gm-add-series').click();
  await page.locator('#gm-expr').fill('x');
  await page.locator('#gm-confirm').click();
  await page.locator('#graph-modal-overlay').waitFor({ state: 'hidden' });
  const graph = await page.evaluate(async stateUrl => {
    // This state URL was already observed before the probe; importing it cannot
    // manufacture an unobserved state instance to satisfy the identity oracle.
    const { state } = await import(stateUrl);
    return state.get().objects.filter(object => ['coordplane', 'funcgraph'].includes(object.type)).map(object => ({ id: object.id, type: object.type, expr: object.expr }));
  }, runtime.stateUrl);
  assert.ok(graph.some(object => object.type === 'coordplane'));
  assert.ok(graph.some(object => object.type === 'funcgraph' && object.expr === 'x'));
  for (const object of graph) await page.locator(`#scene [data-id="${object.id}"]`).first().waitFor({ state: 'attached' });
  const project = await page.evaluate(async ({ stateUrl, projectUrl }) => {
    const { state } = await import(stateUrl), { serialize } = await import(projectUrl);
    const saved = serialize(state.get());
    return { version: saved.version, activePageId: saved.activePageId,
      pages: saved.pages.map(item => ({ id: item.id, objects: item.objects.filter(object => ['coordplane', 'funcgraph'].includes(object.type)) })) };
  }, { stateUrl: runtime.stateUrl, projectUrl: new URL('project-io.js' + runtime.moduleQuery, runtime.mainUrl).href });
  assert.ok(project.pages.some(item => item.objects.some(object => object.type === 'funcgraph' && object.expr === 'x')),
    'Existing project serializer retains the native graph');

  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel').waitFor({ state: 'visible' });
  await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
  assert.equal(await page.locator('#ai-image-panel [data-ai-workflow="graph"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#ai-image-panel [data-ai-workflow="image"]').click();
  await page.locator('#ai-image-panel [data-ai-close]').click();
  await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });

  const ocr = await deadline(page.evaluate(async moduleUrl => {
    const { collectSourceLabelCandidates } = await import(moduleUrl);
    const canvas = document.createElement('canvas'); canvas.width = 500; canvas.height = 150;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 500, 150);
    ctx.fillStyle = 'black'; ctx.font = '40px Arial'; ctx.fillText('Sensor', 40, 80);
    const data = canvas.toDataURL('image/png');
    const sourceSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await collectSourceLabelCandidates({ data, sourceSha256, width: 500, height: 150 });
    return { width: result.width, height: result.height, sourceSha256: result.sourceSha256,
      sourceBytesSha256: result.sourceBytesSha256, candidates: result.candidates, timings: result.timings };
  }, new URL('ai-source-label-candidates.js' + runtime.moduleQuery, runtime.mainUrl).href), 'Existing local OCR workflow');
  assert.ok(ocr.candidates.some(candidate => /Sensor/i.test(candidate.text)), 'Real bundled OCR recognizes the source');
  assert.ok(ocr.candidates.every(candidate => candidate.origin === 'ocr'));
  assert.equal(ocr.width, 500); assert.equal(ocr.height, 150); assert.match(ocr.sourceBytesSha256, /^[a-f0-9]{64}$/);

  const fontFaces = await deadline(page.evaluate(async () => {
    const frameDocument = document.querySelector('#exam-studio iframe').contentDocument;
    await Promise.all([document.fonts.ready, frameDocument.fonts.ready]);
    return { root: [...document.fonts].map(face => ({ family: face.family, status: face.status })),
      rhwp: [...frameDocument.fonts].map(face => ({ family: face.family, status: face.status })) };
  }), 'Root and RHWP font loading');
  const metadata = await page.evaluate(async origin => {
    const read = async pathname => {
      const response = await fetch(new URL(pathname, origin));
      if (!response.ok) throw new Error(`Pinned metadata HTTP ${response.status}: ${pathname}`);
      return response.json();
    };
    return { package: await read('/vendor/rhwp-editor/package.json'), provenance: await read('/vendor/rhwp-studio/provenance.json') };
  }, new URL(runtime.entryUrl).origin);
  assert.equal(metadata.package.version, sdkVersion); assert.equal(metadata.provenance.editorSdkVersion, sdkVersion);
  return { rhwp, graph, project, aiWorkflowSwitches: ['graph', 'image'], ocr, fontFaces, sdkVersion: metadata.package.version };
}

async function browserScenario(engineName, entry) {
  const base = externalOrigin(), origin = base.origin, evidenceDirectory = privateEvidenceDirectory();
  const config = entryConfiguration({ ...process.env, APP_ENTRY: entry });
  const vendorProof = pinnedDiskProof();
  const { [engineName]: engine } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  let browser, context, collector, failure;
  const receipt = { engine: engineName, entry, origin, fixedSource, startedAt: new Date().toISOString(), vendorDiskProof: vendorProof,
    pageErrors: [], blockedExternalUi: [], forbiddenApiAttempts: [], cleanup: {}, passed: false,
    boundaryScope: 'Requested bodies through completed RHWP, graph, workbench switches, local OCR worker termination and document.fonts.ready; untriggered features are not certified.' };
  try {
    browser = await engine.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
    collector = new ResourceCollector(context, origin);
    context.on('page', page => page.on('pageerror', error => receipt.pageErrors.push({ url: page.url(), message: error.message })));
    await context.route('**/*', route => {
      const request = route.request(), classification = classifyUrl(request.url(), origin);
      if (classification === 'blocked-external-ui') {
        const url = new URL(request.url());
        if (/^\/(?:api\/|v1\/(?:responses|chat|images|models))/.test(url.pathname))
          receipt.forbiddenApiAttempts.push({ url: request.url(), method: request.method(), external: true });
        else receipt.blockedExternalUi.push(request.url());
        return route.abort('blockedbyclient');
      }
      if (classification === 'api' && (new URL(request.url()).pathname !== '/api/local-ai-config' || request.method() !== 'GET')) {
        receipt.forbiddenApiAttempts.push({ url: request.url(), method: request.method() });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    const entryUrl = new URL(entry, origin); entryUrl.search = base.search;
    for (const [key, value] of [['mode', 'pro'], ['mobile', '0'], ['exam', '1']]) entryUrl.searchParams.set(key, value);
    const response = await page.goto(entryUrl.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    assert.ok(response); assert.equal(response.status(), 200);
    const html = (await collector.body(response.url())).toString('utf8');
    const mainUrl = mainModuleUrl(html, entryUrl.href);
    const mainSource = (await collector.body(mainUrl)).toString('utf8');
    const runtime = runtimeConfiguration(config, entryUrl.href, mainUrl, mainSource);
    assert.equal(runtime.moduleBase, '/js/', 'Both entries must use the canonical root');
    assert.equal(new URL(runtime.mainUrl).search, runtime.moduleQuery, 'Main and state preserve the root query');
    receipt.runtime = runtime;
    assertLoadedRuntime(runtime, collector.records.map(record => record.url));
    // Establish preexisting identities before the probe imports state/project IO.
    for (const name of ['state', 'project-io'])
      assert.ok(collector.records.some(record => record.url === new URL(name + '.js' + runtime.moduleQuery, mainUrl).href && record.bodyTask),
        `Probe must not manufacture an unloaded ${name} module`);
    receipt.features = await probeFeatures(page, runtime);
    await collector.settle(); collector.assertClosed();
    receipt.moduleIdentities = assertModuleIdentities(runtime, collector.records);
    for (const file of ['vendor/rhwp-editor/index.js', 'vendor/rhwp-editor/transport.js',
      'vendor/rhwp-studio/index.html', 'vendor/rhwp-studio/assets/index-zNX2Cct6.js', 'vendor/rhwp-studio/assets/rhwp_bg-BkVWMBaR.wasm'])
      assert.ok(collector.records.some(record => record.diskPath === file && record.matchesOwnedDisk && record.sourceSha256), `Actual pinned RHWP resource was not loaded: ${file}`);
    const ocrRecords = collector.records.filter(record => record.diskPath?.startsWith('vendor/ocr/'));
    for (const file of ['vendor/ocr/tesseract.esm.min.js', 'vendor/ocr/worker.min.js', 'vendor/ocr/tesseract-core-simd-lstm.wasm.js',
      'vendor/ocr/lang/kor.traineddata.gz', 'vendor/ocr/lang/eng.traineddata.gz'])
      assert.ok(ocrRecords.some(record => record.diskPath === file && record.matchesOwnedDisk), `Actual OCR resource body missing: ${file}`);
    const core = ocrRecords.find(record => record.diskPath === 'vendor/ocr/tesseract-core-simd-lstm.wasm.js');
    const wasm = embeddedOcrWasm(core.body.toString('utf8'));
    assert.deepEqual(wasm, embeddedOcrWasm(fs.readFileSync(ownedFile('/' + core.diskPath), 'utf8')));
    receipt.ocrWasm = { ...wasm, delivery: 'embedded in the actually requested and disk-matched core script; no separate OCR WASM HTTP response', carrierUrl: core.url, carrierSha256: core.sha256 };
    assert.deepEqual(receipt.forbiddenApiAttempts, [], 'Workflow must not call provider/authentication APIs');
    assert.deepEqual(receipt.pageErrors, [], 'Runtime errors must remain visible');
    receipt.externalFonts = fixedFonts.map(url => ({ url,
      requested: collector.records.some(record => record.url === url),
      observed: collector.receipt().filter(record => record.url === url),
      approval: 'Existing fixed URL only; observed bytes are not an approved historical hash. Unrequested conditional fonts are outside loaded closure.' }));
    receipt.unrequestedPinnedVendorFiles = [...pinnedVendor.keys()].filter(file => !collector.records.some(record => record.diskPath === file));
    receipt.settled = { activeRequests: collector.active.size, pendingBodies: collector.pendingBodies.size, eventGeneration: collector.generation };
    receipt.passed = true;
  } catch (error) {
    failure = error; receipt.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    // On failure, retain late body/error evidence without replacing the cause.
    if (collector) {
      try { await collector.settle(); } catch (error) { receipt.boundaryError = error.message; if (!failure) failure = error; }
      receipt.resources = collector.receipt(); collector.detach();
    }
    for (const [name, owned] of [['context', context], ['browser', browser]]) {
      try { if (owned) await owned.close(); receipt.cleanup[name + 'Closed'] = !!owned; }
      catch (error) { receipt.cleanup[name + 'Error'] = error.message; if (!failure) failure = error; }
    }
    receipt.passed = receipt.passed && !failure; receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDirectory, `${engineName}-${entry === '/' ? 'root' : 'preview'}.json`), JSON.stringify(receipt, null, 2));
  }
  if (failure) throw failure;
}

if (process.argv.includes('--self-test')) {
  test('local resource mapper closes directory entries and rejects unknown/traversal paths', () => {
    assert.equal(ownedFile('/'), path.join(root, 'index.html'));
    assert.equal(ownedFile('/preview/'), path.join(root, 'preview/index.html'));
    assert.equal(ownedFile('/vendor/rhwp-studio/'), path.join(root, 'vendor/rhwp-studio/index.html'));
    assert.throws(() => ownedFile('/unknown-resource-closure-file.js'));
    assert.throws(() => ownedFile('/%2e%2e/package.json'));
    assert.throws(() => ownedFile('/js/%2e%2e/state.js'));
    assert.throws(() => ownedFile('/js/%5cstate.js'));
  });
  test('fixed RHWP inventory and provenance are bound to b032 source bytes', () => { pinnedDiskProof(); });
  test('static resource oracle rejects substituted bytes, MIME and HTTP failures', () => {
    const origin = 'http://owned.invalid', bytes = fs.readFileSync(path.join(root, 'index.html'));
    const record = () => ({ url: origin + '/', method: 'GET', classification: 'local-static', status: 200, headers: { 'content-type': 'text/html' } });
    checkBody(record(), bytes, origin);
    assert.throws(() => checkBody(record(), Buffer.from('substituted'), origin), /differs/);
    assert.throws(() => checkBody({ ...record(), headers: { 'content-type': 'text/plain' } }, bytes, origin), /MIME/);
    assert.throws(() => checkBody({ ...record(), status: 404 }, bytes, origin), /status/);
    assert.throws(() => checkBody({ ...record(), url: origin + '/unknown-resource-closure-file.js' }, bytes, origin));
    const wasmPath = '/vendor/rhwp-studio/assets/rhwp_bg-BkVWMBaR.wasm';
    const wasmRecord = { ...record(), url: origin + wasmPath, headers: { 'content-type': 'application/wasm' } };
    const wasm = fs.readFileSync(ownedFile(wasmPath));
    checkBody(wasmRecord, wasm, origin);
    assert.throws(() => checkBody({ ...wasmRecord, headers: { 'content-type': 'application/octet-stream' } }, wasm, origin), /MIME/);
  });
  test('dynamic API and conditional external font bytes cannot claim static disk approval', () => {
    const origin = 'http://owned.invalid';
    const api = { url: origin + '/api/local-ai-config', method: 'GET', classification: 'api', status: 200, headers: { 'content-type': 'application/json' } };
    checkBody(api, Buffer.from('{"local":false}'), origin); assert.equal(api.matchesOwnedDisk, undefined);
    assert.throws(() => checkBody({ ...api, url: origin + '/api/bridge-send' }, Buffer.from('{}'), origin));
    const font = { url: fixedFonts[0], classification: 'conditional-external-font', status: 200, headers: { 'content-type': 'font/woff' } };
    checkBody(font, Buffer.from('observed-only'), origin); assert.equal(font.matchesOwnedDisk, undefined); assert.match(font.hashApproval, /observed-only/);
    assert.equal(classifyUrl(fixedFonts[0] + '?changed=1', origin), 'blocked-external-ui');
  });
  test('collector waits for requests and body promises appended during an earlier body', async () => {
    const context = new EventEmitter(), origin = 'http://owned.invalid', collector = new ResourceCollector(context, origin);
    const makeRequest = () => ({ url: () => origin + '/', method: () => 'GET', resourceType: () => 'document' });
    const first = makeRequest(), second = makeRequest(); let releaseSecond;
    context.emit('request', first);
    context.emit('response', { request: () => first, status: () => 200, headers: () => ({ 'content-type': 'text/html' }), body: async () => {
      await Promise.resolve(); context.emit('request', second);
      context.emit('response', { request: () => second, status: () => 200, headers: () => ({ 'content-type': 'text/html' }),
        body: () => new Promise(resolve => { releaseSecond = resolve; }) });
      context.emit('requestfinished', first); return fs.readFileSync(path.join(root, 'index.html'));
    } });
    let finished = false; const settled = collector.settle().then(() => { finished = true; });
    await Promise.resolve(); await Promise.resolve(); assert.equal(finished, false);
    releaseSecond(fs.readFileSync(path.join(root, 'index.html'))); context.emit('requestfinished', second);
    await settled; collector.assertClosed(); assert.equal(collector.receipt().length, 2); collector.detach();
  });
  test('collector retains failed response bodies instead of silently passing them', async () => {
    const context = new EventEmitter(), collector = new ResourceCollector(context, 'http://owned.invalid');
    const request = { url: () => 'http://owned.invalid/', method: () => 'GET', resourceType: () => 'document' };
    context.emit('request', request);
    context.emit('response', { request: () => request, status: () => 200, headers: () => ({ 'content-type': 'text/html' }), body: async () => { throw new Error('body read failed'); } });
    context.emit('requestfinished', request); await collector.settle();
    assert.throws(() => collector.assertClosed(), /closure failures/); assert.match(collector.receipt()[0].bodyError, /body read failed/); collector.detach();
  });
  test('collector rejects a requested local resource that never yielded a response body', async () => {
    const context = new EventEmitter(), collector = new ResourceCollector(context, 'http://owned.invalid');
    const request = { url: () => 'http://owned.invalid/js/state.js', method: () => 'GET', resourceType: () => 'script', failure: () => ({ errorText: 'failed before headers' }) };
    context.emit('request', request); context.emit('requestfailed', request); await collector.settle();
    assert.throws(() => collector.assertClosed(), /closure failures/);
    assert.equal(collector.receipt()[0].requestError, 'failed before headers'); collector.detach();
  });
  test('module oracle rejects second queries, preview duplicates, encoded and path aliases', () => {
    const origin = 'http://owned.invalid', query = '?v=owned';
    const runtime = { entryUrl: origin + '/', mainUrl: origin + '/js/main.js' + query, stateUrl: origin + '/js/state.js' + query, moduleQuery: query };
    const names = [...requiredModules.map(name => name + '.js'), 'graph/graph-modal.js', 'graph/trace-overlay.js', 'function-graph/plane-modal.js'];
    const records = names.map(name => ({ url: origin + '/js/' + name + query, classification: 'local-static' }));
    assertModuleIdentities(runtime, records);
    for (const alias of ['/js/state.js?v=second', '/preview/js/store.js?v=owned', '/js/%73tore.js?v=owned', '/alias/js/store.js?v=owned', '/alias/store.js?v=owned', '/alias/graph/graph-modal.js?v=owned'])
      assert.throws(() => assertModuleIdentities(runtime, [...records, { url: origin + alias, classification: 'local-static' }]));
    assert.throws(() => assertModuleIdentities(runtime, records.filter(record => !record.url.includes('/idb-store.js'))), /never loaded/);
    assert.throws(() => assertModuleIdentities(runtime, [...records, { url: origin + '/js/fragment.js' + query,
      classification: 'local-static', body: Buffer.from("import './store.js?v=owned#second-instance';") }]), /Declared canonical module identity/);
    assert.throws(() => assertModuleIdentities(runtime, [...records, { url: origin + '/alias.js' + query,
      classification: 'local-static', diskPath: 'js/store.js' }]), /disk path alias/);
  });
  test('external candidate selection requires explicit URLs and preserves their query', () => {
    assert.throws(() => externalOrigin({}));
    assert.equal(externalOrigin({ EXAM_URL: 'http://127.0.0.1:65177/?owned=1' }).search, '?owned=1');
    assert.throws(() => externalOrigin({ RELEASE_URL: 'http://127.0.0.1:65177/', EXAM_URL: 'http://127.0.0.1:65178/' }));
  });
  test('OCR WASM oracle distinguishes an embedded binary from a separate HTTP body', () => {
    const proof = embeddedOcrWasm('wa=Ga("AGFzbQEAAAA=")'); assert.equal(proof.bytes, 8);
    assert.throws(() => embeddedOcrWasm('no binary'));
    assert.throws(() => embeddedOcrWasm('Ga("AGFzbQAAAAA=")'));
    const existing = embeddedOcrWasm(fs.readFileSync(ownedFile('/vendor/ocr/tesseract-core-simd-lstm.wasm.js'), 'utf8'));
    assert.ok(existing.bytes > 1_000_000, 'The actual existing OCR core includes the valid embedded binary');
  });
  test('static canonical entry graph satisfies the expanded oracle without claiming browser loading', () => {
    const origin = 'http://owned.invalid', entryUrl = origin + '/';
    const mainUrl = mainModuleUrl(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), entryUrl);
    const runtime = runtimeConfiguration({ entry: '/' }, entryUrl, mainUrl, fs.readFileSync(ownedFile('/js/main.js'), 'utf8'));
    const pending = [mainUrl, new URL('/js/ai-workbench.js' + runtime.moduleQuery, origin).href], seen = new Set(), records = [];
    while (pending.length) {
      const url = pending.pop(); if (seen.has(url)) continue; seen.add(url);
      const file = ownedFile(new URL(url).pathname), body = fs.readFileSync(file);
      records.push({ url, body, classification: 'local-static', diskPath: path.relative(root, file).split(path.sep).join('/') });
      for (const match of body.toString('utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}\/|\/)[^"']+\.js(?:[?#][^"']*)?)["']/g)) {
        const imported = new URL(match[1], url);
        if (imported.pathname.startsWith('/js/')) pending.push(imported.href);
      }
    }
    assertModuleIdentities(runtime, records);
  });
} else {
  test('expanded resource closure on the externally owned combined candidate', { timeout: 1_200_000 }, async t => {
    externalOrigin();
    for (const engine of ['chromium', 'webkit']) for (const entry of ['/', '/preview/'])
      await t.test(`${engine} ${entry}`, { timeout: 300_000 }, () => browserScenario(engine, entry));
  });
}
