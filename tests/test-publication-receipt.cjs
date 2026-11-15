const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePublicationReceipt } = require('../scripts/publication-receipt.cjs');

for (const location of ['receipt.json', 'preview-publication/receipt.json']) {
  test(`published inventory retains exact bytes from ${location}`, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-publication-receipt-'));
    t.after(() => fs.rmSync(directory, { recursive:true, force:true }));
    const file = path.join(directory, location);
    fs.mkdirSync(path.dirname(file), { recursive:true });
    const bytes = Buffer.from('{"files":{"index.html":"unchanged-digest"}}\n');
    fs.writeFileSync(file, bytes);
    assert.equal(normalizePublicationReceipt(directory), path.join(directory, 'receipt.json'));
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'receipt.json')), bytes);
  });
}
for (const ambiguous of [false, true]) {
  test(`reject ${ambiguous ? 'ambiguous' : 'missing'} publication inventories`, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-publication-receipt-'));
    t.after(() => fs.rmSync(directory, { recursive:true, force:true }));
    if (ambiguous) {
      fs.mkdirSync(path.join(directory, 'preview-publication'));
      fs.writeFileSync(path.join(directory, 'receipt.json'), 'original');
      fs.writeFileSync(path.join(directory, 'preview-publication/receipt.json'), 'other');
    }
    assert.throws(() => normalizePublicationReceipt(directory), /Exactly one/);
    if (ambiguous) assert.equal(fs.readFileSync(path.join(directory, 'receipt.json'), 'utf8'), 'original');
  });
}
