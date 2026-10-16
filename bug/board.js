// 5E 문제 게시판 화면 — bug/api.mjs 계약을 그대로 쓴다.
// 편집기는 이 페이지를 새 탭으로 열기만 한다(그림·로그를 자동으로 보내지 않는다).
// 모든 사용자 입력은 textContent로만 그린다.
import { BUG_BOARD_API } from './config.js';
import { draftStore } from './draft.js';
import { captureScreenRegion } from './capture.js';

const STATUS = { new:'접수', investigating:'확인 중', 'needs-info':'추가 정보 필요', fixed:'해결됨' };
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 7_500_000;        // API 한도(base64 8MB) 아래로
const ADMIN_KEY = '5e.bug-board.admin';
const VISITOR_KEY = '5e.bug-board.visitor';
const content = document.getElementById('board-content');
const statusLine = document.getElementById('board-status');
const owners = new Map();                  // id → 이번 탭에서 확인한 글 비밀번호(새로 고침하면 사라짐)

const storage = {
  get(store, key) { try { return store.getItem(key); } catch { return null; } },
  set(store, key, value) { try { value == null ? store.removeItem(key) : store.setItem(key, value); } catch {} },
};
const adminToken = () => storage.get(sessionStorage, ADMIN_KEY) || '';
const syncAdminLink = () => { document.getElementById('admin-link').textContent = adminToken() ? '관리자 · 접속 중' : '관리자'; };
function visitorId() {
  let id = storage.get(localStorage, VISITOR_KEY);
  if (!/^[a-f0-9-]{36}$/.test(id || '')) { id = crypto.randomUUID(); storage.set(localStorage, VISITOR_KEY, id); }
  return id;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child instanceof Node ? child : String(child));
  return node;
}
const dateText = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR', { dateStyle:'medium', timeStyle:'short' });
};
const statusChip = status => el('span', { class:'status', dataset:{ status }, text:STATUS[status] || status });

