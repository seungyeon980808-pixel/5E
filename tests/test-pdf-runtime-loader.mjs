import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfRuntimeLoader } from '../js/pdf-library/runtime-loader.js';

const moduleUrl = 'https://example.test/js/pdf-library/pdf-runtime.js?v=1.6.3';
const fetchFailure = () => new TypeError(`Failed to fetch dynamically imported module: ${moduleUrl}`);

test('concurrent requests share one import and retain the successful runtime', async () => {
  let imports = 0, factories = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const runtime = {};
  const load = createPdfRuntimeLoader({ moduleUrl, importModule: async () => {
    imports += 1; await gate;
    return { createPdfRuntime: () => { factories += 1; return runtime; } };
  } });
  const first = load(), second = load();
  assert.equal(first, second); release();
  assert.equal(await first, runtime);
  assert.equal(await load(), runtime);
  assert.equal(imports, 1); assert.equal(factories, 1);
});

for (const message of ['Failed to fetch dynamically imported module', 'Importing a module script failed.', 'error loading dynamically imported module']) {
  test(`one automatic retry recovers ${message}`, async () => {
    const urls = [], runtime = {};
    const load = createPdfRuntimeLoader({ moduleUrl, importModule: async url => {
      urls.push(url);
      if (urls.length === 1) throw new TypeError(message);
      return { createPdfRuntime: () => runtime };
    } });
    assert.equal(await load(), runtime); assert.equal(urls.length, 2);
    assert.equal(urls[0], moduleUrl);
    assert.equal(new URL(urls[1]).searchParams.get('v'), '1.6.3');
    assert.ok(new URL(urls[1]).searchParams.has('pdfModuleRetry'));
    assert.equal(await load(), runtime); assert.equal(urls.length, 2);
  });
}

test('persistent failure stops after two requests; manual retry never reuses failed URLs', async () => {
  const urls = []; let offline = true;
  const load = createPdfRuntimeLoader({ moduleUrl, importModule: async url => {
    urls.push(url); if (offline) throw fetchFailure();
    return { createPdfRuntime: () => ({ ready: true }) };
  } });
  await assert.rejects(load(), /Failed to fetch/); assert.equal(urls.length, 2);
  await assert.rejects(load(), /Failed to fetch/); assert.equal(urls.length, 4);
  offline = false;
  assert.deepEqual(await load(), { ready: true });
  assert.equal(new Set(urls).size, 5);
});

test('different loaders cannot reuse each other’s failed retry URL', async () => {
  const urls = [];
  const options = { moduleUrl, importModule: async url => { urls.push(url); throw fetchFailure(); } };
  await assert.rejects(createPdfRuntimeLoader(options)());
  await assert.rejects(createPdfRuntimeLoader(options)());
  assert.notEqual(urls[1], urls[3]);
});

test('syntax, evaluation and factory errors do not trigger automatic network retries', async () => {
  for (const error of [new SyntaxError('broken module'), new TypeError('unsupported API')]) {
    let requests = 0;
    const load = createPdfRuntimeLoader({ moduleUrl, importModule: async () => { requests += 1; throw error; } });
    await assert.rejects(load(), value => value === error); assert.equal(requests, 1);
  }
  let requests = 0;
  const error = fetchFailure();
  const load = createPdfRuntimeLoader({ moduleUrl, importModule: async () => {
    requests += 1; return { createPdfRuntime: () => { throw error; } };
  } });
  await assert.rejects(load(), value => value === error); assert.equal(requests, 1);
});
