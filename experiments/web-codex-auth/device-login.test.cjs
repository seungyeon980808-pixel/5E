const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Session } = require('./session.cjs');
class DeviceRuntime extends EventEmitter {
  constructor(overrides = {}) { super(); this.overrides = overrides; this.calls = []; }
  async rpc(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: this.account || null };
    if (method === 'account/login/start') return { type: 'chatgptDeviceCode', loginId: 'device-test', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH', ...this.overrides };
    return {};
  }
  close() { this.closed = true; }
}
test('device login requests correct schema, deduplicates start and clears code only on verified sign-in', async t => {
  const runtime = new DeviceRuntime();
  const session = new Session(runtime, { loginMode: 'chatgptDeviceCode' });
  t.after(() => session.close());
  const pending = await session.start();
  assert.equal(pending.state, 'waiting');
  assert.equal(pending.signedIn, false);
  assert.equal(pending.authUrl, 'https://auth.openai.com/codex/device');
  assert.equal(pending.userCode, 'ABCD-EFGH');
  assert.equal(pending.loginId, undefined);
  await session.start();
  assert.deepEqual(runtime.calls.filter(x => x.method === 'account/login/start'), [{method:'account/login/start', params:{type:'chatgptDeviceCode'}}]);
  runtime.account = { type: 'chatgpt' };
  const signedIn = await session.status();
  assert.equal(signedIn.signedIn, true);
  assert.equal(signedIn.userCode, undefined);
  assert.equal(signedIn.authUrl, undefined);
});
test('cancel and unsuccessful completion clear device code without claiming sign-in', async t => {
  const runtime = new DeviceRuntime();
  const session = new Session(runtime, { loginMode: 'chatgptDeviceCode' });
  t.after(() => session.close());
  await session.start();
  const cancelled = await session.cancel();
  assert.equal(cancelled.userCode, undefined);
  assert.deepEqual(runtime.calls.find(x => x.method === 'account/login/cancel').params, {loginId:'device-test'});
  await session.start();
  runtime.emit('login', { loginId: 'device-test', success: false });
  const failed = await session.run(() => session.status());
  assert.equal(failed.state, 'login-failed');
  assert.equal(failed.signedIn, false);
  assert.equal(failed.userCode, undefined);
});
test('device login rejects malformed codes, unexpected schema and unsafe URLs', async () => {
  for (const overrides of [
    {verificationUrl:'http://auth.openai.com/'}, {verificationUrl:'https://evil.example/'},
    {verificationUrl:'https://user@auth.openai.com/'}, {verificationUrl:'https://auth.openai.com:444/'},
    {userCode:''}, {userCode:'<script>'}, {userCode:null}, {userCode:'A'.repeat(65)},
    {type:'apiKey'}, {loginId:null}
  ]) {
    const runtime = new DeviceRuntime(overrides);
    const session = new Session(runtime, {loginMode:'chatgptDeviceCode'});
    await assert.rejects(session.start(), /Unexpected login response/);
    assert.equal(runtime.closed, true);
    session.close();
  }
});
test('API-key account never satisfies device login session', async t => {
  const runtime = new DeviceRuntime(); runtime.account = {type:'apiKey'};
  const session = new Session(runtime, {loginMode:'chatgptDeviceCode'});
  t.after(() => session.close());
  assert.equal((await session.status()).signedIn, false);
  await assert.rejects(session.generate({}), /Sign in first/);
});
