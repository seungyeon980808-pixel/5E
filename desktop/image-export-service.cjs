'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_PNG_BYTES = 32 * 1024 * 1024;
const MAX_PNG_DIMENSION = 16384;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function safePngName(value) {
  const parsed = path.parse(path.basename(String(value || 'crop')));
  const cleaned = parsed.name.normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/-+/g, '-')
    .replace(/[. -]+$/g, '')
    .slice(0, 120);
  const fallback = cleaned || 'crop';
  const base = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(fallback) ? `_${fallback}` : fallback;
  return `${base}.png`;
}

function decodePngDataUrl(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_PNG_BYTES * 4 / 3) + 64) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[1], 'base64');
  if (data.length < 24 || data.length > MAX_PNG_BYTES || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (data.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!width || !height || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) return null;
  return data;
}

function createImageExportService({ showSaveDialog, writeFile = fs.writeFile, desktopPath } = {}) {
  if (typeof showSaveDialog !== 'function') throw new TypeError('showSaveDialog is required.');
  if (typeof desktopPath !== 'string' || !desktopPath) throw new TypeError('desktopPath is required.');
  let active = false;

  return {
    async save(payload = {}) {
      const data = decodePngDataUrl(payload.dataUrl);
      if (!data) return { ok: false, canceled: false, error: 'invalid-input' };
      if (active) return { ok: false, canceled: false, error: 'busy' };
      active = true;
      try {
        const result = await showSaveDialog({
          title: 'PNG 이미지 저장',
          defaultPath: path.join(desktopPath, safePngName(payload.suggestedName)),
          filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (result?.canceled || !result?.filePath) return { ok: false, canceled: true };
        const filePath = path.extname(result.filePath).toLowerCase() === '.png'
          ? result.filePath : `${result.filePath}.png`;
        try {
          await writeFile(filePath, data, { flag: 'w' });
        } catch {
          return { ok: false, canceled: false, error: 'write-failed' };
        }
        return { ok: true, canceled: false, filePath };
      } finally {
        active = false;
      }
    },
  };
}

module.exports = { createImageExportService, decodePngDataUrl, safePngName };
