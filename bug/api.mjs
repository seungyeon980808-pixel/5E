import { safeAiErrorText } from '../js/ai-error-log.js';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const STATES = new Set(['new', 'investigating', 'needs-info', 'fixed']);
const MAX_BODY = 18 * 1024 * 1024;
const encoder = new TextEncoder();
const text = (value, limit = 4000) => safeAiErrorText(value).slice(0, limit).trim();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/../g) || [], pair => parseInt(pair, 16));
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function equal(a, b) { return await digest(a) === await digest(b); }
async function passwordHash(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400, '글 비밀번호를 8~128자로 입력해 주세요.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2-sha256:100000:${salt}:${hex(bits)}`;
}
async function checkPassword(password, stored) {
  const parts = stored.split(':');
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
    && await equal(await passwordHash(password, parts[2]), stored);
}
async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, '신고 형식을 확인해 주세요.');
  if (Number(request.headers.get('content-length')) > MAX_BODY) fail(413, '첨부 용량이 큽니다. 이미지를 줄여 주세요.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, '입력 내용을 확인해 주세요.');
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); fail(413, '첨부 용량이 큽니다. 이미지를 줄여 주세요.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, '입력 내용을 읽지 못했습니다. 다시 보내 주세요.'); }
}
function imageBytes(image) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(image?.data || '');
  if (!match || match[2].length > 8 * 1024 * 1024) fail(400, 'PNG·JPEG·WebP 이미지 6MB 이하를 첨부해 주세요.');
  let bytes;
  try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); } catch { fail(400, '이미지 파일을 읽지 못했습니다.'); }
  const type = match[1].toLowerCase();
  const png = bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte);
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (!(type === 'image/png' && png || type === 'image/jpeg' && jpeg || type === 'image/webp' && webp)) fail(400, '첨부 파일의 실제 이미지 형식을 확인해 주세요.');
  return { bytes, type };
}
function publicImage(row, id, request) {
  return { id: row.id, name: row.name, type: row.type, public: row.public,
    url: new URL(`/api/bug-board/${id}/images/${row.id}`, request.url).href };
}
function publicRecord(row) {
  return { id: row.id, title: row.title, description: row.description, status: row.status, version: row.version,
    created_at: row.created_at, updated_at: row.updated_at, revision: row.revision,
    fixed_version: row.fixed_version, fixed_commit: row.fixed_commit };
}
const DEFAULT_FAQS = [
  { id:'default-report', question:'로그인 없이 신고할 수 있나요?', answer:'네. 이미지나 설명 중 하나와 글 비밀번호를 입력하면 됩니다. 글 비밀번호는 자신의 글 수정·삭제와 추가 정보 작성에 사용합니다.' },
  { id:'default-private', question:'첨부 이미지와 오류 로그는 누구에게 보이나요?', answer:'첨부 이미지는 기본 비공개입니다. 이미지별로 공개를 선택할 수 있습니다. 자동으로 첨부되는 오류 정보는 관리자만 확인합니다.' },
  { id:'default-password', question:'글 비밀번호를 잊어버렸어요.', answer:'비밀번호는 다시 보여드릴 수 없습니다. 해당 글의 접수 번호를 적어 새 신고로 관리자에게 문의해 주세요.' },
];

