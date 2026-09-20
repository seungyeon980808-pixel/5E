import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { isRecognizedExamSourceName } from '../preview/js/library/exam-code.js';
import { createUnifiedLibraryProvider } from '../preview/js/library/provider.js';
import { shouldShowResultTypeBadge } from '../preview/js/unified-library-ui.js';

test('question results require a recognized exam filename', () => {
  assert.equal(isRecognizedExamSourceName('p1_2026_11.pdf'), true);
  assert.equal(isRecognizedExamSourceName('p1_202611.pdf'), true);
  assert.equal(isRecognizedExamSourceName('p12611.pdf'), true);
  assert.equal(isRecognizedExamSourceName('교과서_중2.pdf'), false);
});

test('textbook PDFs load without question crops', () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [{
      id: 'textbook-middle-2',
      title: '교과서 중2',
      pageCount: 1,
      source: {
        kind: 'file',
        displayName: '교과서_중2.pdf',
        relativePath: '교과서/교과서_중2.pdf',
        locator: 'local/textbook-middle-2',
      },
      metadata: { category: 'textbooks' },
      pages: [{ pageNumber: 1, text: '교과서 본문', words: [], items: [] }],
    }],
  });

  assert.equal(provider.listPdfFiles().length, 1);
  assert.equal(provider.search({ kinds: ['crop'] }).length, 0);
});

test('library cards do not show redundant result-type badges', () => {
  assert.equal(shouldShowResultTypeBadge(['question'], 'crop'), false);
  assert.equal(shouldShowResultTypeBadge(['all'], 'page'), false);
});

test('preview exposes direct page-tab deletion and crop page navigation', async () => {
  const [pages, library] = await Promise.all([
    readFile(new URL('../preview/js/pages.js', import.meta.url), 'utf8'),
    readFile(new URL('../preview/js/unified-library-ui.js', import.meta.url), 'utf8'),
  ]);
  assert.match(pages, /page-tab-close/);
  assert.match(library, /data-unilib-crop-page-prev/);
  assert.match(library, /data-unilib-crop-page-next/);
});

test('light canvas has a visible workspace watermark', async () => {
  const css = await readFile(new URL('../preview/css/style.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="light"\] #canvas/);
});
