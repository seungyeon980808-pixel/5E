const { RequestError, validateInput } = require('./generation.cjs');
const { listModels } = require('./model-selection.cjs');

// The JSON schema only shapes the current scene turn; it never changes tools or the model profile.
function validatedSceneOutputSchema(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new RequestError(400, 'Invalid output schema');
  let nodes = 0;
  const ancestors = new Set();
  const visit = (item, depth = 0) => {
    if (++nodes > 20000 || depth > 64 || item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint' || (typeof item === 'number' && !Number.isFinite(item))) throw new RequestError(400, 'Invalid output schema');
    if (item && typeof item === 'object') {
      if ((!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) || ancestors.has(item)) throw new RequestError(400, 'Invalid output schema');
      ancestors.add(item);
      for (const child of Object.values(item)) visit(child, depth + 1);
      ancestors.delete(item);
    }
  };
  visit(value);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > 200000) throw new RequestError(413, 'Output schema too large');
  return JSON.parse(encoded);
}

class DesktopBridge {
  constructor(session) { this.session = session; this.scopes = new Map(); this.pendingScopes = new Set(); }
  async call(action, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.clientScope !== 'string' || body.clientScope.length > 128) throw new RequestError(400, 'Invalid workspace');
    const status = await this.session.status();
    if (action === 'status') return { login: { loggedIn: status.signedIn }, server: status.signedIn };
    if (!status.signedIn) throw new RequestError(401, 'ChatGPT 계정을 먼저 연결해 주세요.');
    if (action === 'models') return listModels(this.session.runtime);
    if (action === 'account') return { account: { account: { type: 'chatgpt' } }, limits: null };
    if (action === 'send') return this.send(body);
    const entry = this.scopes.get(body.clientScope);
    if (action === 'events') return this.events(entry, body.cursor);
    if (action === 'interrupt') {
      if (entry && !entry.generation.isReleasable()) await this.session.cancelGeneration(entry.job.jobId);
      return { ok: true };
    }
    throw new RequestError(404, 'Unknown bridge endpoint');
  }
  async send(body) {
    if (body.purpose !== 'image' && body.purpose !== 'scene') throw new RequestError(422, '브라우저 연결은 이미지 생성·수정과 라벨 분석·검수 요청을 지원합니다. 대화·벡터 생성은 아직 연결되지 않았습니다.');
    const scene = body.purpose === 'scene';
    if (!scene && body.outputSchema !== undefined) throw new RequestError(400, 'Output schema is only allowed for scene requests');
    const outputSchema = scene ? validatedSceneOutputSchema(body.outputSchema) : undefined;
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 180000 ||
        !Array.isArray(body.attachments) || body.attachments.length > 8) throw new RequestError(400, 'Invalid image request');
    const images = body.attachments.map(attachment => {
      if (!attachment || typeof attachment.data !== 'string') throw new RequestError(400, 'Invalid attachment');
      return validateInput({ request: '', image: attachment.data }).image;
    });
    if (images.reduce((size, image) => size + image.length, 0) > 11000000) throw new RequestError(413, 'Images too large');
    const existing = this.scopes.get(body.clientScope);
    if (this.pendingScopes.has(body.clientScope) || (existing && !existing.generation.isReleasable())) throw new RequestError(409, '이 작업 공간에서 AI 요청이 진행 중입니다.');
    if (!existing && this.scopes.size + this.pendingScopes.size >= 16) throw new RequestError(429, '열린 AI 작업이 너무 많습니다. 다시 로그인해 주세요.');
    const selection = { model: body.model, effort: body.effort, serviceTier: body.serviceTier };
    this.pendingScopes.add(body.clientScope);
    try {
      const started = await this.session.startGeneration({ request: body.text.slice(0, 12000) }, { text: body.text, images, selection, ...(scene ? { purpose: 'scene', outputSchema } : {}) });
      this.scopes.set(body.clientScope, { job: started.generation.job, generation: started.generation, scope: body.clientScope });
      return { turnId: started.job.jobId, renderThreadId: started.job.jobId, threadId: null,
        conversationId: null, ephemeralRender: true, purpose: scene ? 'scene' : 'image' };
    } finally { this.pendingScopes.delete(body.clientScope); }
  }
  events(entry, cursor = 0) {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new RequestError(400, 'Invalid event cursor');
    if (!entry) return { events: [], cursor: 0 };
    const { job, scope } = entry;
    const event = (method, params) => ({ clientScope: scope, method, params: { threadId: job.jobId, turnId: job.jobId, ...params } });
    const events = [];
    if (job.wasQueued) events.push(event('5e/generation-queued', {
      position: this.session.generations.queuePosition(job.jobId) || 1,
    }));
    if (job.purpose === 'scene') {
      if (job.state === 'completed' && typeof job.sceneText === 'string') events.push(event('item/completed', { item: { id: `${job.jobId}-scene`, type: 'agentMessage', phase: 'final_answer', text: job.sceneText } }));
      if (['completed', 'failed', 'cancelled'].includes(job.state) && !job.launchPending && (!job.turnId || job.stopped)) events.push(event('turn/completed', { turn: { id: job.jobId, status: job.state === 'cancelled' ? 'interrupted' : job.state, ...(job.error ? { error: { message: job.error } } : {}) } }));
      return { events: events.slice(cursor), cursor: events.length };
    }
    if (job.state !== 'queued') events.push(event('item/started', { item: { id: job.jobId, type: 'imageGeneration' } }));
    for (const [index, text] of (job.labelMessages || []).entries()) {
      events.push(event('item/completed', { item: { id: `${job.jobId}-labels-${index}`, type: 'agentMessage', phase: 'commentary', text } }));
    }
    if (job.state === 'completed' && job.imageDataUrl) events.push(event('item/completed', { item: { id: job.jobId, type: 'imageGeneration', imageDataUrl: job.imageDataUrl } }));
    if (['completed', 'failed', 'cancelled'].includes(job.state) && !job.launchPending && (!job.turnId || job.stopped)) events.push(event('turn/completed', { turn: { id: job.jobId, status: job.state === 'cancelled' ? 'interrupted' : job.state, ...(job.error ? { error: { message: job.error } } : {}) } }));
    return { events: events.slice(cursor), cursor: events.length };
  }
  clear() { this.scopes.clear(); }
}
module.exports = { DesktopBridge };
