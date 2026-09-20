import { showPrompt } from './ui-dialogs.js?v=1.6.0-preview-labeler-0917-1111';

export function projectFilename(value) {
  const name = String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.(?:5e|json)$/i, '').replace(/[. ]+$/, '');
  return `${name || '새 프로젝트'}.5e`;
}

export function timestampProjectFilename(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.5e`;
}

export async function chooseProjectFilename(suggestedName) {
  const result = await showPrompt('저장 위치는 브라우저 다운로드 설정을 따릅니다. Safari: 설정 → 일반 → 파일 다운로드 위치 → 다운로드할 때마다 묻기', {
    title: '프로젝트 저장', value: suggestedName,
    placeholder: '프로젝트 이름', maxLength: 120,
    okText: '저장', cancelText: '취소',
  });
  return result === null ? null : projectFilename(result.trim() || suggestedName);
}
