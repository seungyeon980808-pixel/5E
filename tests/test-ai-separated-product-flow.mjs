import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AI_ASSET_GENERATION_MODES,
  candidateUsesSeparatedAssets,
  imagePromptForRun,
  separatedCandidateNextAction,
  snapshotImageItem,
} from '../js/ai-panel.js';
import { APPROVED_FIRST_PROMPT } from '../js/ai-approved-first-png.js';
import { SEPARATED_ASSETS_PROMPT } from '../js/ai-separated-assets.js';

test('actual AI panel contains the required visible generation-mode insertion anchor', async () => {
  // Given / When
  const [html, panel, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/ai-panel.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/ai-panel.css', import.meta.url), 'utf8'),
  ]);

  // Then
  assert.match(html, /<footer class="ai-workbench-actions">[\s\S]*data-ai-white-png-note[\s\S]*data-ai-send[\s\S]*<\/footer>/);
  assert.match(panel, /generationModeAnchor\.before\(generationModeRow\)/);
  assert.doesNotMatch(panel, /querySelector\('\.ai-output-row'\)\?\.after/);
  assert.match(css, /\.ai-output-actions \.ai-selected-output-note \{ grid-column:1 \/ -1; width:100%/);
});

test('separated mode is captured on each candidate and survives task persistence snapshots', () => {
  // Given
  const candidate = { id: 'v1', kind: 'generated', data: 'png', generationMode: AI_ASSET_GENERATION_MODES.SEPARATED };

  // When
  const snapshot = snapshotImageItem(candidate);

  // Then
  assert.equal(snapshot.generationMode, AI_ASSET_GENERATION_MODES.SEPARATED);
  assert.equal(candidateUsesSeparatedAssets(snapshot), true);
  assert.equal(candidateUsesSeparatedAssets({ ...snapshot, generationMode: AI_ASSET_GENERATION_MODES.SINGLE }), false);
});

test('only a first separated generation routes to the atlas prompt', () => {
  // Given
  const firstSeparated = { approvedFirstPng: true, generationMode: AI_ASSET_GENERATION_MODES.SEPARATED, generated: [] };

  // When / Then
  const prompt = imagePromptForRun(firstSeparated);
  assert.equal(prompt.includes(APPROVED_FIRST_PROMPT), true);
  assert.equal(prompt.includes(SEPARATED_ASSETS_PROMPT), true);
  assert.equal(imagePromptForRun({ ...firstSeparated, generationMode: AI_ASSET_GENERATION_MODES.SINGLE }), null);
  assert.equal(imagePromptForRun({ ...firstSeparated, generated: [{ id: 'old' }] }), null);
});

test('a selected separated candidate offers manual regions only after its own automatic preparation failed', async () => {
  // Given
  const separated = { generationMode: AI_ASSET_GENERATION_MODES.SEPARATED };
  const failedSeparated = { ...separated, separatedAssetsError: 'No usable regions' };
  const ordinary = { generationMode: AI_ASSET_GENERATION_MODES.SINGLE, separatedAssetsError: 'stale error' };

  // When / Then
  assert.equal(separatedCandidateNextAction(separated), 'confirm-separated-result');
  assert.equal(separatedCandidateNextAction(failedSeparated), 'manual-regions');
  assert.equal(separatedCandidateNextAction(ordinary), 'ordinary-insert');
  assert.equal(snapshotImageItem(failedSeparated).separatedAssetsError, 'No usable regions');

  const panel = await readFile(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /data-ai-separated-recovery/);
  assert.match(panel, /openGroupsForItem\(item, false\)/);
  assert.match(panel, /groups\.hidden = candidateUsesSeparatedAssets\(item\)/);
  assert.match(panel, /자동 분리 실패:/);
});
