const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fixtureContext } = require('./canonical-fixture-adapter.cjs');

async function installCropFixture(page, { held = [], root = path.resolve(__dirname, '../..'), siteRoot = path.resolve(process.env.FIVE_E_SITE_ROOT || root), evidence, origin = process.env.PREVIEW_URL, libraryTransfer = false } = {}) {
  assert.ok(origin, 'Crop fixture requires the retained or owned test origin');
  assert.equal(typeof libraryTransfer, 'boolean', 'libraryTransfer must be an explicit boolean');
  assert.ok(held.every(key => /^(original|thumbnail|continuous|decode)-[1-3]$/.test(key)), 'Explicit crop gate selectors');
  const { runtime } = fixtureContext(root, { siteRoot });
  const moduleUrl = `${runtime.moduleBase}unified-library-ui.js${runtime.moduleQuery}`;
  const sourcePath = path.join(siteRoot, runtime.moduleBase, 'unified-library-ui.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const replaceOnce = (body, before, after) => {
    assert.equal(body.split(before).length - 1, 1, 'Original crop observation seam must occur once');
    return body.replace(before, after);
  };
  let body = replaceOnce(source, '    cropOpenOptions = { emptyDraft, wholePage, title };\n    const session = {',
    '    cropOpenOptions = { emptyDraft, wholePage, title };\n    const fixtureOperation = window.__cropRecord?.({ phase: "editor-start", number: result.provenance.pageNumber })?.sequence;\n    const session = {');
  body = replaceOnce(body, '      try { await cropImage.decode(); }',
    '      window.__cropRecord?.({ phase: "editor-decode-start", number: session.pageNumber, kind: first.kind, operation: fixtureOperation });\n      try { await cropImage.decode(); window.__cropRecord?.({ phase: "editor-decode-complete", number: session.pageNumber, kind: first.kind, operation: fixtureOperation }); }');
  body = replaceOnce(body, '        .catch(error => ({ kind: "error", error }));',
    '        .catch(error => ({ kind: "error", error }))\n        .finally(() => window.__cropRecord?.({ phase: "editor-original-settled", number: session.pageNumber, operation: fixtureOperation }));');
  body = replaceOnce(body, '      const fastPage = typeof cropDocumentFile?.loadPreview === "function"\n        ? Promise.resolve().then(() => cropDocumentFile.loadPreview(session.pageNumber, { continuous: true }))\n          .then(value => preparePage(value, "preview")).catch(() => null)\n        : Promise.resolve(null);',
    '      const fastPage = (typeof cropDocumentFile?.loadPreview === "function"\n        ? Promise.resolve().then(() => cropDocumentFile.loadPreview(session.pageNumber, { continuous: true }))\n          .then(value => preparePage(value, "preview")).catch(() => null)\n        : Promise.resolve(null))\n        .finally(() => window.__cropRecord?.({ phase: "editor-fast-settled", number: session.pageNumber, operation: fixtureOperation }));');
  body = replaceOnce(body, '      return false;\n    }\n  };\n  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());',
    '      return false;\n    } finally {\n      window.__cropRecord?.({ phase: "editor-settled", number: session.pageNumber, operation: fixtureOperation });\n    }\n  };\n  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());');
  const libraryTransferHooks = [];
  if (libraryTransfer) {
    body = replaceOnce(body, 'const acceptedAssets = new Map();', 'const acceptedAssets = new Map(); window.__acceptedAssets = acceptedAssets;');
    libraryTransferHooks.push({ name: 'acceptedAssets', matchCount: 1, observation: 'window.__acceptedAssets = acceptedAssets', originalDeclarationRetained: true });
  }
  await page.route(`**${runtime.moduleBase}unified-library-ui.js*`, route => route.fulfill({ contentType: 'text/javascript', body }));
  // Older component helpers must consume the same canonical implementation and query.
  const legacyModules = ['unified-library-ui.js', 'store.js', 'cut-tool.js', 'tools/labeler-magnifier.js', 'tools/pointer-magnifier.js'];
  for (const file of runtime.moduleBase === '/preview/js/' ? [] : legacyModules) {
    await page.route(`**/preview/js/${file}*`, route => route.fulfill({ contentType: 'text/javascript', body: `export * from ${JSON.stringify(runtime.moduleBase + file + runtime.moduleQuery)};` }));
  }
  const receipt = { sourcePath, moduleUrl, originalSHA256: crypto.createHash('sha256').update(source).digest('hex'), instrumentedSHA256: crypto.createHash('sha256').update(body).digest('hex'), originalFunctionBodyRetained: true, observationOnly: true, cropObservationSeamCount: 5, libraryTransfer, libraryTransferHooks, fixtureCallbacks: { openIndependentReferences: libraryTransfer ? "window.__transfer(...args)" : null }, productCallbackParameterUnmodified: true, held, legacyAliases: legacyModules };
  if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'crop-fixture-source.json'), JSON.stringify(receipt, null, 2) + '\n'); }
  const styleBase = runtime.moduleBase.replace(/js\/$/, 'css/');
  await page.route('**/crop-fixture', route => route.fulfill({ contentType: 'text/html', body: `<html><head><link rel="stylesheet" href="${styleBase}style.css${runtime.moduleQuery}"><link rel="stylesheet" href="${styleBase}unified-library.css${runtime.moduleQuery}"></head><body></body></html>` }));
  await page.goto(new URL('/crop-fixture', origin).href);
  await page.evaluate(async ({ held, moduleUrl, receipt, libraryTransfer }) => {
    const { createUnifiedLibraryUi } = await import(moduleUrl);
    const dimensions = { 1: { width: 600, height: 800 }, 2: { width: 800, height: 400 }, 3: { width: 700, height: 1000 } };
    window.cropFixtureReceipt = receipt;
    window.cropFixtureLog = [];
    window.__cropRecord = value => {
      const entry = { sequence: window.cropFixtureLog.length + 1, at: performance.now(), ...value };
      window.cropFixtureLog.push(entry);
      window.dispatchEvent(new CustomEvent('crop-fixture-event', { detail: entry }));
      return entry;
    };
    window.waitCropEvent = (criteria, after = 0) => new Promise((resolve, reject) => {
      const matches = row => row.sequence > after && Object.entries(criteria).every(([key, value]) => row[key] === value);
      const existing = window.cropFixtureLog.find(matches);
      if (existing) return resolve(existing);
      const finish = (error, value) => { clearTimeout(deadline); window.removeEventListener('crop-fixture-event', observe); error ? reject(error) : resolve(value); };
      const observe = event => { if (matches(event.detail)) finish(null, event.detail); };
      const deadline = setTimeout(() => finish(new Error(`Crop event deadline: ${JSON.stringify(criteria)} after ${after}`)), 10000);
      window.addEventListener('crop-fixture-event', observe);
    });
    window.cropGates = {};
    window.holdCrop = key => {
      if (window.cropGates[key] && !window.cropGates[key].released) throw new Error(`Cannot replace pending crop gate ${key}`);
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const gate = { promise, released: false, release() {
        if (gate.released) return;
        gate.released = true;
        window.__cropRecord({ phase: 'gate-release', key, gate: gate.id });
        resolve();
      } };
      gate.id = window.__cropRecord({ phase: 'gate-arm', key }).sequence;
      window.cropGates[key] = gate;
      return gate.id;
    };
    for (const key of held) window.holdCrop(key);
    window.cropSources = Object.fromEntries(Object.entries(dimensions).map(([number, size]) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width; canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, size.width, size.height);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      for (let x = 0; x < size.width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.height); ctx.stroke(); }
      ctx.fillStyle = '#1665aa'; ctx.fillRect(100, 100, 150, 150);
      ctx.fillStyle = 'black'; ctx.font = '120px sans-serif'; ctx.fillText(number, 300, 220);
      return [number, canvas.toDataURL('image/png')];
    }));
    const nativeDecode = window.__cropNativeDecode || HTMLImageElement.prototype.decode;
    window.__cropNativeDecode = nativeDecode;
    HTMLImageElement.prototype.decode = async function () {
      const number = Number(Object.entries(window.cropSources).find(([, src]) => src === this.src)?.[0]);
      const operation = window.__cropRecord({ phase: 'decode-start', number }).sequence;
      const gate = window.cropGates[`decode-${number}`];
      if (gate && !gate.released) {
        window.__cropRecord({ phase: 'decode-held', number, gate: gate.id, operation });
        await gate.promise;
      }
      try {
        const value = await nativeDecode.call(this);
        window.__cropRecord({ phase: 'decode-complete', number, operation });
        return value;
      } catch (error) {
        window.__cropRecord({ phase: 'decode-error', number, operation, error: String(error) });
        throw error;
      }
    };
    const file = {
      id: 'geometry-book', kind: 'pdf', title: 'Geometry book', pageCount: 3, documentId: 'geometry-book', sourceId: 'source',
      provenance: { provider: 'pdf', documentId: 'geometry-book', pageNumber: 1 },
      getPageGeometry: number => dimensions[number],
      loadPreview: async (number, options = {}) => {
        const kind = options.thumbnail ? 'thumbnail' : options.original ? 'original' : 'continuous';
        const gate = window.cropGates[`${kind}-${number}`];
        const operation = window.__cropRecord({ phase: 'request-start', number, kind, options: { ...options }, gate: gate?.id ?? null }).sequence;
        if (gate && !gate.released) {
          window.__cropRecord({ phase: 'request-held', number, kind, gate: gate.id, operation });
          await gate.promise;
        }
        const source = { provider: 'pdf', documentId: 'geometry-book', pageNumber: number };
        const value = { dataUrl: window.cropBrokenPage === number ? 'data:image/png;base64,AAAA' : window.cropSources[number], provenance: source, result: { id: `page-${number}`, kind: 'page', provenance: source } };
        window.__cropRecord({ phase: 'request-return', number, kind, operation, broken: window.cropBrokenPage === number });
        return value;
      },
    };
    const provider = { revision: 'crop-test', getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }), search: () => [], listPdfFiles: () => { window.__cropRecord({ phase: 'search-files' }); return [file]; }, materialize: result => file.loadPreview(result.provenance.pageNumber, { original: true }) };
    window.cropFixture = createUnifiedLibraryUi({
      getProvider: async () => provider, insertMaterialized: async (...args) => window.__insertMaterialized?.(...args),
      openIndependentReferences: libraryTransfer ? (...args) => window.__transfer(...args) : undefined,
    });
    await window.cropFixture.open();
  }, { held, moduleUrl, receipt, libraryTransfer });
  const ui = page.locator('.unified-library-overlay').last();
  await ui.locator('[data-unilib-type="pdf"]').click();
  await ui.locator('[data-result-id="geometry-book:page:1"]').click();
  await ui.locator('[data-unilib-adjust]').click();
  await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
  return ui;
}

