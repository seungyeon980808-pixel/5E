const fs = require('node:fs');
const path = require('node:path');

// upload-artifact preserves a parent directory when evidence and the receipt
// have different roots. Route-only artifacts have the receipt at their root.
function normalizePublicationReceipt(directory) {
  const target = path.join(directory, 'receipt.json');
  const candidates = [target, path.join(directory, 'preview-publication/receipt.json')]
    .filter(file => fs.existsSync(file));
  if (candidates.length !== 1) throw new Error('Exactly one published inventory receipt required');
  if (candidates[0] !== target) fs.copyFileSync(candidates[0], target);
  return target;
}
module.exports = { normalizePublicationReceipt };
