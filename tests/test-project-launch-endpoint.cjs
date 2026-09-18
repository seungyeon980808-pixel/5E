const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../js/project-launch.js'), 'utf8').replace(/^import .*;\n/, '').replaceAll('export ', '');

for (const api of [undefined, 'https://projects.example/api/project-package']) {
  test(`project launch reads from ${api ? 'configured remote server' : 'same origin'} and waits for recovery`, async () => {
    let requested;
    let applied = false;
    let resume;
    const ready = new Promise(resolve => { resume = resolve; });
    const id = 'a'.repeat(48);
    const context = vm.createContext({
      URL, location: { hash: `#project=${id}`, href: `https://editor.example/preview/#project=${id}` },
      window: { FIVE_E_PROJECT_PACKAGE_API_URL: api, dispatchEvent() {} },
      CustomEvent: class {}, alert(message) { throw new Error(message); },
      fetch: async (url, options) => {
        requested = { url: String(url), options };
        return { ok: true, text: async () => '{"pages":[]}' };
      },
      ready, prepare: value => value, apply: () => { applied = true; }, mark() {}, needsConfirm: () => false,
    });
    vm.runInContext(source + '\ninitProjectLaunch({ state:{}, ready, prepare, apply, mark, needsConfirm });', context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requested.url, `${api ? 'https://projects.example' : 'https://editor.example'}/api/project-launch/${id}`);
    assert.equal(requested.options.credentials, 'omit');
    assert.equal(applied, false);
    resume();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(applied, true);
  });
}
