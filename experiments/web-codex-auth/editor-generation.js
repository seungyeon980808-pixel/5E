import { state } from '/editor/js/state.js?v=1.4.0';
import { insertImageFromSrc } from '/editor/js/image-paste.js?v=1.4.0';

export function setupGeneration() {
  const dialog = document.createElement('dialog');
  dialog.className = 'web-generation';
  dialog.setAttribute('aria-labelledby', 'web-generation-title');
  dialog.innerHTML = `<header><h2 id="web-generation-title">AI 이미지 생성</h2><button type="button" data-close aria-label="AI 이미지 창 닫기">닫기</button></header>
    <form><label for="web-generation-request">만들거나 수정할 내용</label>
    <textarea id="web-generation-request" maxlength="4000" placeholder="예: 지지대에 매달린 단진자를 그려 주세요."></textarea>
    <label for="web-generation-reference">참고 이미지 <span>(선택)</span></label>
    <input id="web-generation-reference" type="file" accept="image/png,image/jpeg,image/webp">
    <p class="web-generation-help">참고 이미지와 요청을 ChatGPT로 전송합니다.<br>결과를 캔버스에 넣어 편집할 수 있습니다.</p>
    <div class="web-generation-actions"><button type="submit" data-generate>이미지 생성</button><button type="button" data-cancel hidden>생성 취소</button><button type="button" data-recover>최근 결과 확인</button></div></form>
    <p role="status" aria-live="polite" data-status>내용을 입력하거나 참고 이미지를 선택하세요.</p>
    <section data-result hidden aria-label="생성된 이미지"><img alt="AI가 생성한 과학 도식" width="512" height="512"><div class="web-generation-actions"><button type="button" data-insert>캔버스에 넣기</button><a download="5E-AI.png">원본 PNG 저장</a></div></section>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const form = find('form'), prompt = find('textarea'), reference = find('input');
  const generate = find('[data-generate]'), cancel = find('[data-cancel]');
  const recover = find('[data-recover]'), status = find('[data-status]');
  const result = find('[data-result]'), insert = find('[data-insert]');
  let jobId = null, timer = null, rawImage = null, busy = false;
  async function post(action, payload) {
    const response = await fetch('/api/' + action, { method: 'POST', headers: { 'X-5E-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(40000) });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || '요청을 처리하지 못했습니다.'); error.status = response.status; throw error; }
    return data;
  }
  function setBusy(value) {
    busy = value; generate.disabled = value; prompt.disabled = value; reference.disabled = value;
    cancel.hidden = !value; form.setAttribute('aria-busy', String(value));
  }
  async function poll() {
    clearTimeout(timer); recover.hidden = true;
    try {
      const job = await post('generation', { jobId });
      jobId = job.jobId;
      if (job.state === 'running') { timer = setTimeout(poll, 1500); return; }
      if (job.state === 'completed') {
        if (!/^data:image\/png;base64,/.test(job.imageDataUrl)) throw new Error('PNG 결과를 받지 못했습니다.');
        rawImage = job.imageDataUrl;
        find('img').src = rawImage; find('a[download]').href = rawImage;
        result.hidden = false; insert.disabled = false;
        status.textContent = '이미지가 생성되었습니다. 캔버스에 넣어 편집하세요.';
      } else status.textContent = job.error || (job.state === 'cancelled' ? '생성을 취소했습니다.' : '이미지를 생성하지 못했습니다.');
      setBusy(false);
    } catch (error) {
      if (error.status === 404) { setBusy(false); status.textContent = '진행 중인 생성 요청이 없습니다.'; return; }
      status.textContent = '연결을 확인한 뒤 결과를 다시 확인하세요.';
      recover.hidden = false;
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (!prompt.value.trim() && !reference.files.length) { status.textContent = '만들 내용을 입력하세요.'; prompt.focus(); return; }
    const file = reference.files[0];
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8_000_000)) { status.textContent = 'PNG·JPEG·WebP 이미지를 8MB 이하로 선택하세요.'; return; }
    setBusy(true); jobId = null; result.hidden = true; recover.hidden = true;
    status.textContent = '이미지를 생성하고 있습니다. 잠시 기다려 주세요.';
    try {
      const image = file ? await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('참고 이미지를 읽지 못했습니다.')); reader.readAsDataURL(file);
      }) : undefined;
      const job = await post('generate', { request: prompt.value.trim(), ...(image ? { image } : {}) });
      jobId = job.jobId;
      await poll();
    } catch (error) {
      if (error.status && error.status !== 409) { setBusy(false); status.textContent = error.message; }
      else { status.textContent = '접수 여부를 확인하지 못했습니다. 결과를 다시 확인하세요.'; recover.hidden = false; }
    }
  });
  cancel.addEventListener('click', async () => {
    if (!jobId) return;
    cancel.disabled = true;
    try { await post('generation-cancel', { jobId }); await poll(); }
    catch { status.textContent = '취소 여부를 확인하지 못했습니다. 결과를 다시 확인하세요.'; recover.hidden = false; }
    finally { cancel.disabled = false; }
  });
  recover.addEventListener('click', poll);
  insert.addEventListener('click', async () => {
    if (!rawImage) return;
    insert.disabled = true;
    try {
      await insertImageFromSrc(state, rawImage, { preserveBytes: true, at: { x: 0, y: 0 } });
      status.textContent = '캔버스에 넣었습니다. 이동하거나 크기를 조절해 보세요.';
      dialog.close();
    } catch (error) { status.textContent = error.message; insert.disabled = false; }
  });
  find('[data-close]').addEventListener('click', () => dialog.close());
  // The existing install guide also listens on this button. Capture routes this web build first.
  document.addEventListener('click', event => {
    if (!event.target.closest('#ai-image-install-open')) return;
    event.preventDefault(); event.stopImmediatePropagation(); dialog.showModal();
  }, true);
  return dialog;
}
