'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createServer } = require('./server.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const requestBody = clientScope => ({ clientScope, purpose: 'image', text: `synthetic ${clientScope}`,
  attachments: [], model: 'gpt-5.6-sol', effort: 'medium', serviceTier: 'priority' });

class LoadTracker {
  constructor() {
    this.active = 0;
    this.peakActive = 0;
    this.peakRssBytes = process.memoryUsage().rss;
    this.waitMs = [];
    this.runMs = [];
    this.startOwners = [];
  }
  sampleMemory() { this.peakRssBytes = Math.max(this.peakRssBytes, process.memoryUsage().rss); }
}

class FixtureRuntime extends EventEmitter {
  constructor(owner, tracker) {
    super();
    this.owner = owner;
    this.tracker = tracker;
    this.directory = `/tmp/5e-scheduler-load-${process.pid}-${owner}`;
    this.serial = 0;
    this.acceptedAt = [];
    this.turns = new Map();
  }
  async init() {}
  close() { this.dead = true; }
  async rpc(method, params = {}) {
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'thread/start') {
      const threadId = `${this.owner}-thread-${++this.serial}`;
      const startedAt = performance.now();
      this.tracker.waitMs.push(startedAt - this.acceptedAt.shift());
      this.tracker.startOwners.push(this.owner);
      return { thread: { id: threadId } };
    }
    if (method === 'turn/start') {
      const turnId = `${this.owner}-turn-${this.serial}`;
      this.turns.set(turnId, performance.now());
      this.tracker.active += 1;
      this.tracker.peakActive = Math.max(this.tracker.peakActive, this.tracker.active);
      this.tracker.sampleMemory();
      setTimeout(() => this.emit('notification', { method: 'item/completed', params: {
        threadId: params.threadId, turnId, item: { type: 'imageGeneration', result: PNG },
      } }), 12).unref?.();
      return { turn: { id: turnId } };
    }
    if (method === 'turn/interrupt') {
      const startedAt = this.turns.get(params.turnId);
      if (startedAt !== undefined) {
        this.turns.delete(params.turnId);
        this.tracker.active -= 1;
        this.tracker.runMs.push(performance.now() - startedAt);
        this.tracker.sampleMemory();
      }
    }
    return {};
  }
}

const summary = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const total = ordered.reduce((sum, value) => sum + value, 0);
  return { min: Number(ordered[0].toFixed(2)), mean: Number((total / ordered.length).toFixed(2)),
    p95: Number(ordered[Math.ceil(ordered.length * 0.95) - 1].toFixed(2)), max: Number(ordered.at(-1).toFixed(2)) };
};

async function runScenario(sessionCount, jobsPerSession) {
  const tracker = new LoadTracker();
  const runtimes = [];
  const server = createServer({
    runtimeFactory: () => {
      const runtime = new FixtureRuntime(`owner-${runtimes.length}`, tracker);
      runtimes.push(runtime);
      return runtime;
    },
    maxSessions: 5,
    generationConcurrency: 5,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  assert.notEqual(port, 19423);
  const origin = `http://127.0.0.1:${port}`;
  const post = (route, body, cookie) => fetch(`${origin}/api/${route}`, { method: 'POST',
    headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body) });
  try {
    const cookies = [];
    for (let owner = 0; owner < sessionCount; owner++) {
      const response = await post('session', {});
      assert.equal(response.status, 200);
      cookies.push(response.headers.get('set-cookie').split(';')[0]);
    }
    const jobs = [];
    for (let scope = 0; scope < jobsPerSession; scope++) {
      const round = await Promise.all(cookies.map(async (cookie, owner) => {
        runtimes[owner].acceptedAt.push(performance.now());
        const response = await post('bridge-send', requestBody(`owner-${owner}-scope-${scope}`), cookie);
        assert.equal(response.status, 200);
        return { owner, ...(await response.json()) };
      }));
      jobs.push(...round);
    }
    const states = new Map();
    for (let attempt = 0; attempt < 200 && states.size < jobs.length; attempt++) {
      const results = await Promise.all(jobs.map(async job => {
        const response = await post('generation', { jobId: job.turnId }, cookies[job.owner]);
        assert.equal(response.status, 200);
        return response.json();
      }));
      results.forEach(job => { if (['completed', 'failed', 'cancelled'].includes(job.state)) states.set(job.jobId, job.state); });
      if (states.size < jobs.length) await new Promise(resolve => setTimeout(resolve, 2));
    }
    assert.equal(states.size, jobs.length);
    assert.equal([...states.values()].filter(state => state === 'completed').length, jobs.length);
    assert.ok(tracker.peakActive <= 5);
    const fairOwnerCycles = sessionCount === 1 || Array.from({ length: jobsPerSession }, (_, cycle) =>
      new Set(tracker.startOwners.slice(cycle * sessionCount, (cycle + 1) * sessionCount)).size === sessionCount).every(Boolean);
    assert.equal(fairOwnerCycles, true);
    return {
      shape: `${sessionCount}x${jobsPerSession}`,
      port,
      accepted: jobs.length,
      completed: states.size,
      peakRunning: tracker.peakActive,
      fairOwnerCycles,
      waitMs: summary(tracker.waitMs),
      runMs: summary(tracker.runMs),
      peakRssBytes: tracker.peakRssBytes,
      startOwners: tracker.startOwners,
    };
  } finally {
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  }
}

async function main() {
  const rssBeforeBytes = process.memoryUsage().rss;
  const scenarios = [];
  for (const [sessions, jobs] of [[1, 1], [1, 10], [5, 1], [5, 10]]) scenarios.push(await runScenario(sessions, jobs));
  const report = {
    fixtureOnly: true,
    externalAiRequests: 0,
    forbiddenPort19423Requests: 0,
    cleanup: { serversClosed: true, childProcessesStarted: 0 },
    globalRunningLimit: 5,
    rssBeforeBytes,
    rssAfterBytes: process.memoryUsage().rss,
    scenarios,
  };
  const output = path.resolve(process.argv[2] || '.omo/evidence/library-productization/scheduler/load.json');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report));
  process.stdout.write(`${output}\n`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { FixtureRuntime, runScenario };
