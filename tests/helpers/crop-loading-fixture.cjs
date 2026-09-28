async function installCropFixture(page) {
  await page.route('**/crop-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/preview/css/style.css"><link rel="stylesheet" href="/preview/css/unified-library.css"></head><body></body></html>' }));
  await page.goto(new URL('/crop-fixture', process.env.PREVIEW_URL).href);
  await page.evaluate(async () => {
    const { createUnifiedLibraryUi } = await import('/preview/js/unified-library-ui.js');
    const dimensions = { 1: { width: 600, height: 800 }, 2: { width: 800, height: 400 }, 3: { width: 700, height: 1000 } };
    window.cropGates = {};
    window.holdCrop = key => {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      window.cropGates[key] = { promise, release };
    };
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
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      const number = Object.entries(window.cropSources).find(([, src]) => src === this.src)?.[0];
      if (number && window.cropGates[`decode-${number}`]) await window.cropGates[`decode-${number}`].promise;
      return nativeDecode.call(this);
    };
    const file = {
      id: 'geometry-book', kind: 'pdf', title: 'Geometry book', pageCount: 3, documentId: 'geometry-book', sourceId: 'source',
      provenance: { provider: 'pdf', documentId: 'geometry-book', pageNumber: 1 },
      getPageGeometry: number => dimensions[number],
      loadPreview: async (number, options = {}) => {
        const kind = options.thumbnail ? 'thumbnail' : options.original ? 'original' : 'continuous';
        if (window.cropGates[`${kind}-${number}`]) await window.cropGates[`${kind}-${number}`].promise;
        const source = { provider: 'pdf', documentId: 'geometry-book', pageNumber: number };
        return { dataUrl: window.cropBrokenPage === number ? 'data:image/png;base64,AAAA' : window.cropSources[number], provenance: source, result: { id: `page-${number}`, kind: 'page', provenance: source } };
      },
    };
    const provider = { revision: 'crop-test', getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }), search: () => [], listPdfFiles: () => [file], materialize: result => file.loadPreview(result.provenance.pageNumber, { original: true }) };
    window.cropFixture = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
    await window.cropFixture.open();
  });
  const ui = page.locator('.unified-library-overlay').last();
  await ui.locator('[data-unilib-type="pdf"]').click();
  await ui.locator('[data-result-id="geometry-book:page:1"]').click();
  await ui.locator('[data-unilib-adjust]').click();
  await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
  return ui;
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
module.exports = { installCropFixture, pointerOnImage };
