const { RequestError } = require('./generation.cjs');
const { GenerationManager } = require('./generation-manager.cjs');
const { DesktopBridge } = require('./desktop-bridge.cjs');
class Session {
  constructor(runtime, { loginTimeout = 600000, generationTimeout, loginMode = 'chatgpt', generationScheduler, schedulerOwner } = {}) {
    if (!['chatgpt', 'chatgptDeviceCode'].includes(loginMode)) throw new Error('Unsupported login mode');
    this.loginMode = loginMode;
    this.runtime = runtime;
    this.bridge = new DesktopBridge(this);
    this.generations = new GenerationManager(runtime, { generationTimeout, scheduler: generationScheduler, schedulerOwner });
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
      ...(this.state === 'waiting' && this.login ? { authUrl: this.login.authUrl, ...(this.login.userCode ? { userCode: this.login.userCode } : {}) } : {}) };
  }
  async start() {
    if ((await this.status()).signedIn || this.login) return this.status();
    const result = await this.runtime.rpc('account/login/start', { type: this.loginMode });
    let authUrl;
    const device = this.loginMode === 'chatgptDeviceCode';
    try { authUrl = new URL(device ? result.verificationUrl : result.authUrl); } catch {}
    if (result.type !== this.loginMode || typeof result.loginId !== 'string' ||
        (device && (typeof result.userCode !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(result.userCode))) ||
        !authUrl || authUrl.protocol !== 'https:' ||
        !['auth.openai.com', 'chatgpt.com'].includes(authUrl.hostname) ||
        authUrl.username || authUrl.password || authUrl.port) {
      this.runtime.close();
      throw new Error('Unexpected login response');
    }
    this.login = { loginId: result.loginId, authUrl: authUrl.href, ...(device ? { userCode: result.userCode } : {}) };
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
  async startGeneration(input, prepared) {
    if (!(await this.status()).signedIn) throw new RequestError(401, 'Sign in first');
    return this.generations.start(input, prepared);
  }
  async generate(input) {
    return (await this.startGeneration(input)).job;
  }
  snapshotGeneration(jobId) {
    return this.generations.snapshot(jobId);
  }
  async cancelGeneration(jobId) {
    return this.generations.cancel(jobId);
  }
  async logout() {
    await Promise.all([...this.generations.active.keys()].map(jobId => this.generations.cancel(jobId)));
    await this.cancel();
    await this.runtime.rpc('account/logout');
    this.generations.close();
    this.bridge.clear();
    this.state = 'signed-out';
    return this.status();
  }
  close() { this.generations.close(); this.clearLogin(); this.runtime.close(); }
}
module.exports = { Session };
