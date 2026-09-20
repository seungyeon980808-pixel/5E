const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { Generation, validateInput } = require('./generation.cjs');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
class Fake extends EventEmitter {
  constructor(directory) { super(); this.directory = directory; this.calls = []; this.signedIn = true; }
  async init() {}
  async rpc(method, params) { this.calls.push({ method, params }); if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null }; if (method === 'thread/start') return { thread: { id: 'thread' } }; if (method === 'turn/start') return { turn: { id: 'turn' } }; return {}; }
  close() { this.dead = true; this.emit('unavailable'); }
}
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Condition timed out'); }
test('HTTP generation authentication, isolation, malformed request, concurrency, PNG and cancel', async t => {
  const runtimes = [];
  const server = createServer({ runtimeFactory: dir => { const rt = new Fake(dir); runtimes.push(rt); return rt; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body = {}, cookie) { return fetch(origin + route, { method: 'POST', headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }); }
  assert.equal((await post('/api/generate', { request: 'pendulum' })).status, 401);
  const a = await post('/api/session'); const cookie = a.headers.get('set-cookie').split(';')[0];
  assert.equal((await a.json()).generationEnabled, true);
  runtimes[0].signedIn = false;
  assert.equal((await post('/api/generate', { request: 'pendulum' }, cookie)).status, 401);
  runtimes[0].signedIn = true;
  assert.equal((await post('/api/generate', { request: 'x', image: 'A'.repeat(12_000_001) }, cookie)).status, 413);
  assert.equal((await post('/api/generate', { request: 'x', image: 'file:///secret' }, cookie)).status, 400);
  const started = await post('/api/generate', { request: 'pendulum' }, cookie); assert.equal(started.status, 202);
  const job = await started.json();
  assert.equal((await (await post('/api/generation', { jobId: null }, cookie)).json()).jobId, job.jobId);
  const parallel = await post('/api/generate', { request: 'x' }, cookie);
  assert.equal(parallel.status, 202);
  const parallelJob = await parallel.json();
  assert.equal((await (await post('/api/generation-cancel', { jobId: parallelJob.jobId }, cookie)).json()).state, 'cancelled');
  const b = await post('/api/session'); const other = b.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/generation', { jobId: job.jobId }, other)).status, 404);
  await until(() => runtimes[0].calls.some(call => call.method === 'turn/start'));
  const turn = runtimes[0].calls.find(call => call.method === 'turn/start').params;
  assert.equal(turn.model, 'gpt-5.6-sol'); assert.equal(turn.effort, 'medium'); assert.equal(turn.serviceTier, 'priority');
  runtimes[0].emit('notification', { method: 'item/completed', params: { threadId: 'wrong', turnId: 'turn', item: { type: 'imageGeneration', result: PNG } } });
  assert.equal((await (await post('/api/generation', { jobId: job.jobId }, cookie)).json()).state, 'running');
  runtimes[0].emit('notification', { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { type: 'imageGeneration', result: PNG } } });
  await until(() => runtimes[0].calls.some(call => call.method === 'turn/interrupt'));
  const done = await (await post('/api/generation', { jobId: job.jobId }, cookie)).json();
  assert.equal(done.imageDataUrl, 'data:image/png;base64,' + PNG); assert.equal(done.state, 'completed');
  const next = await (await post('/api/generate', { request: 'x' }, cookie)).json();
  assert.equal((await (await post('/api/generation-cancel', { jobId: next.jobId }, cookie)).json()).state, 'cancelled');
});
test('events before turn RPC response preserve first result and cancel pending turn', async () => {
  const rt = new Fake('/tmp');
  const base = rt.rpc.bind(rt);
  rt.rpc = async (method, params) => { if (method === 'turn/start') { rt.emit('notification', { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { type: 'imageGeneration', result: PNG } } }); await new Promise(resolve => setTimeout(resolve, 10)); } return base(method, params); };
  const gen = new Generation(rt); const job = gen.start({ request: 'x' });
  await until(() => gen.snapshot(job.jobId).state === 'completed');
  assert.equal(gen.snapshot(job.jobId).imageDataUrl, 'data:image/png;base64,' + PNG);
  await until(() => rt.calls.some(call => call.method === 'turn/interrupt'));
  gen.close();
});
test('timeout and runtime death finish without retry, invalid output paths rejected', async () => {
  const rt = new Fake('/tmp/isolated-five-e'); const gen = new Generation(rt, { generationTimeout: 20 });
  const job = gen.start({ request: 'x' }); await until(() => gen.snapshot(job.jobId).state === 'failed');
  assert.equal(rt.calls.filter(call => call.method === 'turn/start').length, 1);
  const next = gen.start({ request: 'x' }); rt.close(); assert.equal(gen.snapshot(next.jobId).state, 'failed');
  await assert.rejects(gen.resultBytes({ savedPath: '/etc/passwd' })); gen.close();
});
test('input size and format boundaries', () => {
  assert.throws(() => validateInput({ request: 'x', image: 'data:image/png;base64,' + 'A'.repeat(24 * 1024 * 1024) }), error => error.status === 413);
  assert.throws(() => validateInput({ request: 'x', image: 'data:image/png;base64,YWJjZA==' }), error => error.status === 400);
  assert.equal(validateInput({ request: '', image: 'data:image/png;base64,' + PNG }).request, '');
});
test('new job blocked until interrupt acknowledgement, wrong turn ignored and second tool interrupted', async () => {
  const rt = new Fake('/tmp'); const base = rt.rpc.bind(rt); let release;
  rt.rpc = async (method, params) => method === 'turn/interrupt' ? new Promise(resolve => { release = resolve; }) : base(method, params);
  const gen = new Generation(rt); const job = gen.start({ request: 'x' });
  await until(() => gen.job.turnId);
  await gen.event({ method: 'item/completed', params: { threadId: 'thread', turnId: 'wrong', item: { id: 'image1', type: 'imageGeneration', result: PNG } } });
  assert.equal(gen.snapshot(job.jobId).state, 'running');
  await gen.event({ method: 'item/started', params: { threadId: 'thread', turnId: 'turn', item: { id: 'image1', type: 'imageGeneration' } } });
  const second = gen.event({ method: 'item/started', params: { threadId: 'thread', turnId: 'turn', item: { id: 'image2', type: 'imageGeneration' } } });
  await until(() => release);
  const completed = gen.event({ method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'image1', type: 'imageGeneration', result: PNG, status: 'completed' } } });
  await until(() => gen.snapshot(job.jobId).state === 'completed');
  assert.throws(() => gen.start({ request: 'x' }), error => error.status === 409);
  release({}); await Promise.all([second, completed]);
  assert.equal(gen.snapshot(job.jobId).imageDataUrl, 'data:image/png;base64,' + PNG);
  gen.start({ request: 'next' }); gen.close();
});
test('cancel during pending turn/start blocks replacement and interrupts late turn', async () => {
  const rt = new Fake('/tmp'); const base = rt.rpc.bind(rt); let release;
  rt.rpc = async (method, params) => method === 'turn/start' ? new Promise(resolve => { release = resolve; }) : base(method, params);
  const gen = new Generation(rt); const job = gen.start({ request: 'x' }); await until(() => release);
  await gen.cancel(job.jobId);
  assert.throws(() => gen.start({ request: 'replacement' }), error => error.status === 409);
  release({ turn: { id: 'late' } }); await until(() => rt.calls.some(call => call.method === 'turn/interrupt'));
  await until(() => !gen.job.launchPending);
  gen.start({ request: 'next' }); gen.close();
});
test('failed PNG status, oversized output and outside-root file are rejected', async t => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '5e-result-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gen = new Generation(new Fake(root));
  await assert.rejects(gen.resultBytes({ result: PNG, status: 'failed' }));
  await assert.rejects(gen.resultBytes({ result: 'A'.repeat(12_000_000), status: 'completed' }));
  await assert.rejects(gen.resultBytes({ savedPath: '/etc/passwd', status: 'completed' }));
  fs.writeFileSync(path.join(root, 'result.png'), Buffer.from(PNG, 'base64'));
  assert.equal((await gen.resultBytes({ savedPath: path.join(root, 'result.png'), status: 'completed' })).toString('base64'), PNG);
  gen.close();
});
test('runtime rejects server approval and tool requests rather than stalling', async t => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { Runtime } = require('./runtime.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '5e-runtime-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}\nconst lines = require('node:readline').createInterface({input:process.stdin});\nconst out = value => process.stdout.write(JSON.stringify(value)+'\\n');\nlines.on('line', line => {const m=JSON.parse(line);if(m.method==='initialize'){out({id:m.id,result:{}});out({id:'approval',method:'item/commandExecution/requestApproval',params:{}});out({id:'tool',method:'item/tool/call',params:{}});}else if(m.error)out({method:'test/denied',params:{id:m.id,code:m.error.code}});});\n`, { mode: 0o700 });
  const oldPath = process.env.PATH;
  const directory = path.join(root, 'runtime'); fs.mkdirSync(directory);
  process.env.PATH = bin + path.delimiter + oldPath;
  let rt; try { rt = new Runtime(directory); } finally { process.env.PATH = oldPath; }
  t.after(() => rt.close());
  const denied = []; rt.on('notification', event => { if (event.method === 'test/denied') denied.push(event.params); });
  await rt.init(); await until(() => denied.length === 2);
  assert.deepEqual(denied, [{ id: 'approval', code: -32601 }, { id: 'tool', code: -32601 }]);
});
