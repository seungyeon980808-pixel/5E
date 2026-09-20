import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { createUnifiedLibraryProvider } from '../js/library/provider.js';
import { providedPagePreviews } from '../assets/pdf-library/previews/manifest.js';

const hash = '54eb8dfd49d9cd6ed9ed7438da4a5b52792099b603ae6a57e8d26c3a83a40545';

async function webpDimensions(url) {
  const bytes = await readFile(url);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'VP8 ');
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}
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
  assert.match(preview.url, new RegExp(`${hash}/265\\.webp\\?v=cropbox-v2$`));
  assert.equal(preview.source.pageNumber, 265);
  assert.equal(preview.previewOnly, true);
  assert.ok((await stat(new URL(preview.url))).size < 150_000);
  const thumb = await file.loadPreview(265, { thumbnail: true });
  assert.match(thumb.url, /265-thumb\.webp\?v=cropbox-v2$/);
  assert.ok((await stat(new URL(thumb.url))).size < 30_000);
  await file.loadPreview(265, { original: true, continuous: true });
  assert.equal(calls(), 0);
  await file.loadPreview(265, { original: true });
  assert.equal(calls(), 1);
});

test('provided textbook previews honor the source PDF CropBox for pages 7 through 9', async () => {
  for (const pageNumber of [7, 8, 9]) {
    const url = new URL(`../assets/pdf-library/previews/${hash}/${pageNumber}.webp`, import.meta.url);
    const thumbUrl = new URL(`../assets/pdf-library/previews/${hash}/${pageNumber}-thumb.webp`, import.meta.url);
    assert.deepEqual(await webpDimensions(url), [768, 1000]);
    assert.deepEqual(await webpDimensions(thumbUrl), [246, 320]);
  }
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
    async decode() { decoded++; assert.match(new URL(this.src).pathname, /\/1\.webp$/); }
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
    let originalFailure = null;
    const provider = createUnifiedLibraryProvider({
      pdfDocuments: [{ id: documentId, title: 'p12606.pdf', pageCount: 1,
        source: { kind: 'pack', locator: '5e.shared.drive/test.pdf', sha256: hash },
        pages: [{ documentId, pageNumber: 1, text: '1. 자기장', words: [],
          items: [{ id: 'q1', itemNumber: 1, label: '1', rect,
            source: { documentId, pageNumber: 1, rect, fullPageFallback: false } }],
        }],
      }],
      materializers: { pdf: async () => { originalCalls++; if (originalFailure) throw originalFailure; return { url: 'original' }; } },
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
    const sharp = await provider.materialize(question, { preview: true, previewPixelWidth: 1200 });
    assert.equal(sharp.url, 'original');
    assert.equal(originalCalls, 1);
    await provider.materialize(question);
    assert.equal(originalCalls, 2);
    originalFailure = new Error('Original unavailable');
    const fallback = await provider.materialize(question, { preview: true, previewPixelWidth: 1200 });
    assert.equal(fallback.previewOnly, true);
    assert.equal(fallback.dataUrl, 'data:image/webp;base64,cropped');
    originalFailure = new DOMException('Superseded', 'AbortError');
    await assert.rejects(provider.materialize(question, { preview: true, previewPixelWidth: 1200 }), { name: 'AbortError' });
  } finally {
    globalThis.Image = previousImage;
    globalThis.document = previousDocument;
  }
});
