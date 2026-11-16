const statuses = { new:'새 접수', investigating:'조사 중', fixed:'수정 완료', 'needs-info':'추가 정보 필요' };
const list = document.querySelector('#reports'), detail = document.querySelector('#detail'), status = document.querySelector('#status');
let token = '', reports = [], selectedId = null, revision = 0;
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Authorization':`Bearer ${token}`, 'Content-Type':'application/json' }, cache:'no-store' });
  if (!response.ok) throw new Error(response.status === 401 ? '관리자 키를 확인해 주세요.' : '서버 요청을 완료하지 못했습니다. 다시 시도해 주세요.');
  return response.json();
}
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
function renderList() {
  list.replaceChildren();
  for (const report of reports.filter(report => document.querySelector('#filter').value === 'all' || report.review.status === document.querySelector('#filter').value)) {
    const button = text('button', `${statuses[report.review.status]} · ${report.title}\n${new Date(report.receivedAt).toLocaleString('ko-KR')}`);
    button.setAttribute('aria-current', String(report.id === selectedId)); button.addEventListener('click', () => void select(report.id)); list.append(button);
  }
  if (!list.children.length) list.append(text('p', '해당 상태의 접수 내역이 없습니다.'));
}
async function select(id) {
  const current = ++revision;
  try {
    const report = await api(`/api/admin/reports/${id}`); if (current !== revision) return;
    selectedId = id; renderList(); detail.replaceChildren(text('h2', report.title), text('p', `접수 번호 ${id}\n${new Date(report.receivedAt).toLocaleString('ko-KR')}`));
    for (const [label, value] of [['발생한 상황',report.description], ['재현 순서',report.steps], ['기대했던 동작',report.expected]]) detail.append(text('h3', label), text('p', value || '작성하지 않음'));
    const images = document.createElement('div'); images.className = 'images';
    for (const image of report.images) { const figure = document.createElement('figure'), img = document.createElement('img'); img.src = image.data; img.alt = image.name; figure.append(img, text('figcaption', `${image.role} · ${image.name}`)); images.append(figure); }
    detail.append(images, text('h3','화면·설정·오류'), text('pre',JSON.stringify(report.context, null, 2)));
    const form = document.createElement('form'), select = document.createElement('select'), note = document.createElement('textarea'), submit = text('button','처리 상태 저장');
    select.setAttribute('aria-label','처리 상태'); note.setAttribute('aria-label','관리자 메모');
    for (const [key, label] of Object.entries(statuses)) { const option = text('option',label); option.value = key; select.append(option); }
    select.value = report.review.status; note.value = report.review.note; note.maxLength = 4000; form.append(select, note, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true;
      try { const review = await api(`/api/admin/reports/${id}`, { method:'PUT', body:JSON.stringify({ status:select.value, note:note.value }) }); const summary = reports.find(item => item.id === id); if (summary) summary.review = review; renderList(); status.textContent = '처리 상태를 저장했습니다.'; }
      catch (error) { status.textContent = error.message; } finally { submit.disabled = false; }
    }); detail.append(form);
  } catch (error) { if (current === revision) status.textContent = error.message; }
}
async function refresh() {
  try { reports = (await api('/api/admin/reports')).reports; renderList(); status.textContent = `${reports.length}건의 최근 접수 내역입니다.`; }
  catch (error) { status.textContent = error.message; }
}
document.querySelector('#login').addEventListener('submit', event => { event.preventDefault(); token = document.querySelector('#token').value; void refresh(); });
document.querySelector('#refresh').addEventListener('click', () => void refresh());
document.querySelector('#filter').addEventListener('change', renderList);
