import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../css/ai-panel.css', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || '';
}

function zIndexesFor(selectorPattern) {
  return [...styles.matchAll(new RegExp(`[^{}]*${selectorPattern}[^{}]*\\{([^}]*)\\}`, 'g'))]
    .flatMap(([, body]) => [...body.matchAll(/z-index\s*:\s*(\d+)/g)].map(([, value]) => Number(value)));
}

test('follow-up progress stays above annotations from the selected result', () => {
  const progress = rule('#ai-image-panel .ai-previews > .ai-generating');
  const layer = Number(progress.match(/z-index\s*:\s*(\d+)/)?.[1]);
  const annotationLayers = zIndexesFor('\\.ai-comment-(?:marker|region)');

  assert(annotationLayers.length > 0, 'annotation layer contract must remain discoverable');
  assert(layer > Math.max(...annotationLayers), 'progress must cover existing comment regions and pins');
});

test('processing keeps the existing result mounted beneath progress', () => {
  assert.doesNotMatch(styles, /data-ai-stage="processing"[^}]*\.ai-generated-card[^}]*display\s*:\s*none/s);
});