export function createBoardApi({ store, adminToken, allowedOrigins, clock = Date.now, rateSecret = adminToken }) {
  const origins = new Set(allowedOrigins);
  const isAdmin = async request => Boolean(adminToken?.length >= 24 && await equal(request.headers.get('authorization') || '', `Bearer ${adminToken}`));
  return async function handle(request, { clientIp = 'local' } = {}) {
    const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff', 'Vary':'Origin' };
    const origin = request.headers.get('origin');
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    try {
      if (origin && !origins.has(origin)) fail(403, '허용되지 않은 요청입니다.');
      const url = new URL(request.url), parts = url.pathname.replace(/^\/api\/bug-board\/?/, '').split('/').filter(Boolean);
      if (!url.pathname.startsWith('/api/bug-board')) fail(404, '페이지를 찾지 못했습니다.');
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:{ ...headers,
        'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,X-5E-Report,Authorization' } });
      const mutates = !['GET','HEAD'].includes(request.method);
      if (mutates && (!origins.has(origin) || request.headers.get('x-5e-report') !== '1')) fail(403, '게시판에서 다시 시도해 주세요.');
      const admin = await isAdmin(request), now = clock(), timestamp = new Date(now).toISOString();
      const limit = async (scope, maximum = 10, period = 60000) => {
        const fingerprint = await digest(`${rateSecret}:${scope}:${clientIp}`);
        if (!await store.rate(fingerprint, maximum, period, now)) fail(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
      };
      if (mutates) await limit('write', 30);
      if (parts[0] === 'admin' && parts[1] === 'session' && request.method === 'POST') {
        await limit('admin', 5);
        if (!admin) fail(401, '관리자 접속 키를 확인해 주세요.');
        return json({ ok:true });
      }
      if (parts[0] === 'faqs') {
        if (request.method === 'GET' && parts.length === 1) return json({ faqs:[...await store.faqs(), ...DEFAULT_FAQS] });
        if (!admin) fail(401, '관리자 로그인이 필요합니다.');
        if (request.method === 'POST' && parts.length === 1) {
          const input = await readJson(request), row = { id: UUID.test(input.id) ? input.id : crypto.randomUUID(),
            question: text(input.question, 160), answer: text(input.answer, 8000), updated_at:timestamp };
          if (!row.question || !row.answer) fail(400, '질문과 답변을 입력해 주세요.');
          await store.saveFaq(row); return json(row, 201);
        }
        if (request.method === 'DELETE' && UUID.test(parts[1]) && parts.length === 2) {
          if (!await store.removeFaq(parts[1])) fail(404, 'FAQ를 찾지 못했습니다.');
          return json({ ok:true });
        }
        fail(405, '지원하지 않는 요청입니다.');
      }
      if (!parts.length && request.method === 'GET') {
        const status = url.searchParams.get('status') || '';
        if (status && !STATES.has(status)) fail(400, '처리 상태를 확인해 주세요.');
        const page = Math.max(1, Math.min(10000, parseInt(url.searchParams.get('page'), 10) || 1));
        return json(await store.list({ search:text(url.searchParams.get('q'), 100), status, page }));
      }
      if (!parts.length && request.method === 'POST') {
        await limit('create', 5);
        const input = await readJson(request);
        if (!UUID.test(input.id)) fail(400, '접수 번호가 올바르지 않습니다. 다시 작성해 주세요.');
        const description = text(input.description), title = text(input.title, 160) || description.split('\n')[0].slice(0, 80) || '첨부 이미지 확인 요청';
        if (!Array.isArray(input.images) || input.images.length > 3 || !description && !input.images.length) fail(400, '이미지를 첨부하거나 하고 싶은 말을 적어 주세요.');
        const password = await passwordHash(input.password);
        const context = JSON.parse(JSON.stringify(input.context || {}, (_, value) => typeof value === 'string' ? text(value, 12000) : value));
        if (Array.isArray(context) || typeof context !== 'object' || JSON.stringify(context).length > 100000) fail(400, '오류 정보가 너무 큽니다.');
        // The password is represented by a digest only; the submitted plaintext is never saved.
        const requestHash = await digest(JSON.stringify({ title, description, context, images:input.images, password:await digest(input.password) }));
        const existing = await store.get(input.id);
        if (existing) {
          if (!await equal(existing.request_hash, requestHash)) fail(409, '이미 사용된 접수 번호입니다. 새 신고를 작성해 주세요.');
          return json({ id:input.id }, 200);
        }
        let total = 0;
        const decoded = input.images.map(image => {
          const result = imageBytes(image); total += result.bytes.length;
          return { ...result, id:crypto.randomUUID(), name:text(image.name,160) || '화면 캡처', public:image.public === true };
        });
        if (total > 12 * 1024 * 1024) fail(413, '첨부 이미지의 합계는 12MB 이하로 줄여 주세요.');
        const written = [];
        try {
          const images = [];
          for (const image of decoded) {
            const key = `${input.id}/${image.id}`; await store.images.put(key, image.bytes, image.type); written.push(key);
            images.push({ id:image.id, key, name:image.name, type:image.type, public:image.public });
          }
          const row = { id:input.id, title, description, version:text(context.version || input.version,80),
            author_hash:password, request_hash:requestHash, context, images, created_at:timestamp, updated_at:timestamp };
          if (!await store.create(row)) {
            const previous = await store.get(input.id);
            if (!previous || !await equal(previous.request_hash,requestHash)) fail(409,'같은 번호의 다른 신고가 있습니다.');
            for (const key of written) await store.images.remove(key);
          }
          return json({ id:input.id }, 201);
        } catch (error) { for (const key of written) await store.images.remove(key).catch(() => {}); throw error; }
      }
      const id = parts[0]; if (!UUID.test(id)) fail(404, '신고를 찾지 못했습니다.');
      const row = await store.get(id); if (!row) fail(404, '삭제되었거나 존재하지 않는 신고입니다.');
      const authorize = async input => {
        if (admin) return;
        await limit(`password:${id}`, 5);
        if (!await checkPassword(input.password, row.author_hash)) fail(401, '글 비밀번호를 확인해 주세요.');
      };
      if (parts[1] === 'images' && parts.length === 3 && request.method === 'GET') {
        const image = row.images.find(value => value.id === parts[2]);
        if (!image || !image.public && !admin) fail(404, '이미지를 찾지 못했습니다.');
        const bytes = await store.images.get(image.key); if (!bytes) fail(404, '이미지를 찾지 못했습니다.');
        return new Response(bytes, { headers:{ ...headers, 'Content-Type':image.type, 'Content-Disposition':'inline' } });
      }
      const detail = async owner => ({ ...publicRecord(row), replies:await store.replies(id), votes:await store.voteCount(id),
        images:row.images.filter(image => image.public || admin || owner).map(image => publicImage(image,id,request)),
        ...(admin ? { context:row.context, admin_note:row.admin_note } : {}) });
      if (parts.length === 1 && request.method === 'GET') return json(await detail(false));
      if (parts[1] === 'access' && parts.length === 2 && request.method === 'POST') {
        await authorize(await readJson(request)); const record = await detail(true);
        for (const image of record.images) if (!image.public) {
          const metadata = row.images.find(value => value.id === image.id), bytes = await store.images.get(metadata.key);
          if (bytes) image.data = `data:${image.type};base64,${btoa(Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join(''))}`;
        }
        return json(record);
      }
      if (parts.length === 1 && request.method === 'PATCH') {
        const input = await readJson(request); await authorize(input);
        if (input.revision !== row.revision) fail(409, '글이 변경되었습니다. 최신 글을 다시 열어 주세요.');
        if (admin) {
          if (input.status !== undefined) { if (!STATES.has(input.status)) fail(400,'처리 상태를 확인해 주세요.'); row.status = input.status; }
          if (input.admin_note !== undefined) row.admin_note = text(input.admin_note);
          if (input.fixed_version !== undefined) row.fixed_version = text(input.fixed_version,80);
          if (input.fixed_commit !== undefined) row.fixed_commit = text(input.fixed_commit,80);
        } else if (['status','admin_note','fixed_version','fixed_commit'].some(key => key in input)) fail(403, '처리 상태는 관리자만 변경할 수 있습니다.');
        if (input.title !== undefined) { row.title = text(input.title,160); if (!row.title) fail(400,'제목을 입력해 주세요.'); }
        if (input.description !== undefined) row.description = text(input.description);
        if (input.images !== undefined) {
          if (!Array.isArray(input.images) || input.images.length !== row.images.length) fail(400,'이미지 공개 설정을 확인해 주세요.');
          for (const image of row.images) {
            const changed = input.images.find(value => value.id === image.id);
            if (!changed || typeof changed.public !== 'boolean') fail(400,'이미지 공개 설정을 확인해 주세요.');
            image.public = changed.public;
          }
        }
        if (!row.description && !row.images.length) fail(400,'이미지나 설명을 남겨 주세요.');
        row.updated_at = timestamp;
        if (!await store.update(row, input.revision)) fail(409,'다른 변경이 있습니다. 글을 다시 열어 주세요.');
        return json({ id, revision:input.revision + 1 });
      }
      if (parts.length === 1 && request.method === 'DELETE') {
        const input = await readJson(request); await authorize(input);
        if (!Number.isInteger(input.revision) || !await store.remove(id,input.revision)) fail(409,'글이 변경되었습니다. 다시 확인해 주세요.');
        // Metadata removal makes attachments inaccessible immediately. Cleanup is bounded to this report.
        for (const image of row.images) await store.images.remove(image.key).catch(() => {});
        return json({ ok:true });
      }
      if (parts[1] === 'replies' && parts.length === 2 && request.method === 'POST') {
        const input = await readJson(request); await authorize(input);
        const body = text(input.body); if (!body) fail(400,'추가 내용을 입력해 주세요.');
        await store.reply(id,admin ? 'admin' : 'author',body,timestamp,crypto.randomUUID()); return json({ ok:true },201);
      }
      if (parts[1] === 'vote' && parts.length === 2 && request.method === 'POST') {
        const input = await readJson(request); if (!UUID.test(input.visitor)) fail(400,'다시 시도해 주세요.');
        const votes = await store.vote(id,await digest(`${rateSecret}:${id}:${input.visitor}`)); return json({ votes });
      }
      fail(405, '지원하지 않는 요청입니다.');
    } catch (error) { return json({ error: error.status ? error.message : '저장 서버에 문제가 있습니다. 작성 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.' }, error.status || 503); }
  };
}
