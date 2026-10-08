const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ourdocs/index.html'), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(search = '', hash = '') {
  const events = {}, frameEvents = {}, updates = [], messages = [];
  const frame = { contentWindow: { postMessage: (...args) => messages.push(args) }, addEventListener: (type, fn) => frameEvents[type] = fn };
  vm.runInNewContext(script, { URL, URLSearchParams, document: { getElementById: () => frame }, window: { addEventListener: (type, fn) => events[type] = fn },
    location: { href: 'https://www.5e.ai.kr/ourdocs/' + search + hash, search, hash }, history: { replaceState: (_, __, url) => updates.push(url.toString()) } });
  return { frame, events, frameEvents, updates, messages };
}
test('opens the mounted service with invitation fragments intact', () => {
  const qa = fixture('?route=%2Finvite', '#one-use-token');
  assert.equal(qa.frame.src, 'https://ourdocs-cloud.5e-desktop.workers.dev/ourdocs/invite#one-use-token');
  qa.frameEvents.load();
  assert.deepEqual(JSON.parse(JSON.stringify(qa.messages[0])), [{ type: '5e:ourdocs-ready' }, 'https://ourdocs-cloud.5e-desktop.workers.dev']);
});
test('does not turn arbitrary query strings into API or external navigations', () => {
  for (const route of ['https://attacker.example', '//attacker.example', '/api/v1/account', '/studio/../api', 'javascript:alert(1)']) {
    assert.equal(fixture('?route=' + encodeURIComponent(route)).frame.src, 'https://ourdocs-cloud.5e-desktop.workers.dev/ourdocs/');
  }
});
test('scrubs redeemed invitation tokens and mirrors SPA state only from its own frame', () => {
  const qa = fixture('?route=%2Finvite', '#one-use-token');
  const send = (origin, source, path, hash) => qa.events.message({ origin, source, data: { type: '5e:ourdocs-location', path, hash } });
  send('https://attacker.example', qa.frame.contentWindow, '/', '');
  send('https://ourdocs-cloud.5e-desktop.workers.dev', {}, '/', '');
  send('https://ourdocs-cloud.5e-desktop.workers.dev', qa.frame.contentWindow, '/api/v1/account', '');
  assert.equal(qa.updates.length, 0);
  send('https://ourdocs-cloud.5e-desktop.workers.dev', qa.frame.contentWindow, '/invite', '');
  assert.equal(qa.updates[0], 'https://www.5e.ai.kr/ourdocs/?route=%2Finvite');
  send('https://ourdocs-cloud.5e-desktop.workers.dev', qa.frame.contentWindow, '/studio/11111111-1111-4111-8111-111111111111', '');
  assert.equal(new URL(qa.updates[1]).searchParams.get('route'), '/studio/11111111-1111-4111-8111-111111111111');
});

test('shows a named path while passing only the named application route to the Worker', () => {
  const name = encodeURIComponent('4월교과협의록');
  const qa = fixture('?route=' + encodeURIComponent('/s/' + name));
  assert.equal(qa.frame.src, 'https://ourdocs-cloud.5e-desktop.workers.dev/ourdocs/s/' + name);
  assert.equal(qa.updates[0], 'https://www.5e.ai.kr/ourdocs/' + name);
});
test('recovers direct Korean share paths through Pages without intercepting unrelated or unsafe paths', () => {
  const recovery = fs.readFileSync(require('node:path').join(__dirname, '../404.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const redirects = [];
  for (const path of ['/ourdocs/4월교과협의록', '/ourdocs/' + encodeURIComponent('4월교과협의록') + '/', '/examlibrary/missing', '/ourdocs/%2fapi', '/ourdocs/admin', '/ourdocs/%ZZ'])
    vm.runInNewContext(recovery, { URL, location: { pathname: path, origin: 'https://www.5e.ai.kr', replace: url => redirects.push(url) } });
  assert.equal(redirects.length, 2);
  for (const target of redirects) assert.equal(new URL(target).searchParams.get('route'), '/s/' + encodeURIComponent('4월교과협의록'));
});
