const { createInterface } = require('node:readline');
const { EventEmitter } = require('node:events');
const { createTrialAuth } = require('./remote-trial.cjs');
const { createGateway } = require('./editor-gateway.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
class FixtureRuntime extends EventEmitter {
  constructor() { super(); this.directory = '/tmp/5e-parallel-generation-qa'; this.serial = 0; this.active = new Map(); }
  async init() {}
  close() {}
  async rpc(method, params = {}) {
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'model/list') return { data: [{ id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'Sol (synthetic QA)', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }], serviceTiers: ['priority'] }] };
    if (method === 'thread/start') return { thread: { id: `fixture-thread-${++this.serial}` } };
    if (method === 'turn/start') {
      const turnId = `fixture-turn-${params.threadId.slice('fixture-thread-'.length)}`;
      this.active.set(turnId, { threadId: params.threadId, turnId });
      console.log(JSON.stringify({ event: 'started', active: this.active.size }));
      return { turn: { id: turnId } };
    }
    if (method === 'turn/interrupt') this.active.delete(params.turnId);
    return {};
  }
  complete() {
    const jobs = [...this.active.values()];
    console.log(JSON.stringify({ event: 'complete-requested', active: jobs.length }));
    for (const job of jobs) this.emit('notification', { method: 'item/completed', params: { threadId: job.threadId, turnId: job.turnId, item: { type: 'imageGeneration', result: PNG } } });
  }
}

async function start({ authPort = 19423, gatewayPort = 19425 } = {}) {
  const runtime = new FixtureRuntime();
  const auth = createTrialAuth({ runtimeFactory: () => runtime });
  await new Promise(resolve => auth.listen(authPort, '127.0.0.1', resolve));
  const gateway = createGateway({ authPort, allowAnonymousEditor: true });
  await new Promise(resolve => gateway.listen(gatewayPort, '127.0.0.1', resolve));
  console.log(JSON.stringify({ event: 'ready', account: `http://127.0.0.1:${gatewayPort}/account`, editor: `http://127.0.0.1:${gatewayPort}/editor/` }));
  const stop = () => {
    gateway.closeAllConnections(); auth.closeAllConnections();
    gateway.close(); auth.close();
  };
  const input = createInterface({ input: process.stdin });
  input.on('line', line => {
    if (line.trim() === 'complete') runtime.complete();
    if (line.trim() === 'exit') { input.close(); stop(); }
  });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return { auth, gateway, runtime, stop };
}

if (require.main === module) start().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { FixtureRuntime, start };
