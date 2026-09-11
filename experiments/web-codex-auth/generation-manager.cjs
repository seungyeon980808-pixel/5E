const { Generation, RequestError, validateInput } = require('./generation.cjs');
const { GlobalGenerationScheduler } = require('./global-generation-scheduler.cjs');

class GenerationManager {
  constructor(runtime, { generationTimeout, maxActive = 10, maxRetained = 10, scheduler, schedulerOwner } = {}) {
    this.runtime = runtime;
    this.generationTimeout = generationTimeout;
    this.maxActive = maxActive;
    this.maxRetained = maxRetained;
    this.active = new Map();
    this.jobs = new Map();
    this.finished = [];
    this.latestJobId = null;
    this.scheduler = scheduler || new GlobalGenerationScheduler({ maxRunning: maxActive });
    this.schedulerOwner = schedulerOwner || runtime.directory || 'local-session';
    this.tickets = new Map();
  }
  releaseCompleted() {
    for (const [jobId, generation] of this.active) {
      if (!generation.isReleasable()) continue;
      this.active.delete(jobId);
      this.tickets.delete(jobId);
      generation.detach();
      this.finished.push(jobId);
    }
    while (this.finished.length > this.maxRetained) {
      const jobId = this.finished.shift();
      this.jobs.delete(jobId);
      if (jobId === this.latestJobId) this.latestJobId = this.finished.at(-1) ?? [...this.active.keys()].at(-1) ?? null;
    }
  }
  start(input, prepared) {
    this.releaseCompleted();
    if (this.active.size >= this.maxActive) throw new RequestError(429, `이미지 생성은 한 번에 최대 ${this.maxActive}개까지 실행할 수 있습니다. 완료된 작업을 기다린 뒤 다시 시도해 주세요.`);
    validateInput(input);
    const generation = new Generation(this.runtime, { generationTimeout: this.generationTimeout });
    const job = generation.prepare(input, prepared);
    this.active.set(job.jobId, generation);
    this.jobs.set(job.jobId, generation);
    this.latestJobId = job.jobId;
    const ticket = this.scheduler.enqueue(this.schedulerOwner, {
      start: () => generation.launch(),
      cancel: () => generation.cancel(job.jobId),
    });
    generation.job.wasQueued = ticket.state === 'queued';
    this.tickets.set(job.jobId, ticket);
    generation.setReleaseCallback(() => {
      ticket.release();
      this.releaseCompleted();
    });
    return { generation, job: generation.snapshot(job.jobId) };
  }
  generation(jobId) {
    this.releaseCompleted();
    const id = jobId === null ? this.latestJobId : jobId;
    const generation = this.jobs.get(id);
    if (!generation) throw new RequestError(404, 'Generation not found');
    return generation;
  }
  snapshot(jobId) { return this.generation(jobId).snapshot(jobId === null ? this.latestJobId : jobId); }
  queuePosition(jobId) { return this.scheduler.position(this.tickets.get(jobId)); }
  async cancel(jobId) {
    const generation = this.generation(jobId);
    const id = jobId === null ? this.latestJobId : jobId;
    this.tickets.get(id)?.cancel();
    const result = await generation.cancel(id);
    this.releaseCompleted();
    return result;
  }
  close() {
    for (const ticket of this.tickets.values()) ticket.cancel();
    for (const generation of this.jobs.values()) generation.close();
    this.active.clear();
    this.jobs.clear();
    this.finished = [];
    this.latestJobId = null;
    this.tickets.clear();
  }
}

module.exports = { GenerationManager };
