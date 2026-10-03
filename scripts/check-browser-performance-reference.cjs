const fs = require('node:fs');
const path = require('node:path');
const { identity, validate } = require('../tests/helpers/performance-reference.cjs');
const root = path.resolve(__dirname, '..');
try {
  const reference = validate(JSON.parse(fs.readFileSync(path.join(root, '.github/browser-performance-reference.json'), 'utf8')), identity(root));
  console.log(`Physical Retina performance reference verified: 8 scenarios, 120 samples <100ms; measured ${reference.sourceCommit}; current source tree and methodology match.`);
} catch (error) {
  console.error(`Performance reference FAILED: ${error.message}`);
  process.exitCode = 1;
}
