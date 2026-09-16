import assert from 'node:assert/strict';
import test from 'node:test';
import { stat } from 'node:fs/promises';
import { createUnifiedLibraryProvider } from '../js/library/provider.js';
import { providedPagePreviews } from '../assets/pdf-library/previews/manifest.js';

const hash = '54eb8dfd49d9cd6ed9ed7438da4a5b52792099b603ae6a57e8d26c3a83a40545';
function providerWithSource(sha256 = hash) {
  let originalCalls = 0;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [{
      id: '5e.shared.drive::textbook', title: '교과서_중2.pdf', pageCount: providedPagePreviews[hash],
      source: { kind: 'pack', locator: '5e.shared.drive/교과서/교과서_중2.pdf', sha256, displayName: '교과서_중2.pdf' },
      pages: [],
    }],
    materializers: { pdf: async ({ source }) => { originalCalls++; return { url: 'original-pdf-render', source }; } },
  });
  return { provider, calls: () => originalCalls };
}

test('provided textbook page 265 uses immutable prebuilt previews without opening PDF', async () => {
  const { provider, calls } = providerWithSource();
  const file = provider.listPdfFiles({})[0];
  const preview = await file.loadPreview(265);
  assert.match(preview.url, new RegExp(`${hash}/265\\.webp$`));
  assert.equal(preview.source.pageNumber, 265);
  assert.equal(preview.previewOnly, true);
  assert.ok((await stat(new URL(preview.url))).size < 150_000);
  const thumb = await file.loadPreview(265, { thumbnail: true });
  assert.match(thumb.url, /265-thumb\.webp$/);
  assert.ok((await stat(new URL(thumb.url))).size < 30_000);
  await file.loadPreview(265, { original: true, continuous: true });
  assert.equal(calls(), 0);
  await file.loadPreview(265, { original: true });
  assert.equal(calls(), 1);
});

test('unknown or changed source hash falls back to original PDF materializer', async () => {
  const { provider, calls } = providerWithSource('a'.repeat(64));
  await provider.listPdfFiles({})[0].loadPreview(265);
  assert.equal(calls(), 1);
});

test('full-page display can use prebuilt image but materialization for insertion cannot', async () => {
  const { provider, calls } = providerWithSource();
  const page = provider.search({ kinds: ['page'], limit: 400 }).find(result => result.provenance.pageNumber === 265);
  const preview = await provider.materialize(page, { preview: true });
  assert.equal(preview.previewOnly, true);
  assert.equal(calls(), 0);
  await provider.materialize(page);
  assert.equal(calls(), 1);
});

test('question previews crop the small static page image and retain original insertion path', async () => {
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  const draws = [];
  let decoded = 0;
  globalThis.Image = class {
    naturalWidth = 1000;
    naturalHeight = 1500;
    async decode() { decoded++; assert.match(this.src, /\/1\.webp$/); }
  };
  globalThis.document = { createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args) => draws.push(args.slice(1)) }),
    toDataURL: () => 'data:image/webp;base64,cropped',
  }) };
  try {
    const documentId = '5e.shared.drive::question-doc';
    const rect = [0.1, 0.2, 0.5, 0.4];
    let originalCalls = 0;
    const provider = createUnifiedLibraryProvider({
      pdfDocuments: [{ id: documentId, title: 'p12606.pdf', pageCount: 1,
        source: { kind: 'pack', locator: '5e.shared.drive/test.pdf', sha256: hash },
        pages: [{ documentId, pageNumber: 1, text: '1. 자기장', words: [],
          items: [{ id: 'q1', itemNumber: 1, label: '1', rect,
            source: { documentId, pageNumber: 1, rect, fullPageFallback: false } }],
        }],
      }],
      materializers: { pdf: async () => { originalCalls++; return { url: 'original' }; } },
    });
    const question = provider.search({ kinds: ['crop'] })[0];
    assert.ok(question);
    const preview = await provider.materialize(question, { preview: true });
    assert.equal(preview.dataUrl, 'data:image/webp;base64,cropped');
    assert.deepEqual(draws[0], [100, 300, 500, 600, 0, 0, 500, 600]);
    const thumb = await provider.materialize(question, { thumbnail: true });
    assert.equal(thumb.width, 267);
    assert.equal(thumb.height, 320);
    assert.equal(decoded, 1);
    assert.equal(originalCalls, 0);
    await provider.materialize(question);
    assert.equal(originalCalls, 1);
  } finally {
    globalThis.Image = previousImage;
    globalThis.document = previousDocument;
  }
});
