import { showConfirm } from './ui-dialogs.js?v=1.4.0';

export function nativeProjectTarget() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/^win/i.test(platform)) return 'win32';
  if (/^mac/i.test(platform)) return 'darwin';
  return null;
}

export async function saveNativeProjectPackage(json, target) {
  if (!['win32', 'darwin'].includes(target)) throw new Error('지원하지 않는 프로젝트 파일 형식입니다.');
  const filename = target === 'win32' ? '5E 프로젝트.exe' : '5E 프로젝트.zip';
  const mime = target === 'win32' ? 'application/octet-stream' : 'application/zip';
  const extension = target === 'win32' ? '.exe' : '.zip';
  let handle;
  if (window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: '더블클릭으로 여는 5E 프로젝트', accept: { [mime]: [extension] } }] });
    } catch (error) {
      if (error.name === 'AbortError') return { kind: 'cancelled' };
      throw error;
    }
  }
  const response = await fetch(window.FIVE_E_PROJECT_PACKAGE_API_URL, {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-5E-Request': '1', 'X-5E-Target': target }, body: json,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || '실행형 프로젝트 저장 서버에 연결하지 못했습니다.');
  }
  const blob = await response.blob();
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob); await writable.close();
    return { kind: 'saved' };
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { kind: 'download-requested' };
}

export function initProjectLaunch({ state, ready, prepare, apply, mark, needsConfirm }) {
  let queue = Promise.resolve(ready);
  const receive = payload => {
    queue = queue.then(async () => {
      try {
        if (payload.error) throw new Error(payload.error);
        const project = prepare(JSON.parse(payload.json));
        if (needsConfirm() && !await showConfirm('현재 작업을 저장한 프로젝트로 대체할까요?\n저장하지 않은 현재 작업은 사라집니다.', { title: '프로젝트 열기', okText: '열기', cancelText: '취소' })) return;
        apply(state, project); mark();
        window.dispatchEvent(new CustomEvent('5e:project-opened'));
      } catch (error) { alert('프로젝트를 열지 못했습니다. 원본 파일은 그대로 유지됩니다.\n' + error.message); }
    });
  };
  window.fiveEDesktop?.project?.onOpen(receive);
  const match = /^#project=([a-f0-9]{48})$/.exec(location.hash);
  if (match) {
    fetch(`/api/project-launch/${match[1]}`, { credentials: 'omit', cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('열기 요청이 만료되었거나 서버에 연결하지 못했습니다. 저장한 파일을 다시 더블클릭해 주세요.');
      receive({ json: await response.text() });
    }).catch(error => receive({ error: error.message }));
  }
}
