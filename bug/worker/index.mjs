import { createBoardApi } from '../api.mjs';
import { createBoardStore } from '../store.mjs';

export default {
  async fetch(request, env) {
    if (!env.DB || !env.IMAGES || !env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) {
      return Response.json({ error:'신고 서버 연결을 준비하고 있습니다. 작성 내용은 보존됩니다.' },{status:503,headers:{'Cache-Control':'no-store'}});
    }
    const images = {
      async put(key, bytes, type) { await env.IMAGES.put(key,bytes,{httpMetadata:{contentType:type}}); },
      async get(key) { const image = await env.IMAGES.get(key); return image ? image.arrayBuffer() : null; },
      async remove(key) { await env.IMAGES.delete(key); },
    };
    const store = createBoardStore(env.DB,images);
    const handler = createBoardApi({store,adminToken:env.ADMIN_TOKEN,
      allowedOrigins:(env.ALLOWED_ORIGINS || 'https://www.5e.ai.kr,https://5e.ai.kr').split(',')});
    return handler(request,{clientIp:request.headers.get('CF-Connecting-IP') || 'unknown'});
  },
};
