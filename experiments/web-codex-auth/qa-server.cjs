// Synthetic-only visual fixture. Commands arrive on stdin, never over HTTP.
const { EventEmitter } = require('node:events');
const { createInterface } = require('node:readline');
const { createServer } = require('./server.cjs');
const fixtures = [];
class Fixture extends EventEmitter {
  async init() { this.round = 0; this.signedIn = false; fixtures.push(this); }
  close() {}
  async rpc(method) {
    if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
    if (method === 'account/login/start') {
      return { type: 'chatgpt', loginId: String(++this.round), authUrl: 'https://auth.openai.com/oauth/authorize?state=synthetic-test' };
    }
    if (method === 'account/logout') this.signedIn = false;
    return {};
  }
}
const server = createServer({ editorNavigation: false, runtimeFactory: () => new Fixture(), sessionOptions: { loginTimeout: 25000 } });
const lines = createInterface({ input: process.stdin });
lines.on('line', command => {
  if (command === 'complete' || command === 'fail') for (const fixture of fixtures) {
    fixture.signedIn = command === 'complete';
    fixture.emit('login', { loginId: String(fixture.round), success: fixture.signedIn });
  }
});
server.listen(19384, '127.0.0.1', () => console.log('SYNTHETIC fixture only http://127.0.0.1:19384; stdin complete/fail'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { lines.close(); server.close(); });
