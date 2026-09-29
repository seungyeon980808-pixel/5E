import { showPrompt } from './ui-dialogs.js?v=1.6.0-remediation-0929';

export function projectFilename(value) {
  const name = String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/(?:\.(?:5e|json))+$/i, '').replace(/[. ]+$/, '');
  return `${name || '새 프로젝트'}.5e`;
}

export function timestampProjectFilename(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.5e`;
}

export async function chooseProjectFilename(suggestedName) {
  const result = await showPrompt('저장 위치는 브라우저 다운로드 설정을 따릅니다.', {
    title: '프로젝트 저장', value: suggestedName,
    placeholder: '프로젝트 이름', maxLength: 120,
    okText: '저장', cancelText: '취소',
  });
  return result === null ? null : projectFilename(result.trim() || suggestedName);
}

export async function chooseProjectSaveTarget(suggestedName, {
  directorySupported = false,
  directoryName = '',
  pickDirectory = async () => '',
} = {}) {
  if (!directorySupported || typeof document === 'undefined') {
    const filename = await chooseProjectFilename(suggestedName);
    return filename ? { kind: 'download', filename } : { kind: 'cancelled' };
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'project-save-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="project-save-title" style="width:min(400px, calc(100vw - 32px))">
        <h2 class="modal-title" id="project-save-title">프로젝트 저장</h2>
        <label class="modal-field" for="project-save-filename">
          <span class="modal-label">파일 이름</span>
          <input type="text" id="project-save-filename" class="modal-input" autocomplete="off" spellcheck="false" />
        </label>
        <div class="modal-field">
          <span class="modal-label">저장 폴더</span>
          <div class="batch-dir">
            <span class="batch-dir-path is-empty" id="project-save-dir-path"></span>
            <button type="button" class="modal-btn" id="project-save-dir-pick"></button>
          </div>
        </div>
        <div class="modal-actions" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));">
          <button type="button" class="modal-btn" id="project-save-cancel">취소</button>
          <button type="button" class="modal-btn" id="project-save-download">다운로드</button>
          <button type="button" class="modal-btn modal-btn-primary" id="project-save-dir-confirm" style="grid-column:1 / -1">폴더에 저장</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const filenameInput = overlay.querySelector('#project-save-filename');
    const path = overlay.querySelector('#project-save-dir-path');
    const pick = overlay.querySelector('#project-save-dir-pick');
    const folderConfirm = overlay.querySelector('#project-save-dir-confirm');
    let selectedDirectory = directoryName;
    let settled = false;

    const filename = () => projectFilename(filenameInput.value || suggestedName);
    const finish = (target) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(target);
    };
    const refresh = () => {
      path.textContent = selectedDirectory || '지정하지 않음 — 폴더에 저장하려면 연결하세요';
      path.classList.toggle('is-empty', !selectedDirectory);
      pick.textContent = selectedDirectory ? '폴더 변경' : '폴더 연결';
      folderConfirm.disabled = !selectedDirectory;
    };

    filenameInput.value = projectFilename(suggestedName);
    refresh();
    filenameInput.focus();
    filenameInput.select();

    pick.addEventListener('click', async () => {
      pick.disabled = true;
      try {
        const name = await pickDirectory();
        if (name) selectedDirectory = name;
      } finally {
        pick.disabled = false;
        refresh();
      }
    });
    overlay.querySelector('#project-save-cancel').addEventListener('click', () => finish({ kind: 'cancelled' }));
    overlay.querySelector('#project-save-download').addEventListener('click', () => finish({ kind: 'download', filename: filename() }));
    folderConfirm.addEventListener('click', () => {
      if (selectedDirectory) finish({ kind: 'directory', filename: filename() });
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish({ kind: 'cancelled' });
    });
    const onKeydown = (event) => {
      if (event.key === 'Escape') finish({ kind: 'cancelled' });
    };
    overlay.addEventListener('keydown', onKeydown);
  });
}
