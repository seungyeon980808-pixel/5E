import { showPrompt } from './ui-dialogs.js?v=1.6.0-preview-labeler-0917-1111';

export function projectFilename(value) {
  const name = String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.(?:5e|json)$/i, '').replace(/[. ]+$/, '');
  return `${name || '새 프로젝트'}.5e`;
}

export async function chooseProjectFilename(currentName) {
  const canChooseLocation = !!(window.showSaveFilePicker || window.fiveEDesktop?.project?.save);
  const message = canChooseLocation
    ? '프로젝트 이름을 정한 다음 저장 위치를 선택하세요. .5e 확장자는 자동으로 붙습니다.'
    : '프로젝트 이름을 정하세요. .5e 확장자는 자동으로 붙습니다. 저장 위치는 브라우저의 다운로드 설정을 따릅니다. Safari에서 위치를 매번 선택하려면 설정 → 일반 → 파일 다운로드 위치를 “다운로드할 때마다 묻기”로 설정하세요.';
  const result = await showPrompt(message, {
    title: '프로젝트 저장', value: projectFilename(currentName).replace(/\.5e$/, ''),
    placeholder: '프로젝트 이름', maxLength: 120,
    okText: canChooseLocation ? '저장 위치 선택' : '파일 다운로드', cancelText: '취소',
  });
  return result === null ? null : projectFilename(result);
}
