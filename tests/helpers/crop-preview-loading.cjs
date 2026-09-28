const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyPreviewLoading(page, evidence, engine) {
  await page.evaluate(async () => {
    const { createUnifiedLibraryUi } = await import('/preview/js/unified-library-ui.js');
    const items = [
      { id: 'preview-a', kind: 'image', title: 'Portrait', provenance: { provider: 'image' }, preview: { pageGeometry: { width: 600, height: 800 } } },
      { id: 'preview-b', kind: 'image', title: 'Landscape', provenance: { provider: 'image' }, preview: { pageGeometry: { width: 800, height: 400 } } },
    ];
    window.holdCrop('preview-b');
    const provider = {
      getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }), search: () => items, listPdfFiles: () => [],
      materialize: async result => {
        if (result.id === 'preview-b') await window.cropGates['preview-b'].promise;
        return { dataUrl: window.cropSources[result.id === 'preview-a' ? 1 : 2] };
      },
    };
    window.previewFixture = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
    await window.previewFixture.open();
  });
  const ui = page.locator('.unified-library-overlay').last();
  const stage = ui.locator('[data-unilib-stage]');
  await ui.locator('[data-result-id="preview-a"]').click();
  await stage.locator('.unilib-preview-image img').waitFor();
  await ui.locator('[data-result-id="preview-b"]').click();
  await stage.locator('.unilib-preview-loading').waitFor();
  assert.equal(await stage.locator('img').count(), 0, 'previous page is not retained during preview loading');
  const geometry = await stage.locator('.unilib-preview-paper').boundingBox();
  assert.ok(Math.abs(geometry.width / geometry.height - 2) < .01, 'neutral preview uses landscape target ratio');
  await page.screenshot({ path: path.join(evidence, `${engine}-ordinary-preview-loading.png`) });
  await page.evaluate(() => { window.holdCrop('decode-2'); window.cropGates['preview-b'].release(); });
  await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
  assert.equal(await stage.getAttribute('aria-busy'), 'true', 'ordinary preview status includes decode');
  await page.evaluate(() => window.cropGates['decode-2'].release());
  await stage.locator('.unilib-preview-image img').waitFor();
  assert.equal(await stage.locator('img').evaluate(img => img.naturalWidth), 800);
  await page.evaluate(() => window.previewFixture.close());
};