async function captureCropEvidence(page) {
  return page.evaluate(() => ({ source: window.cropFixtureReceipt || null, events: window.cropFixtureLog || [], gates: Object.entries(window.cropGates || {}).map(([key, gate]) => ({ key, id: gate.id, released: gate.released })) }));
}
async function releaseCropFixture(page) {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    for (const gate of Object.values(window.cropGates || {})) gate.release();
    if (window.__cropNativeDecode) HTMLImageElement.prototype.decode = window.__cropNativeDecode;
  });
}

async function pointerOnImage(page, ui, fraction = .25) {
  const image = await ui.locator('[data-unilib-crop-image]').boundingBox();
  const stage = await ui.locator('[data-unilib-crop-stage]').boundingBox();
  const left = Math.max(image.x, stage.x + 2), top = Math.max(image.y, stage.y + 2);
  const right = Math.min(image.x + image.width, stage.x + stage.width - 2);
  const bottom = Math.min(image.y + image.height, stage.y + stage.height - 2);
  const point = { x: Math.round(left + (right - left) * fraction), y: Math.round(top + (bottom - top) * fraction) };
  await page.mouse.move(point.x + (point.x + 1 < right ? 1 : -1), point.y);
  await page.mouse.move(point.x, point.y);
  return { image, point };
}
module.exports = { installCropFixture, pointerOnImage, captureCropEvidence, releaseCropFixture };
