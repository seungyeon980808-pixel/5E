const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { EventEmitter } = require('node:events');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const allowed = new Set(['initialize', 'account/read', 'account/login/start', 'account/login/cancel', 'account/logout', 'model/list', 'thread/start', 'turn/start', 'turn/interrupt']);
class Runtime extends EventEmitter {
  constructor(directory) {
    super();
    this.directory = directory;
    this.pending = new Map();
    this.serial = 0;
    const home = path.join(directory, 'home');
    const codexHome = path.join(directory, 'codex');
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(codexHome, { mode: 0o700 });
    writeFileSync(path.join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\nweb_search = "disabled"\n[features]\nimage_generation = true\nshell_tool = false\n', { mode: 0o600 });
    this.child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      cwd: directory, stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: codexHome, TMPDIR: directory, LANG: 'en_US.UTF-8' }
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && message.method) {
        this.child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Client tools and approvals disabled' } }) + '\n');
      } else if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('Codex authentication request failed'));
        else pending.resolve(message.result);
      } else {
        if (message.method === 'account/login/completed') this.emit('login', message.params);
        if (message.method) this.emit('notification', { method: message.method, params: message.params });
      }
    });
    this.child.on('error', () => this.fail());
    this.child.on('exit', () => this.fail());
    this.child.stdin.on('error', () => this.fail());
  }
  fail() {
    if (this.dead) return;
    this.dead = true;
    this.emit('unavailable');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Codex runtime unavailable'));
    }
    this.pending.clear();
  }
  rpc(method, params = {}) {
    if (!allowed.has(method)) return Promise.reject(new Error('RPC forbidden'));
    if (this.dead) return Promise.reject(new Error('Codex runtime unavailable'));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const timer = setTimeout(() => { this.close(); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async init() {
    await this.rpc('initialize', { clientInfo: { name: 'five-e-isolated-auth', version: '0.3.0' }, capabilities: { experimentalApi: true } });
    this.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }
  close() { this.fail(); this.lines.close(); this.child.kill(); }
}
module.exports = { Runtime, allowed };
