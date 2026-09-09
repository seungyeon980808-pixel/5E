const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Session } = require('./session.cjs');
class AuthRuntime extends EventEmitter {
  constructor(authUrl = 'https://auth.openai.com/oauth/authorize?state=test') {
    super(); this.authUrl = authUrl; this.calls = [];
  }
  async rpc(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
    if (method === 'account/login/start') return { type: 'chatgpt', loginId: 'test-login', authUrl: this.authUrl };
    return {};
  }
  close() { this.closed = true; }
}
test('browser login requests no device code and completion clears the pending URL', async () => {
  const runtime = new AuthRuntime();
  const session = new Session(runtime);
  try {
    const status = await session.start();
    assert.equal(status.authUrl, runtime.authUrl);
    assert.equal(status.userCode, undefined);
    assert.deepEqual(runtime.calls.find(call => call.method === 'account/login/start').params, { type: 'chatgpt' });
    runtime.signedIn = true;
    runtime.emit('login', { loginId: 'test-login', success: true });
    const completed = await session.run(() => session.status());
    assert.equal(completed.signedIn, true);
    assert.equal(completed.authUrl, undefined);
  } finally { session.close(); }
});
test('browser login cancellation uses its pending login ID', async () => {
  const runtime = new AuthRuntime();
  const session = new Session(runtime);
  try {
    await session.start();
    assert.equal((await session.cancel()).authUrl, undefined);
    assert.deepEqual(runtime.calls.find(call => call.method === 'account/login/cancel').params, { loginId: 'test-login' });
  } finally { session.close(); }
});
test('browser login rejects non-OpenAI, insecure and credential-bearing URLs', async () => {
  for (const url of ['https://example.com/', 'http://auth.openai.com/', 'https://user@auth.openai.com/', 'invalid']) {
    const runtime = new AuthRuntime(url);
    const session = new Session(runtime);
    await assert.rejects(session.start(), /Unexpected login response/);
    assert.equal(runtime.closed, true);
    session.close();
  }
});