async function api(path = '', { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-5E-Report'] = '1';
  if (auth && adminToken()) headers.Authorization = `Bearer ${adminToken()}`;
  let response;
  try {
    response = await fetch(BUG_BOARD_API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
  } catch {
    throw new Error('신고 서버에 연결하지 못했습니다. 작성 내용은 이 브라우저에 보관됩니다. 잠시 후 다시 시도해 주세요.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status:response.status });
  return data;
}

function notice(message = '', kind = '') {
  statusLine.hidden = !message;
  statusLine.textContent = message;
  statusLine.classList.toggle('error', kind === 'error');
}
const dialog = document.getElementById('message-dialog');
function ask({ title, body = '', fields = [], confirm = '확인', cancel = '취소', danger = false }) {
  return new Promise(resolve => {
    dialog.querySelector('#message-title').textContent = title;
    dialog.querySelector('#message-body').textContent = body;
    dialog.querySelector('form')?.remove();
    const form = el('form', { method:'dialog' });
    const inputs = fields.map(field => {
      const input = el('input', { type:field.type || 'text', name:field.name, autocomplete:field.autocomplete || 'off', required:field.required, minlength:field.minlength });
      form.append(el('label', { class:'field' }, el('span', { text:field.label }), input));
      return input;
    });
    dialog.querySelector('#message-body').after(form);
    const actions = dialog.querySelector('#message-actions'); actions.replaceChildren();
    const finish = value => { dialog.close(); form.remove(); resolve(value); };
    if (cancel) actions.append(el('button', { type:'button', text:cancel, onclick:() => finish(null) }));
    actions.append(el('button', { type:'button', class: danger ? 'danger' : 'primary', text:confirm, onclick:() => {
      if (!form.reportValidity()) return;
      finish(Object.fromEntries(inputs.map(input => [input.name, input.value])));
    } }));
    form.addEventListener('submit', event => { event.preventDefault(); actions.lastElementChild.click(); });
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.showModal();
    (inputs[0] || actions.lastElementChild).focus();
  });
}
const tell = (title, body) => ask({ title, body, cancel:null });

function setNav(name) {
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav === name) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}
// 화면을 옮긴 뒤에 보여 줄 안내(이동하면 이전 안내는 지운다).
let flash = null;
function go(hash, message, kind) { flash = message ? { message, kind } : null; if (location.hash === '#' + hash) route(); else location.hash = hash; }

/* ---------- 목록 ---------- */
async function renderList(params) {
  setNav('reports');
  const q = params.get('q') || '', status = params.get('status') || '', page = Math.max(1, Number(params.get('page')) || 1);
  const search = el('input', { type:'search', name:'q', value:q, placeholder:'제목·내용 검색', 'aria-label':'신고 검색' });
  const filter = el('select', { name:'status', 'aria-label':'처리 상태' },
    el('option', { value:'', text:'전체 상태' }),
    ...Object.entries(STATUS).map(([value, label]) => el('option', { value, selected: value === status, text:label })));
  const search_ = (next = {}) => {
    const p = new URLSearchParams({ q:search.value.trim(), status:filter.value, page:'1', ...next });
    for (const [key, value] of [...p]) if (!value || (key === 'page' && value === '1')) p.delete(key);
    location.hash = 'reports' + (p.toString() ? '?' + p : '');
  };
  const toolbar = el('form', { class:'toolbar', role:'search', onsubmit:event => { event.preventDefault(); search_(); } },
    search, filter, el('button', { type:'submit', text:'검색' }));
  filter.addEventListener('change', () => search_());
  const list = el('div', { class:'report-list', 'aria-busy':'true' });
  content.replaceChildren(toolbar, list);
  try {
    const query = new URLSearchParams({ ...(q && { q }), ...(status && { status }), page:String(page) });
    const data = await api('?' + query);
    list.removeAttribute('aria-busy');
    if (!data.reports.length) {
      list.replaceWith(el('div', { class:'empty' },
        el('h2', { text: q || status ? '조건에 맞는 신고가 없습니다' : '아직 접수된 신고가 없습니다' }),
        el('p', { text:'불편한 점이나 오류를 알려 주시면 확인 후 처리 상태를 여기에 남깁니다.' }),
        el('a', { class:'button primary', href:'#write', text:'신고하기' })));
      return;
    }
    content.insertBefore(el('p', { class:'result-count', text:`${data.total}건` }), list);
    for (const row of data.reports) {
      list.append(el('article', { class:'report-row' },
        statusChip(row.status),
        el('div', {},
          el('a', { class:'report-title', href:`#report/${row.id}`, text:row.title }),
          el('p', { class:'meta', text:[dateText(row.created_at), row.version && `버전 ${row.version}`, row.replies ? `답글 ${row.replies}` : '', row.fixed_version && `${row.fixed_version}에서 해결`].filter(Boolean).join(' · ') })),
        el('span', { class:'row-votes', text:`공감 ${row.votes}` })));
    }
    const pages = Math.max(1, Math.ceil(data.total / data.limit));
    if (pages > 1) content.append(el('nav', { class:'pager', 'aria-label':'페이지' },
      el('button', { type:'button', disabled:page <= 1, text:'이전', onclick:() => search_({ page:String(page - 1) }) }),
      el('span', { class:'meta', text:`${page} / ${pages}` }),
      el('button', { type:'button', disabled:page >= pages, text:'다음', onclick:() => search_({ page:String(page + 1) }) })));
  } catch (error) { list.removeAttribute('aria-busy'); notice(error.message, 'error'); }
}

/* ---------- 이미지 첨부 ---------- */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
async function fitImage(dataUrl) {
  // 큰 이미지는 긴 변 2400px·JPEG로 줄여 API 한도 안에 넣는다.
  if (dataUrl.length <= MAX_IMAGE_CHARS && /^data:image\/(png|jpeg|webp);/i.test(dataUrl)) return dataUrl;
  const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지 형식을 읽지 못했습니다.')); img.src = dataUrl; });
  for (const limit of [2400, 1800, 1200]) {
    const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = el('canvas'); canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.86);
    if (result.length <= MAX_IMAGE_CHARS) return result;
  }
  throw new Error('이미지가 너무 큽니다. 일부만 캡처해 첨부해 주세요.');
}
function attachmentEditor(images, onChange, { removable = true } = {}) {
  const wrap = el('div');
  const draw = () => {
    wrap.replaceChildren(images.length ? el('div', { class:'attachment-list' }, images.map((image, index) => el('figure', {},
      el('div', { class:'image-frame' },
        el('img', { src:image.data || image.url, alt:image.name || '첨부 이미지' }),
        removable && el('button', { type:'button', 'aria-label':`${image.name || '이미지'} 삭제`, text:'×', onclick:() => { images.splice(index, 1); draw(); onChange(); } })),
      el('figcaption', { text:image.name || '첨부 이미지' }),
      el('label', { class:'image-visibility' },
        el('input', { type:'checkbox', checked:image.public, onchange:event => { image.public = event.target.checked; onChange(); } }),
        '다른 사람에게 공개')))) : el('p', { class:'attachment-empty', text:'첨부한 이미지가 없습니다. 화면을 캡처하거나 붙여넣기(⌘V·Ctrl+V)로 넣을 수 있습니다.' }));
  };
  draw();
  return { node:wrap, draw };
}

/* ---------- 신고 작성 ---------- */
async function renderWrite() {
  setNav('');
  const saved = await draftStore('get').catch(() => null);
  const draft = { id: saved?.id || crypto.randomUUID(), title: saved?.title || '', description: saved?.description || '', images: saved?.images || [] };
  let timer;
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => draftStore('put', { ...draft, savedAt:Date.now() }).catch(() => {}), 300); };
  const title = el('input', { name:'title', maxlength:'160', value:draft.title, placeholder:'예: 라이브러리에서 크롭한 그림이 작업대에 안 들어가요' });
  const description = el('textarea', { name:'description', maxlength:'4000', placeholder:'어떤 작업 중이었는지, 무엇을 눌렀는지, 기대한 결과와 실제 결과를 적어 주세요.' });
  description.value = draft.description;
  const password = el('input', { type:'password', name:'password', minlength:'8', maxlength:'128', autocomplete:'new-password', required:true });
  const confirm = el('input', { type:'password', name:'confirm', minlength:'8', maxlength:'128', autocomplete:'new-password', required:true });
  const formStatus = el('p', { class:'form-status', role:'status', 'aria-live':'polite' });
  const attachments = attachmentEditor(draft.images, persist);
  const add = async producer => {
    if (draft.images.length >= MAX_IMAGES) return tell('이미지는 3장까지', '첨부한 이미지를 하나 지운 뒤 다시 추가해 주세요.');
    try {
      const image = await producer(); if (!image) return;
      draft.images.push({ name:image.name, data: await fitImage(image.data), public: Boolean(image.public) });
      attachments.draw(); persist();
    } catch (error) { tell('이미지를 추가하지 못했습니다', error.message); }
  };
  const fileInput = el('input', { type:'file', accept:'image/png,image/jpeg,image/webp', multiple:true, hidden:true, onchange:async event => {
    for (const file of [...event.target.files]) await add(async () => ({ name:file.name, data:await readFile(file), public:false }));
    event.target.value = '';
  } });
  const onPaste = event => {
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    for (const file of files) add(async () => ({ name:'붙여넣은 이미지.png', data:await readFile(file), public:false }));
  };
  const form = el('form', { class:'form-shell', novalidate:true, onpaste:onPaste },
    el('div', { class:'section-head' }, el('h2', { text:'문제 신고하기' })),
    el('p', { class:'help', text:'로그인 없이 신고할 수 있습니다. 첨부 이미지는 기본적으로 관리자만 봅니다. 편집기 화면이나 파일은 자동으로 보내지지 않습니다.' }),
    el('label', { class:'field' }, el('span', { text:'제목 (선택)' }), title),
    el('label', { class:'field' }, el('span', { text:'하고 싶은 말' }), description),
    el('div', { class:'field' }, el('span', { text:'이미지 첨부 (최대 3장)' }),
      el('div', { class:'attachment-actions' },
        el('button', { type:'button', text:'화면 캡처', onclick:() => add(captureScreenRegion) }),
        el('button', { type:'button', text:'파일 선택', onclick:() => fileInput.click() }),
        el('span', { class:'help', text:'붙여넣기도 됩니다' }), fileInput),
      attachments.node),
    el('div', { class:'password-row' },
      el('label', { class:'field' }, el('span', { text:'글 비밀번호 (8자 이상)' }), password, el('span', { class:'help', text:'내 글 수정·삭제와 추가 내용 작성에 씁니다. 다시 보여드릴 수 없습니다.' })),
      el('label', { class:'field' }, el('span', { text:'비밀번호 확인' }), confirm)),
    el('div', { class:'form-footer' },
      el('span', { class:'help', text:'작성 중인 내용은 이 브라우저에 자동 보관됩니다.' }),
      el('a', { class:'button quiet', href:'#reports', text:'취소' }),
      el('button', { type:'submit', class:'primary', text:'신고 보내기' })),
    formStatus);
  for (const [input, key] of [[title, 'title'], [description, 'description']]) input.addEventListener('input', () => { draft[key] = input.value; persist(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    formStatus.classList.remove('error');
    const fail = message => { formStatus.textContent = message; formStatus.classList.add('error'); };
    if (!description.value.trim() && !draft.images.length) return fail('이미지를 첨부하거나 하고 싶은 말을 적어 주세요.');
    if (password.value.length < 8) { password.focus(); return fail('글 비밀번호를 8자 이상 입력해 주세요.'); }
    if (password.value !== confirm.value) { confirm.focus(); return fail('비밀번호 확인이 일치하지 않습니다.'); }
    const submit = form.querySelector('[type=submit]'); submit.disabled = true; formStatus.textContent = '보내는 중…';
    try {
      const context = { version:'', page:'5E 문제 게시판', userAgent:navigator.userAgent, language:navigator.language,
        screen:`${screen.width}×${screen.height}@${devicePixelRatio}` };
      await api('', { method:'POST', auth:false, body:{ id:draft.id, title:title.value.trim(), description:description.value.trim(),
        images:draft.images.map(({ name, data, public:isPublic }) => ({ name, data, public:isPublic })), password:password.value, context } });
      clearTimeout(timer); await draftStore('delete').catch(() => {});
      owners.set(draft.id, password.value);
      go(`report/${draft.id}`, '신고가 접수되었습니다. 처리 상태는 이 글에서 확인할 수 있습니다.');
    } catch (error) { fail(error.message); submit.disabled = false; }
  });
  content.replaceChildren(form);
  (draft.description ? description : title).focus();
}

/* ---------- 상세 ---------- */
async function loadDetail(id) {
  const password = owners.get(id);
  return password ? api(`/${id}/access`, { method:'POST', body:{ password } }) : api(`/${id}`);
}
async function unlock(id) {
  const values = await ask({ title:'내 글 관리', body:'글을 쓸 때 정한 비밀번호를 입력해 주세요.',
    fields:[{ name:'password', label:'글 비밀번호', type:'password', autocomplete:'current-password', required:true, minlength:'8' }], confirm:'확인' });
  if (!values) return false;
  try { await api(`/${id}/access`, { method:'POST', body:{ password:values.password } }); owners.set(id, values.password); return true; }
  catch (error) { await tell('확인하지 못했습니다', error.message); return false; }
}
async function renderDetail(id) {
  setNav('reports');
  content.replaceChildren(el('p', { class:'meta', text:'불러오는 중…' }));
  let record;
  try { record = await loadDetail(id); }
  catch (error) {
    if (owners.has(id) && error.status === 401) { owners.delete(id); return renderDetail(id); }
    content.replaceChildren(el('div', { class:'empty' }, el('h2', { text:'신고를 열지 못했습니다' }), el('p', { text:error.message }), el('a', { class:'button', href:'#reports', text:'목록으로' })));
    return;
  }
  const owner = owners.has(id), admin = Boolean(adminToken());
  const secret = () => owner ? { password:owners.get(id) } : {};
  const run = async (task, success) => {
    try { await task(); if (success) notice(success); await renderDetail(id); }
    catch (error) { if (error.status === 409) { notice(error.message, 'error'); await renderDetail(id); } else tell('처리하지 못했습니다', error.message); }
  };
  const shell = el('article', { class:'detail-shell' });
  shell.append(el('header', { class:'detail-head' },
    statusChip(record.status),
    el('h2', { text:record.title }),
    el('p', { class:'meta', text:[`접수 ${dateText(record.created_at)}`, record.updated_at !== record.created_at && `수정 ${dateText(record.updated_at)}`,
      record.version && `버전 ${record.version}`, record.fixed_version && `${record.fixed_version}에서 해결`, `접수 번호 ${record.id.slice(0, 8)}`].filter(Boolean).join(' · ') })));
  if (record.description) shell.append(el('div', { class:'detail-body', text:record.description }));
  const images = record.images.map(image => ({ ...image }));
  if (admin) await Promise.all(images.filter(image => !image.public && !image.data).map(async image => {
    try {
      const response = await fetch(image.url, { headers:{ Authorization:`Bearer ${adminToken()}` }, cache:'no-store' });
      if (response.ok) image.data = URL.createObjectURL(await response.blob());
    } catch {}
  }));
  if (images.length) {
    const editor = attachmentEditor(images, () => {}, { removable:false });
    if (!owner && !admin) for (const box of editor.node.querySelectorAll('.image-visibility')) box.remove();
    else {
      editor.node.append(el('div', { class:'actions' }, el('button', { type:'button', text:'이미지 공개 설정 저장', onclick:() => run(
        () => api(`/${id}`, { method:'PATCH', body:{ ...secret(), revision:record.revision, images:images.map(({ id:imageId, public:isPublic }) => ({ id:imageId, public:isPublic })) } }),
        '이미지 공개 설정을 저장했습니다.') })));
    }
    shell.append(editor.node);
  }
  const voteKey = `5e.bug-board.voted.${id}`;
  shell.append(el('div', { class:'detail-actions' },
    el('a', { class:'button', href:'#reports', text:'목록으로' }),
    el('button', { type:'button', disabled:storage.get(localStorage, voteKey) === '1', text:`나도 겪었어요 · ${record.votes}`, onclick:async event => {
      event.currentTarget.disabled = true;
      try { const result = await api(`/${id}/vote`, { method:'POST', auth:false, body:{ visitor:visitorId() } }); storage.set(localStorage, voteKey, '1'); event.target.textContent = `나도 겪었어요 · ${result.votes}`; }
      catch (error) { event.target.disabled = false; tell('반영하지 못했습니다', error.message); }
    } }),
    !owner && !admin && el('button', { type:'button', class:'manage', text:'내 글 관리', onclick:async () => { if (await unlock(id)) renderDetail(id); } }),
    (owner || admin) && el('button', { type:'button', class:'manage', text:'글 수정', onclick:() => editReport(record, secret()) }),
    (owner || admin) && el('button', { type:'button', class:'danger', text:'삭제', onclick:async () => {
      if (!await ask({ title:'신고를 삭제할까요?', body:'삭제한 글과 첨부 이미지는 되돌릴 수 없습니다.', confirm:'삭제', danger:true })) return;
      try { await api(`/${id}`, { method:'DELETE', body:{ ...secret(), revision:record.revision } }); owners.delete(id); go('reports', '신고를 삭제했습니다.'); }
      catch (error) { tell('삭제하지 못했습니다', error.message); }
    } })));
  const replies = el('section', { 'aria-label':'답글' });
  for (const reply of record.replies) replies.append(el('article', { class:'reply' },
    el('header', {}, el('strong', { text: reply.role === 'admin' ? '관리자' : '작성자' }), el('time', { datetime:reply.created_at, text:dateText(reply.created_at) })),
    el('p', { class:'reply-body', text:reply.body })));
  if (owner || admin) {
    const body = el('textarea', { maxlength:'4000', placeholder: admin ? '관리자 답변' : '추가로 알려 주실 내용' });
    replies.append(el('form', { class:'field', onsubmit:event => { event.preventDefault(); if (!body.value.trim()) return;
      run(() => api(`/${id}/replies`, { method:'POST', body:{ ...secret(), body:body.value.trim() } }), '답글을 남겼습니다.'); } },
      el('span', { text: admin ? '관리자 답변' : '추가 내용' }), body, el('div', { class:'actions' }, el('button', { type:'submit', class:'primary', text:'남기기' }))));
  } else if (!record.replies.length) replies.append(el('p', { class:'meta', text:'아직 답글이 없습니다.' }));
  shell.append(replies);
  if (admin) shell.append(adminPanel(record, run));
  content.replaceChildren(shell);
}
function editReport(record, secret) {
  const title = el('input', { maxlength:'160', value:record.title, required:true });
  const description = el('textarea', { maxlength:'4000' }); description.value = record.description;
  const form = el('form', { class:'form-shell', onsubmit:async event => {
    event.preventDefault();
    try { await api(`/${record.id}`, { method:'PATCH', body:{ ...secret, revision:record.revision, title:title.value.trim(), description:description.value.trim() } });
      notice('글을 수정했습니다.'); renderDetail(record.id); }
    catch (error) { tell('수정하지 못했습니다', error.message); if (error.status === 409) renderDetail(record.id); }
  } },
    el('div', { class:'section-head' }, el('h2', { text:'신고 수정' })),
    el('label', { class:'field' }, el('span', { text:'제목' }), title),
    el('label', { class:'field' }, el('span', { text:'하고 싶은 말' }), description),
    el('div', { class:'form-footer' }, el('span', { class:'help' }),
      el('button', { type:'button', text:'취소', onclick:() => renderDetail(record.id) }),
      el('button', { type:'submit', class:'primary', text:'저장' })));
  content.replaceChildren(form); title.focus();
}
function adminPanel(record, run) {
  const state = el('select', {}, ...Object.entries(STATUS).map(([value, label]) => el('option', { value, selected:value === record.status, text:label })));
  const version = el('input', { maxlength:'80', value:record.fixed_version || '', placeholder:'예: 1.7.0' });
  const commit = el('input', { maxlength:'80', value:record.fixed_commit || '', placeholder:'커밋 해시' });
  const note = el('textarea', { maxlength:'4000', placeholder:'관리자만 보는 메모' }); note.value = record.admin_note || '';
  return el('section', { class:'admin-panel', 'aria-label':'관리자' },
    el('h3', { text:'관리자' }),
    el('div', { class:'admin-grid' },
      el('label', { class:'field' }, el('span', { text:'처리 상태' }), state),
      el('label', { class:'field' }, el('span', { text:'해결 버전' }), version),
      el('label', { class:'field' }, el('span', { text:'수정 커밋' }), commit)),
    el('label', { class:'field' }, el('span', { text:'메모' }), note),
    el('div', { class:'actions' }, el('button', { type:'button', class:'primary', text:'저장', onclick:() => run(() => api(`/${record.id}`, { method:'PATCH',
      body:{ revision:record.revision, status:state.value, fixed_version:version.value.trim(), fixed_commit:commit.value.trim(), admin_note:note.value } }), '처리 상태를 저장했습니다.') })),
    record.context && el('details', { class:'field' }, el('summary', { text:'접수 환경 정보' }), el('pre', { class:'meta', text:JSON.stringify(record.context, null, 2) })));
}

/* ---------- FAQ ---------- */
async function renderFaq() {
  setNav('faq');
  const shell = el('section', { class:'faq-shell' }, el('div', { class:'section-head' }, el('h2', { text:'자주 묻는 질문' })));
  content.replaceChildren(shell);
  try {
    const { faqs } = await api('/faqs', { auth:false });
    const admin = Boolean(adminToken());
    for (const faq of faqs) shell.append(el('details', { class:'faq-item' }, el('summary', { text:faq.question }), el('p', { text:faq.answer }),
      admin && !faq.id.startsWith('default-') && el('div', { class:'actions' }, el('button', { type:'button', class:'danger', text:'삭제', onclick:async () => {
        if (!await ask({ title:'FAQ를 삭제할까요?', confirm:'삭제', danger:true })) return;
        try { await api(`/faqs/${faq.id}`, { method:'DELETE' }); renderFaq(); } catch (error) { tell('삭제하지 못했습니다', error.message); }
      } }))));
    if (admin) {
      const question = el('input', { maxlength:'160', required:true }), answer = el('textarea', { maxlength:'8000', required:true });
      shell.append(el('form', { class:'admin-panel', onsubmit:async event => { event.preventDefault();
        try { await api('/faqs', { method:'POST', body:{ question:question.value.trim(), answer:answer.value.trim() } }); notice('FAQ를 추가했습니다.'); renderFaq(); }
        catch (error) { tell('추가하지 못했습니다', error.message); } } },
        el('h3', { text:'FAQ 추가' }), el('label', { class:'field' }, el('span', { text:'질문' }), question),
        el('label', { class:'field' }, el('span', { text:'답변' }), answer),
        el('div', { class:'actions' }, el('button', { type:'submit', class:'primary', text:'추가' }))));
    }
  } catch (error) { notice(error.message, 'error'); }
}

/* ---------- 관리자 로그인 ---------- */
async function renderAdmin() {
  setNav('');
  if (adminToken()) {
    content.replaceChildren(el('section', { class:'form-shell' }, el('div', { class:'section-head' }, el('h2', { text:'관리자로 접속 중입니다' })),
      el('p', { class:'help', text:'신고 글에서 처리 상태·해결 버전·답변을 남길 수 있고, FAQ를 추가할 수 있습니다. 이 탭을 닫으면 접속이 끝납니다.' }),
      el('div', { class:'actions' }, el('a', { class:'button', href:'#reports', text:'신고 목록' }),
        el('button', { type:'button', text:'접속 끝내기', onclick:() => { storage.set(sessionStorage, ADMIN_KEY, null); notice('관리자 접속을 끝냈습니다.'); syncAdminLink(); renderAdmin(); } }))));
    return;
  }
  const key = el('input', { type:'password', autocomplete:'off', required:true, minlength:'24' });
  const form = el('form', { class:'form-shell', onsubmit:async event => {
    event.preventDefault();
    storage.set(sessionStorage, ADMIN_KEY, key.value.trim());
    try { await api('/admin/session', { method:'POST', body:{} }); go('reports', '관리자로 접속했습니다.'); }
    catch (error) { storage.set(sessionStorage, ADMIN_KEY, null); tell('접속하지 못했습니다', error.message); }
  } },
    el('div', { class:'section-head' }, el('h2', { text:'관리자 접속' })),
    el('label', { class:'field' }, el('span', { text:'관리자 접속 키' }), key, el('span', { class:'help', text:'접속 키는 이 탭에만 보관되고 탭을 닫으면 지워집니다.' })),
    el('div', { class:'form-footer' }, el('span', { class:'help' }), el('button', { type:'submit', class:'primary', text:'접속' })));
  content.replaceChildren(form); key.focus();
}

/* ---------- 경로 ---------- */
async function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  notice(flash?.message || '', flash?.kind); flash = null;
  if (path.startsWith('report/') && /^[a-f0-9-]{36}$/i.test(path.slice(7))) await renderDetail(path.slice(7));
  else if (path === 'write') await renderWrite();
  else if (path === 'faq') await renderFaq();
  else if (path === 'admin') await renderAdmin();
  else await renderList(params);
  syncAdminLink();
}
window.addEventListener('hashchange', () => { route(); content.focus({ preventScroll:true }); });
route();
