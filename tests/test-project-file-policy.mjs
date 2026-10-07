import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROJECT_FILE_BYTES, projectFileSizeError } from '../js/project-file-policy.js';

test('A1 encoded project budget allows below and exactly 128 MiB', () => {
  assert.equal(MAX_PROJECT_FILE_BYTES, 128 * 1024 * 1024);
  for (const size of [0, MAX_PROJECT_FILE_BYTES - 1, MAX_PROJECT_FILE_BYTES]) {
    assert.equal(projectFileSizeError({ size }), null);
  }
});
test('A1 rejects above the inclusive budget with bytes and Korean remedy', () => {
  const error = projectFileSizeError({ size: MAX_PROJECT_FILE_BYTES + 1 });
  assert.match(error, /134,217,729바이트/);
  assert.match(error, /128 MiB/);
  assert.match(error, /이미지 해상도를 줄이거나 페이지를 나누어/);
  assert.match(error, /현재 작업은 그대로 유지/);
});
test('A1 leaves room for one 64 MiB image expanded to base64 plus document data', () => {
  const imageBase64Bytes = 4 * Math.ceil(64 * 1024 * 1024 / 3);
  assert.ok(MAX_PROJECT_FILE_BYTES - imageBase64Bytes > 42 * 1024 * 1024);
  assert.equal(projectFileSizeError({ size: imageBase64Bytes + 1024 * 1024 }), null);
});
