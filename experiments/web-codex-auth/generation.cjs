const { randomUUID } = require('node:crypto');
const { realpath, stat, readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const MAX_IMAGE = 8_000_000;
class RequestError extends Error { constructor(status, message) { super(message); this.status = status; } }
function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['request', 'image'].includes(key)) || typeof value.request !== 'string' || value.request.length > 12000) throw new RequestError(400, 'Invalid generation request');
  if (!value.request.trim() && !value.image) throw new RequestError(400, 'Describe an image or attach a reference');
  if (value.image !== undefined) {
    if (typeof value.image !== 'string') throw new RequestError(400, 'Invalid image');
    if (value.image.length > Math.ceil(MAX_IMAGE / 3) * 4 + 64) throw new RequestError(413, 'Image too large');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.image);
    if (!match || match[2].length % 4 || Buffer.from(match[2], 'base64').toString('base64') !== match[2]) throw new RequestError(400, 'Invalid image');
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new RequestError(400, 'Invalid image format');
    if (bytes.length > MAX_IMAGE) throw new RequestError(413, 'Image too large');
  }
  return value;
}
class Generation {
  constructor(runtime, { generationTimeout = 240000 } = {}) {
    this.runtime = runtime;
    this.timeout = generationTimeout;
    runtime.on('notification', event => { void this.event(event).catch(() => this.finish('failed', '이미지 결과를 읽지 못했습니다.')); });
    runtime.on('unavailable', () => this.finish('failed', 'AI 연결이 종료되었습니다.'));
  }
  start(value, prepared = null) {
    validateInput(value);
    if (this.job && (this.job.state === 'running' || this.job.launchPending || (this.job.turnId && !this.job.stopped))) throw new RequestError(409, 'Generation already running');
    this.job = { jobId: randomUUID(), state: 'running', launchPending: true };
    const job = this.job;
    this.timer = setTimeout(() => { this.finish('failed', '이미지 생성 시간이 초과되었습니다.'); void this.interrupt(job); }, this.timeout);
    this.timer.unref?.();
    void this.execute(value, job, prepared).catch(() => { if (this.job === job) this.finish('failed', '이미지를 생성하지 못했습니다.'); }).finally(() => { job.launchPending = false; });
    return this.snapshot(job.jobId);
  }
  snapshot(id) {
    if (id === null && this.job) id = this.job.jobId;
    if (typeof id !== 'string' || id !== this.job?.jobId) throw new RequestError(404, 'Generation not found');
    const { jobId, state, imageDataUrl, error } = this.job;
    return { jobId, state, ...(imageDataUrl ? { imageDataUrl } : {}), ...(error ? { error } : {}) };
  }
  async execute(value, job, prepared) {
    const { APPROVED_FIRST_PROMPT } = await import(pathToFileURL(path.resolve(__dirname, '../../js/ai-approved-first-png.js')).href);
    if (job.state !== 'running') return;
    const thread = await this.runtime.rpc('thread/start', { model: 'gpt-5.6-sol', serviceTier: 'priority', ephemeral: true, cwd: this.runtime.directory, approvalPolicy: 'never', sandbox: 'read-only', config: { 'features.shell_tool': false, 'features.image_generation': true, web_search: 'disabled' }, baseInstructions: 'Use only the image generation tool once. Never execute commands, browse, inspect files, review, retry, or postprocess. Return the first PNG.', developerInstructions: '' });
    job.threadId = thread.thread?.id;
    if (!job.threadId) throw new Error('Missing thread');
    if (job.state !== 'running') return;
    const input = [{ type: 'text', text: prepared?.text ?? (APPROVED_FIRST_PROMPT + (value.request.trim() ? '\n\n사용자 추가 요청:\n' + value.request : '')), text_elements: [] }];
    for (const url of prepared?.images ?? (value.image ? [value.image] : [])) input.push({ type: 'image', url });
    const result = await this.runtime.rpc('turn/start', { threadId: job.threadId, model: 'gpt-5.6-sol', effort: 'medium', serviceTier: 'priority', approvalPolicy: 'never', input });
    job.turnId = result.turn?.id || job.turnId;
    if (job.state !== 'running') await this.interrupt(job);
  }
  async event({ method, params }) {
    const job = this.job;
    if (!job || params?.threadId !== job.threadId) return;
    const turnId = params.turnId || params.turn?.id;
    if (job.turnId && turnId && turnId !== job.turnId) return;
    if (turnId) job.turnId = turnId;
    if (method === 'turn/completed') job.stopped = true;
    if (job.state !== 'running') return;
    if (params.item?.type === 'imageGeneration') {
      if (job.imageItemId && params.item.id && params.item.id !== job.imageItemId) { await this.interrupt(job); return; }
      if (params.item.id) job.imageItemId = params.item.id;
    }
    if (method === 'item/completed' && params.item?.type === 'imageGeneration' && !job.reading) {
      job.reading = true;
      try {
        const bytes = await this.resultBytes(params.item);
        if (this.job !== job || job.state !== 'running') return;
        job.imageDataUrl = 'data:image/png;base64,' + bytes.toString('base64');
        this.finish('completed');
      } catch { if (this.job === job) this.finish('failed', '유효한 PNG 결과를 받지 못했습니다.'); }
      await this.interrupt(job);
    } else if (method === 'turn/completed' && !job.reading) this.finish('failed', 'PNG 이미지가 생성되지 않았습니다.');
  }
  async resultBytes(item) {
    let bytes;
    if (item.failure || (item.status && item.status !== 'completed')) throw new Error('Image failed');
    if (typeof item.result === 'string' && item.result.length && item.result.length <= Math.ceil(MAX_IMAGE / 3) * 4 + 32) {
      const encoded = item.result.replace(/^data:image\/png;base64,/, '');
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) bytes = Buffer.from(encoded, 'base64');
    }
    if (!bytes && typeof item.savedPath === 'string') {
      const root = await realpath(this.runtime.directory);
      const file = await realpath(item.savedPath);
      if (!file.startsWith(root + path.sep)) throw new Error('Path rejected');
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_IMAGE) throw new Error('Result too large');
      bytes = await readFile(file);
    }
    if (!bytes || bytes.length > MAX_IMAGE || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Invalid PNG');
    return bytes;
  }
  finish(state, error) { if (this.job?.state !== 'running') return; clearTimeout(this.timer); this.job.state = state; if (error) this.job.error = error; }
  async interrupt(job) {
    if (!job?.threadId || !job.turnId || job.stopped) return;
    if (!job.stopPromise) job.stopPromise = this.runtime.rpc('turn/interrupt', { threadId: job.threadId, turnId: job.turnId }).catch(() => { this.runtime.close(); }).finally(() => { job.stopped = true; });
    await job.stopPromise;
  }
  async cancel(id) { this.snapshot(id); const job = this.job; this.finish('cancelled'); await this.interrupt(job); return this.snapshot(id); }
  close() { clearTimeout(this.timer); this.finish('cancelled'); }
}
module.exports = { Generation, RequestError, validateInput, MAX_IMAGE };
