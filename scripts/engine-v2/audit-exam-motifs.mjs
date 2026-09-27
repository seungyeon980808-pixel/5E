#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAiMotifs } from '../../js/ai-motif-catalog.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAMPLE_PATH = 'preview/assets/exam-library/sample-catalog.json';
const MANIFEST_PATH = 'preview/assets/exam-library/manifest.json';

export function auditExamMotifs(root = REPO_ROOT) {
  const errors = [];
  const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const sample = readJson(SAMPLE_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const motifs = listAiMotifs();
  if (sample.complete !== false) errors.push('sample catalog must identify itself as incomplete');
  if (!Array.isArray(sample.items) || sample.items.length === 0) errors.push('sample catalog has no items');
  if (!Array.isArray(manifest.items) || manifest.count !== manifest.items.length) errors.push('exam manifest count does not match its items');
  if (motifs.length === 0) errors.push('AI motif catalog has no motifs');
  const manifestIds = new Set((manifest.items || []).map((item) => item.id));
  const sampleIds = new Set();
  for (const item of sample.items || []) {
    if (sampleIds.has(item.id)) errors.push(`duplicate sample id: ${item.id}`);
    sampleIds.add(item.id);
    if (!manifestIds.has(item.id)) errors.push(`sample missing from exam manifest: ${item.id}`);
    if (!/^[\w-]+\.png$/u.test(item.file) || item.url !== `assets/exam-library/images/${item.file}`) {
      errors.push(`invalid sample image reference: ${item.id}`);
      continue;
    }
    const image = path.join(root, 'preview/assets/exam-library/images', item.file);
    if (!fs.existsSync(image)) {
      errors.push(`sample image missing: ${item.file}`);
      continue;
    }
    const header = Buffer.alloc(24);
    const fd = fs.openSync(image, 'r');
    try { fs.readSync(fd, header, 0, header.length, 0); } finally { fs.closeSync(fd); }
    if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || header.readUInt32BE(16) === 0 || header.readUInt32BE(20) === 0) {
      errors.push(`invalid sample PNG: ${item.file}`);
    }
  }
  return { sampleCount: sample.items?.length || 0, manifestCount: manifest.items?.length || 0, motifCount: motifs.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const audit = auditExamMotifs();
    process.stdout.write(`Exam motif release audit: ${audit.sampleCount} sample entries, ${audit.manifestCount} manifest entries, ${audit.motifCount} code motifs.\n`);
    process.stdout.write('Scope: bundled sample images and motif catalog; the full atlas/source-data audit is unavailable in this release checkout.\n');
    if (audit.errors.length === 0) process.stdout.write('PASS: release exam motif inputs are internally consistent.\n');
    for (const error of audit.errors) process.stderr.write(`FAIL: ${error}\n`);
    process.exitCode = audit.errors.length ? 1 : 0;
  } catch (error) {
    process.stderr.write(`FAIL: exam motif audit could not read its inputs: ${error.message}\n`);
    process.exitCode = 1;
  }
}
