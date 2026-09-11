import test from 'node:test';
import assert from 'node:assert/strict';
import { previewViewBoxForLabels } from '../js/ai-editable-assets-dialog.js';

test('preview viewBox preserves headroom for a label at the source edge', () => {
  // Given
  const source = { width: 400, height: 300 };

  // When
  const viewBox = previewViewBoxForLabels(source.width, source.height, 32);

  // Then
  assert.equal(viewBox, '-32 -32 464 364');
});
