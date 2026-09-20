const { RequestError, validateInput } = require('./generation.cjs');

class DesktopBridge {
  constructor(session) { this.session = session; this.scopes = new Map(); }
  async call(action, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.clientScope !== 'string' || body.clientScope.length > 128) throw new RequestError(400, 'Invalid workspace');
    const status = await this.session.status();
    if (action === 'status') return { login: { loggedIn: status.signedIn }, server: status.signedIn };
    if (!status.signedIn) throw new RequestError(401, 'ChatGPT 계정을 먼저 연결해 주세요.');
    if (action === 'models') return this.session.runtime.rpc('model/list', {});
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
    if (body.purpose !== 'image') throw new RequestError(422, '브라우저 연결은 이미지 생성·수정 요청을 지원합니다. 대화·자동 분석·검수·벡터 생성은 아직 연결되지 않았습니다.');
    if (body.model !== 'gpt-5.6-sol' || body.effort !== 'medium' || body.serviceTier !== 'priority') throw new RequestError(422, '이 연결은 gpt-5.6-sol · medium · priority 조건을 사용합니다. 설정을 확인해 주세요.');
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 180000 ||
        !Array.isArray(body.attachments) || body.attachments.length > 8) throw new RequestError(400, 'Invalid image request');
    const images = body.attachments.map(attachment => {
      if (!attachment || typeof attachment.data !== 'string') throw new RequestError(400, 'Invalid attachment');
      return validateInput({ request: '', image: attachment.data }).image;
    });
    if (images.reduce((size, image) => size + image.length, 0) > 11000000) throw new RequestError(413, 'Images too large');
    const existing = this.scopes.get(body.clientScope);
    if (existing && !existing.generation.isReleasable()) throw new RequestError(409, '이 작업 공간에서 이미지 생성이 진행 중입니다.');
    if (!existing && this.scopes.size >= 16) throw new RequestError(429, '열린 AI 작업이 너무 많습니다. 다시 로그인해 주세요.');
    const started = await this.session.startGeneration({ request: body.text.slice(0, 12000) }, { text: body.text, images });
    this.scopes.set(body.clientScope, { job: started.generation.job, generation: started.generation, scope: body.clientScope });
    return { turnId: started.job.jobId, renderThreadId: started.job.jobId, threadId: null,
      conversationId: null, ephemeralRender: true, purpose: 'image' };
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
    if (job.state !== 'queued') events.push(event('item/started', { item: { id: job.jobId, type: 'imageGeneration' } }));
    if (job.state === 'completed' && job.imageDataUrl) events.push(event('item/completed', { item: { id: job.jobId, type: 'imageGeneration', imageDataUrl: job.imageDataUrl } }));
    if (['completed', 'failed', 'cancelled'].includes(job.state) && !job.launchPending && (!job.turnId || job.stopped)) events.push(event('turn/completed', { turn: { id: job.jobId, status: job.state === 'cancelled' ? 'interrupted' : job.state, ...(job.error ? { error: { message: job.error } } : {}) } }));
    return { events: events.slice(cursor), cursor: events.length };
  }
  clear() { this.scopes.clear(); }
}
module.exports = { DesktopBridge };
