import { createVisitorApi, createVisitorStore } from '../api.mjs';

// 인스턴스가 살아 있는 동안 저장소(HMAC 키)와 요청 제한 기록을 재사용한다.
let handler;

export default {
  async fetch(request, env) {
    if (!env.DB) return Response.json({ error: 'stats_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    handler ||= createVisitorApi({ store: createVisitorStore(env.DB),
      allowedOrigins: (env.ALLOWED_ORIGINS || 'https://www.5e.ai.kr,https://5e.ai.kr').split(',') });
    return handler(request, { clientIp: request.headers.get('CF-Connecting-IP') || 'unknown' });
  },
};
