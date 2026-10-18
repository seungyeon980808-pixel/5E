import { createBoardApi } from '../api.mjs';
import { createBoardStore } from '../store.mjs';

export default {
  async fetch(request, env) {
    if (!env.DB || !env.IMAGES || !env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) {
      return Response.json({ error:'신고 서버 연결을 준비하고 있습니다. 작성 내용은 보존됩니다.' },{status:503,headers:{'Cache-Control':'no-store'}});
    }
    // 첨부 이미지는 Workers KV(값 최대 25MB). 형식은 신고 글(D1)에 따로 기록되어 있다.
    const images = {
      async put(key, bytes, type) { await env.IMAGES.put(key,bytes,{metadata:{type}}); },
      async get(key) { return env.IMAGES.get(key,'arrayBuffer'); },
      async remove(key) { await env.IMAGES.delete(key); },
    };
    const store = createBoardStore(env.DB,images);
    const handler = createBoardApi({store,adminToken:env.ADMIN_TOKEN,
      allowedOrigins:(env.ALLOWED_ORIGINS || 'https://www.5e.ai.kr,https://5e.ai.kr').split(',')});
    return handler(request,{clientIp:request.headers.get('CF-Connecting-IP') || 'unknown'});
  },
  // 하루 한 번 이틀 지난 요청 제한 기록을 지운다(보안 점검 L5). 제한 기간은 길어야 하루다.
  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(createBoardStore(env.DB, null).prune((controller.scheduledTime || Date.now()) - 2 * 86400000));
  },
};
