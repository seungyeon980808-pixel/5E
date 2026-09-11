'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function sanitizeTargetName(sourceName) {
  const parsed = path.parse(path.basename(String(sourceName || 'output')));
  const cleaned = parsed.name
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/-+/g, '-')
    .replace(/[. -]+$/g, '')
    .slice(0, 120);
  const fallback = cleaned || 'output';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(fallback) ? `_${fallback}` : fallback;
}

function createBatchOutputService({ fileSystem = fs, pathApi = path } = {}) {
  return {
    async write({ outputDirectory, sourceName, originalPath = null, data, extension = '.png' } = {}) {
      if (typeof outputDirectory !== 'string' || !outputDirectory) throw new TypeError('outputDirectory is required.');
      if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) throw new TypeError('Output data must be binary.');
      const suffix = String(extension).startsWith('.') ? String(extension).toLowerCase() : `.${String(extension).toLowerCase()}`;
      if (!/^\.[a-z0-9]+$/.test(suffix)) throw new TypeError('Output extension is invalid.');
      const base = `${sanitizeTargetName(sourceName)}-converted`;
      const sourcePath = originalPath ? pathApi.resolve(originalPath) : null;
      let sequence = 1;
      while (true) {
        const marker = sequence === 1 ? '' : ` (${sequence})`;
        const targetPath = pathApi.resolve(outputDirectory, `${base}${marker}${suffix}`);
        sequence += 1;
        if (sourcePath === targetPath) continue;
        let handle;
        try {
          handle = await fileSystem.open(targetPath, 'wx');
          await handle.writeFile(data);
          await handle.close();
          return { path: targetPath, sha256: crypto.createHash('sha256').update(data).digest('hex') };
        } catch (error) {
          if (!handle && error?.code === 'EEXIST') continue;
          if (handle) {
            await handle.close().catch(() => {});
            try { await fileSystem.unlink(targetPath); }
            catch (cleanupError) {
              if (cleanupError?.code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Output write and cleanup failed.');
            }
          }
          throw error;
        }
      }
    },
  };
}

module.exports = { createBatchOutputService, sanitizeTargetName };
