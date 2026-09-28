const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
async function fixture({ width = 160, height = 100, noisy = false, empty = false } = {}) {
  const { encodeScopedPng } = await import(pathToFileURL(path.join(root, 'preview/js/ai-scoped-edit-png.js')));
  const data = new Uint8Array(width * height * 4).fill(255);
  const paint = (x, y, color) => data.set(color, (y * width + x) * 4);
  if (noisy) {
    for (let y = 5; y < height - 5; y += 3) for (let x = 5; x < width - 5; x += 3) paint(x, y, [0, 0, 0, 255]);
  } else if (!empty) {
    for (let y = 35; y < 60; y++) for (let x = 0; x < 16; x++) paint(x, y, [20, 30, 40, 255]);
    for (let y = 25; y < 65; y++) for (let x = 65; x < 100; x++) {
      if (y < 28 || y >= 62 || x < 68 || x >= 97) paint(x, y, [0, 0, 0, 255]);
    }
    for (let y = 35; y < 60; y++) for (let x = 130; x < 145; x++) paint(x, y, [50, 100, 150, 255]);
  }
  const bytes = await encodeScopedPng({ width, height, data });
  return { width, height, data, bytes, dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` };
}
module.exports = { fixture, root };
