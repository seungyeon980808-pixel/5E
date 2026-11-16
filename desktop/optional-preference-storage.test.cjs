const test = require('node:test');
const assert = require('node:assert/strict');

test('blocked optional preferences fall back without changing required store error semantics', async () => {
  const { optionalStorage } = await import('../js/preview-storage.js');
  const required = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  const preferences = optionalStorage(required);
  assert.equal(preferences.getItem('theme'), null);
  assert.doesNotThrow(() => preferences.setItem('theme', 'light'));
  assert.doesNotThrow(() => preferences.removeItem('theme'));
  assert.throws(() => required.setItem('workspace', '{}'), /quota/);
});

test('optional preferences preserve normal reads, writes and removal', async () => {
  const { optionalStorage } = await import('../js/preview-storage.js');
  const values = new Map();
  const preferences = optionalStorage({
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  });
  preferences.setItem('theme', 'light');
  assert.equal(preferences.getItem('theme'), 'light');
  preferences.removeItem('theme');
  assert.equal(preferences.getItem('theme'), null);
});
