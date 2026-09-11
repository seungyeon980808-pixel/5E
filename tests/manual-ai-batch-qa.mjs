import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

import { createBatchQueue } from '../js/ai-batch-queue.js';
import { createBatchStore } from '../js/ai-batch-store.js';
import outputServiceModule from '../desktop/batch-output-service.cjs';

const { createBatchOutputService } = outputServiceModule;
const evidenceDirectory = path.resolve(process.argv[2] || '.omo/evidence/library-productization/batch-engine');
const fixtureDirectory = path.join(evidenceDirectory, 'png-fixtures');
const outputDirectory = path.join(evidenceDirectory, 'manual-output');
const storePath = path.join(evidenceDirectory, 'persistent-store.json');
const timelinePath = path.join(evidenceDirectory, 'manual-timeline.json');

await Promise.all([
  rm(fixtureDirectory, { recursive: true, force: true }),
  rm(outputDirectory, { recursive: true, force: true }),
  rm(storePath, { force: true }),
  rm(timelinePath, { force: true }),
]);
await mkdir(fixtureDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

const sha256 = data => createHash('sha256').update(data).digest('hex');
const fixtures = [];
for (let index = 1; index <= 25; index += 1) {
  const canvas = createCanvas(4, 4);
  const context = canvas.getContext('2d');
  context.fillStyle = `rgb(${index * 7 % 255},${index * 13 % 255},${index * 19 % 255})`;
  context.fillRect(0, 0, 4, 4);
  const data = canvas.toBuffer('image/png');
  const filePath = path.join(fixtureDirectory, `figure-${index}.png`);
  await writeFile(filePath, data);
  const pngBase64 = data.toString('base64');
  fixtures.push({ id: `source-${index}`, name: `figure-${index}.png`, path: filePath, dataUrl: `data:image/png;base64,${pngBase64}`, pngBase64 });
}

const originalHash = sha256(await readFile(fixtures[0].path));
await writeFile(path.join(outputDirectory, 'figure-3-converted.png'), 'seeded collision');

const diskStore = createBatchStore({
  async read(key) {
    try {
      const database = JSON.parse(await readFile(storePath, 'utf8'));
      return database[key] || [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  },
  async write(key, records) {
    let database = {};
    try { database = JSON.parse(await readFile(storePath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    database[key] = records;
    await writeFile(storePath, JSON.stringify(database, null, 2));
  },
});

function controller() {
  const starts = [];
  const interrupts = [];
  return {
    starts,
    interrupts,
    generation: {
      start(job) { starts.push({ id: job.id, attempt: job.attempt }); },
      interrupt(job) { interrupts.push({ id: job.id, attempt: job.attempt }); },
    },
  };
}

const outputService = createBatchOutputService();
const output = {
  write: ({ job, result }) => outputService.write({
    outputDirectory,
    sourceName: job.sourceSnapshot.name,
    originalPath: job.sourceSnapshot.path,
    data: Buffer.from(result.pngBase64, 'base64'),
  }),
};
const timeline = [];
const scope = { sessionId: 'manual-session', workspaceId: 'manual-workspace' };
let tick = 1_800_000_000_000;
const now = () => ++tick;
let jobSerial = 0;
const createId = () => `manual-job-${++jobSerial}`;
const firstController = controller();
const firstQueue = createBatchQueue({ store: diskStore, generation: firstController.generation, output, now, createId });
let jobs = await firstQueue.enqueue({ ...scope, sources: fixtures, options: { mode: 'line-art', preserveLabels: false } });
timeline.push({ event: 'enqueued', counts: countStates(jobs) });
assert.deepEqual(countStates(jobs), { running: 10, queued: 15 });

const queued = jobs.find(job => job.state === 'queued');
const running = jobs.find(job => job.state === 'running');
await firstQueue.cancel(queued.id);
await firstQueue.cancel(running.id);
jobs = await firstQueue.list(scope);
const failure = jobs.find(job => job.state === 'running');
await firstQueue.handleEvent({ jobId: failure.id, attempt: failure.attempt, eventId: 'manual-failure', type: 'failed', error: 'controlled fixture failure' });
for (const job of (await firstQueue.list(scope)).filter(item => item.state === 'running').slice(0, 3)) {
  await firstQueue.handleEvent({ jobId: job.id, attempt: job.attempt, eventId: `pre-reload-${job.id}`, type: 'completed', result: { pngBase64: job.sourceSnapshot.pngBase64 } });
}
timeline.push({ event: 'mixed-outcomes-before-reload', counts: countStates(await firstQueue.list(scope)), interrupts: firstController.interrupts });

const resumedController = controller();
const resumedQueue = createBatchQueue({ store: diskStore, generation: resumedController.generation, output, now });
jobs = await resumedQueue.resume(scope);
timeline.push({ event: 'reloaded', counts: countStates(jobs), resumedStarts: structuredClone(resumedController.starts) });
assert.equal(jobs.filter(job => job.state === 'completed').length, 3);
assert.ok(resumedController.starts.every(start => start.attempt === 2));

for (let guard = 0; guard < 30; guard += 1) {
  const runningJobs = (await resumedQueue.list(scope)).filter(job => job.state === 'running');
  if (!runningJobs.length) break;
  for (const job of runningJobs) {
    await resumedQueue.handleEvent({ jobId: job.id, attempt: job.attempt, eventId: `finish-${job.id}-${job.attempt}`, type: 'completed', result: { pngBase64: job.sourceSnapshot.pngBase64 } });
  }
}

jobs = await resumedQueue.list(scope);
const failed = jobs.find(job => job.state === 'failed');
assert.ok(failed);
await resumedQueue.retryFailed(failed.id);
const retried = (await resumedQueue.list(scope)).find(job => job.id === failed.id);
await resumedQueue.handleEvent({ jobId: retried.id, attempt: retried.attempt, eventId: 'retry-success', type: 'completed', result: { pngBase64: retried.sourceSnapshot.pngBase64 } });
jobs = await resumedQueue.list(scope);
assert.deepEqual(countStates(jobs), { cancelled: 2, completed: 23 });
assert.equal(sha256(await readFile(fixtures[0].path)), originalHash);
const resultHashes = jobs.filter(job => job.state === 'completed').map(job => ({ id: job.id, attempt: job.attempt, ...job.result.output }));
assert.equal(new Set(resultHashes.map(result => result.path)).size, 23);
timeline.push({ event: 'retry-completed', counts: countStates(jobs), resultHashes });
await writeFile(timelinePath, JSON.stringify(timeline, null, 2));
process.stdout.write(`${JSON.stringify({ fixtureCount: fixtures.length, final: countStates(jobs), timelinePath, storePath, outputDirectory })}\n`);

function countStates(records) {
  return records.reduce((counts, record) => ({ ...counts, [record.state]: (counts[record.state] || 0) + 1 }), {});
}
