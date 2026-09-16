const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');

async function boot(authUrl = 'https://auth.openai.com/codex/device', display = {}, rejectGeometry = false) {
  const nodes = new Map(), listeners = {}, messages = [], openings = [], geometry = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
    return nodes.get(id);
  };
  const child = { location: { replace: url => geometry.push(['navigate', url]) }, resizeTo: (...args) => { if (rejectGeometry) throw new Error('denied'); geometry.push(['resize', ...args]); }, moveTo: (...args) => { if (rejectGeometry) throw new Error('denied'); geometry.push(['move', ...args]); }, closed: false, focused: 0, close() { this.closed = true; }, focus() { this.focused++; } };
  const opener = { closed: false, postMessage: (...args) => messages.push(args) };
  const window = { opener, screenX: 100, screenY: 50, outerWidth: 420, closed: false,
    close() { this.closed = true; }, addEventListener: (type, fn) => { listeners[type] = fn; },
    open: (...args) => { openings.push(args); return child; } };
  let copied;
  vm.runInNewContext(readFileSync(require.resolve('./popup-login.js'), 'utf8'), {
    window, location: { href: 'https://runtime.example/web-connect?editor=https%3A%2F%2Fwww.5e.ai.kr' }, URL,
    document: { querySelector: node, getElementById: node },
    navigator: { clipboard: { writeText: async text => { copied = text; } } },
    screen: { availWidth: 1440, availHeight: 900, availLeft: 0, ...display }, setInterval() {}, clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ authUrl, userCode: 'TEST-CODE', ticket: 'b'.repeat(64) }) }),
  });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, listeners, messages, openings, window, child, geometry, copied: () => copied };
}

test('code stays visible beside reusable authentication popup and both close on completion', async () => {
  const f = await boot();
  assert.equal(f.nodes.get('code').textContent, 'TEST-CODE');
  assert.equal(f.openings.length, 0);
  const open = f.nodes.get('open-auth');
  open.listeners.click();
  assert.equal(f.openings.length, 1, 'authentication does not require copying');
  assert.equal(f.openings[0][0], 'about:blank');
  assert.deepEqual(f.geometry.map(call => call[0]), ['resize', 'move', 'navigate']);
  assert.equal(f.geometry.at(-1)[1], 'https://auth.openai.com/codex/device');
  assert.match(f.openings[0][2], /left=536/);
  assert.equal(f.nodes.get('code').textContent, 'TEST-CODE');
  open.listeners.click();
  assert.equal(f.openings.length, 1);
  assert.equal(f.child.focused, 1);
  const copy = f.nodes.get('copy-code');
  await copy.listeners.click({ target: copy });
  assert.equal(f.copied(), 'TEST-CODE');
  assert.equal(copy.textContent, '✓ 복사됨');
  f.listeners.message({ origin: 'https://evil.example', source: f.window.opener, data: { type: '5e:session-received' } });
  assert.equal(f.child.closed, false);
  f.listeners.message({ origin: 'https://www.5e.ai.kr', source: f.window.opener, data: { type: '5e:session-received' } });
  assert.equal(f.child.closed, true);
  assert.equal(f.window.closed, true);
});

test('invalid provider URLs cannot open authentication windows', async () => {
  const f = await boot('https://evil.example/login');
  assert.equal(f.openings.length, 0);
  assert.equal(f.messages.at(-1)[0].type, '5e:login-error');
});

test('closing the code popup closes its authentication child', async () => {
  const f = await boot();
  f.nodes.get('open-auth').listeners.click();
  f.listeners.pagehide();
  assert.equal(f.child.closed, true);
});

test('a closed authentication window is reopened with a fresh name', async () => {
  const f = await boot();
  f.nodes.get('open-auth').listeners.click();
  f.child.closed = true;
  f.nodes.get('open-auth').listeners.click();
  assert.notEqual(f.openings[0][1], f.openings[1][1]);
});

test('authentication geometry fits a small display with negative monitor coordinates', async () => {
  const f = await boot(undefined, { availLeft: -800, availTop: -600, availWidth: 500, availHeight: 400 });
  f.nodes.get('open-auth').listeners.click();
  assert.deepEqual(f.geometry[0], ['resize', 500, 400]);
  assert.deepEqual(f.geometry[1], ['move', -800, -600]);
});

test('browser refusal to move or resize does not prevent authentication navigation', async () => {
  const f = await boot(undefined, {}, true);
  f.nodes.get('open-auth').listeners.click();
  assert.deepEqual(f.geometry, [['navigate', 'https://auth.openai.com/codex/device']]);
});
