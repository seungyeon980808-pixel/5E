#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAiMotifs } from '../../js/ai-motif-catalog.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY_LIBRARY_PATH = 'preview/assets/exam-library';

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files.sort();
}

export function auditExamMotifs(root = REPO_ROOT) {
  const errors = [];
  const motifs = listAiMotifs();
  const legacyFiles = listFiles(path.join(root, LEGACY_LIBRARY_PATH));
  if (motifs.length === 0) errors.push('AI motif catalog has no motifs');
  for (const file of legacyFiles) {
    errors.push(`obsolete preview exam library file remains: ${path.relative(root, file)}`);
  }
  return {
    sampleCount: 0,
    sampleAvailability: 'not-bundled',
    manifestCount: 0,
    motifCount: motifs.length,
    legacyFileCount: legacyFiles.length,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const audit = auditExamMotifs();
    const availability = audit.sampleCount === 0 ? ` (${audit.sampleAvailability})` : '';
    process.stdout.write(`Exam motif release audit: ${audit.sampleCount} sample entries${availability}, ${audit.manifestCount} manifest entries, ${audit.motifCount} code motifs.\n`);
    process.stdout.write('Scope: no bundled exam illustration files are shipped; the code motif catalog remains available.\n');
    if (audit.errors.length === 0) process.stdout.write('PASS: release exam motif inputs are internally consistent.\n');
    for (const error of audit.errors) process.stderr.write(`FAIL: ${error}\n`);
    process.exitCode = audit.errors.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`FAIL: exam motif audit could not read its inputs: ${error.message}\n`);
    process.exitCode = 1;
  }
}
