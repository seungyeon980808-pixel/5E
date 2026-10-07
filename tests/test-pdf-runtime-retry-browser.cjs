const path = require('node:path');
const { runPdfRuntimeRetryCases } = require('./helpers/pdf-runtime-retry-fixture.cjs');

runPdfRuntimeRetryCases({
  origin: process.env.RELEASE_URL,
  evidence: path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/pdf-runtime-retry/browser'),
}).then(results => console.log(`PDF runtime retry: ${results.length} Chromium/WebKit cases passed`))
  .catch(error => { console.error(error); process.exitCode = 1; });
