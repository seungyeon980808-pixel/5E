const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { writeFileSync } = require('node:fs');
const { createServer } = require('./server.cjs');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const requestBody = scope => ({ clientScope: scope, purpose: 'image', text: `convert ${scope}`,
  attachments: [{ data: PNG }], model: 'gpt-5.6-sol', effort: 'medium', serviceTier: 'priority' });

class BrowserRuntime extends EventEmitter {
  constructor(id, activity) { super(); this.id = id; this.activity = activity; this.serial = 0; this.directory = `/tmp/5e-browser-${id}`; }
  async init() {}
  close() { this.dead = true; }
  async rpc(method, params = {}) {
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'thread/start') return { thread: { id: `${this.id}-thread-${++this.serial}` } };
    if (method === 'turn/start') {
      this.activity.push({ event: 'started', session: this.id, turnId: `${this.id}-turn-${this.serial}` });
      return { turn: { id: `${this.id}-turn-${this.serial}` } };
    }
    if (method === 'turn/interrupt') this.activity.push({ event: 'cancelled', session: this.id, turnId: params.turnId });
    return {};
  }
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Timed out waiting for scheduler state');
}

test('Given six real HTTP browser sessions, when five slots are occupied, then waiting, completion, browser cancellation and retry preserve global capacity', async t => {
  const activity = [];
  const runtimes = [];
  let runtimeId = 0;
  const server = createServer({
    runtimeFactory: () => {
      const runtime = new BrowserRuntime(`session-${++runtimeId}`, activity);
      runtimes.push(runtime);
      return runtime;
    },
    maxSessions: 6,
    generationConcurrency: 5,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, cookie) => fetch(`${origin}/api/${route}`, { method: 'POST',
    headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body) });

  const cookies = [];
  for (let index = 0; index < 6; index++) {
    const response = await post('session', {});
    cookies.push(response.headers.get('set-cookie').split(';')[0]);
  }
  const responses = await Promise.all(cookies.map((cookie, index) => post('bridge-send', requestBody(`crop-${index + 1}`), cookie)));
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200, 200, 200, 200]);
  await until(() => activity.filter(item => item.event === 'started').length === 5);
  const waiting = await post('bridge-events', { clientScope: 'crop-6', cursor: 0 }, cookies[5]);
  const waitingBody = await waiting.json();
  assert.equal(waitingBody.events[0].method, '5e/generation-queued');
  assert.equal(waitingBody.events[0].params.position, 1);

  const firstRun = activity.find(item => item.event === 'started' && item.session === 'session-1');
  runtimes[0].emit('notification', { method: 'item/completed', params: {
    threadId: 'session-1-thread-1', turnId: firstRun.turnId,
    item: { type: 'imageGeneration', result: PNG },
  } });
  await until(() => activity.filter(item => item.event === 'started').length === 6);
  assert.equal(activity.filter(item => item.event === 'started').at(-1).session, 'session-6');

  const retry = await post('bridge-send', requestBody('crop-1'), cookies[0]);
  assert.equal(retry.status, 200);
  const retryWaiting = await post('bridge-events', { clientScope: 'crop-1', cursor: 0 }, cookies[0]);
  assert.equal((await retryWaiting.json()).events[0].method, '5e/generation-queued');
  const cancelled = await post('bridge-interrupt', { clientScope: 'crop-2' }, cookies[1]);
  assert.equal(cancelled.status, 200);
  await until(() => activity.filter(item => item.event === 'started').length === 7);
  assert.equal(activity.filter(item => item.event === 'started').at(-1).session, 'session-1');
  if (process.env.T4_SCHEDULER_TRACE) writeFileSync(process.env.T4_SCHEDULER_TRACE, JSON.stringify({
    configuredGlobalLimit: 5,
    browserSessionCount: 6,
    initialStartedCount: 5,
    waitingEvent: waitingBody.events[0],
    completionAdmittedSession: 'session-6',
    cancelledRunningSession: 'session-2',
    retryAdmittedSession: 'session-1',
    activity,
  }, null, 2));
});

test('Given five cookies with ten scopes each, when all are accepted, then five run, forty-five queue, each eleventh is rejected, and jobs stay cookie-scoped', async t => {
  const activity = [];
  let runtimeId = 0;
  const server = createServer({
    runtimeFactory: () => new BrowserRuntime(`load-${++runtimeId}`, activity),
    maxSessions: 5,
    generationConcurrency: 5,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, cookie) => fetch(`${origin}/api/${route}`, { method: 'POST',
    headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body) });
  const cookies = [];
  for (let index = 0; index < 5; index++) {
    const response = await post('session', {});
    cookies.push(response.headers.get('set-cookie').split(';')[0]);
  }
  const jobs = Array.from({ length: 5 }, () => []);
  for (let scope = 0; scope < 10; scope++) {
    const accepted = await Promise.all(cookies.map((cookie, owner) => post('bridge-send', requestBody(`owner-${owner}-scope-${scope}`), cookie)));
    assert.deepEqual(accepted.map(response => response.status), [200, 200, 200, 200, 200]);
    const bodies = await Promise.all(accepted.map(response => response.json()));
    bodies.forEach((body, owner) => jobs[owner].push(body));
  }
  const overflow = await Promise.all(cookies.map((cookie, owner) => post('bridge-send', requestBody(`owner-${owner}-scope-10`), cookie)));
  assert.deepEqual(overflow.map(response => response.status), [429, 429, 429, 429, 429]);
  const snapshots = await Promise.all(jobs.flatMap((ownerJobs, owner) => ownerJobs.map(job => post('generation', { jobId: job.turnId }, cookies[owner]).then(response => response.json()))));
  assert.equal(snapshots.filter(job => job.state === 'running').length, 5);
  assert.equal(snapshots.filter(job => job.state === 'queued').length, 45);
  assert.equal(new Set(jobs.flat().map(job => job.turnId)).size, 50);
  assert.equal((await post('generation', { jobId: jobs[0][0].turnId }, cookies[1])).status, 404);
});
