const { Generation, RequestError } = require('./generation.cjs');
const { DesktopBridge } = require('./desktop-bridge.cjs');
class Session {
  constructor(runtime, { loginTimeout = 600000, generationTimeout } = {}) {
    this.runtime = runtime;
    this.bridge = new DesktopBridge(this);
    this.generation = new Generation(runtime, { generationTimeout });
    this.loginTimeout = loginTimeout;
    this.state = 'signed-out';
    this.tail = Promise.resolve();
    runtime.on('login', event => {
      void this.run(async () => {
        if (!this.login || event.loginId !== this.login.loginId) return;
        this.clearLogin();
        this.state = event.success ? 'completed' : 'login-failed';
      }).catch(() => {});
    });
  }
  run(action) { const next = this.tail.then(action); this.tail = next.catch(() => {}); return next; }
  clearLogin() { clearTimeout(this.timer); this.login = null; }
  async status() {
    const result = await this.runtime.rpc('account/read', { refreshToken: false });
    const signedIn = result.account?.type === 'chatgpt';
    if (signedIn) { this.state = 'signed-in'; this.clearLogin(); }
    else if (this.state === 'signed-in' || this.state === 'completed') this.state = 'signed-out';
    return { state: this.state, signedIn, generationEnabled: true,
      ...(this.login ? { authUrl: this.login.authUrl } : {}) };
  }
  async start() {
    if ((await this.status()).signedIn || this.login) return this.status();
    const result = await this.runtime.rpc('account/login/start', { type: 'chatgpt' });
    let authUrl;
    try { authUrl = new URL(result.authUrl); } catch {}
    if (result.type !== 'chatgpt' || typeof result.loginId !== 'string' ||
        !authUrl || authUrl.protocol !== 'https:' ||
        !['auth.openai.com', 'chatgpt.com'].includes(authUrl.hostname) ||
        authUrl.username || authUrl.password || authUrl.port) {
      this.runtime.close();
      throw new Error('Unexpected login response');
    }
    this.login = result;
    this.state = 'waiting';
    this.timer = setTimeout(() => {
      void this.run(async () => { await this.cancel(); this.state = 'local-timeout'; }).catch(() => { this.state = 'error'; });
    }, this.loginTimeout);
    return this.status();
  }
  async cancel() {
    const login = this.login;
    this.clearLogin();
    if (login) await this.runtime.rpc('account/login/cancel', { loginId: login.loginId });
    this.state = 'cancelled';
    return this.status();
  }
  async generate(input) {
    if (!(await this.status()).signedIn) throw new RequestError(401, 'Sign in first');
    return this.generation.start(input);
  }
  async logout() {
    if (this.generation.job) await this.generation.cancel(this.generation.job.jobId);
    await this.cancel();
    await this.runtime.rpc('account/logout');
    this.generation.job = null;
    this.bridge.clear();
    this.state = 'signed-out';
    return this.status();
  }
  close() { this.generation.close(); this.clearLogin(); this.runtime.close(); }
}
module.exports = { Session };
