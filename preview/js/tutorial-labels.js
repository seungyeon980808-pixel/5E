import { IS_MAC } from './platform.js?v=1.6.0-preview-labeler-0917-1111';

// 단축키의 Ctrl+는 Command, 마우스 각도 스냅의 단독 Ctrl은 Option입니다.
// 표시 필드에만 적용합니다. 판정 함수·선택자·입력 데이터는 바꾸지 않습니다.
export function tutorialText(text) {
  if (!IS_MAC || typeof text !== 'string') return text;
  return text.replace(/Ctrl\s*\+/g, '__TUT_MOD__')
    .replace(/\bCtrl\b/g, 'Option(⌥)')
    .replace(/__TUT_MOD__/g, 'Command(⌘)+');
}

export function localizeTutorialCourse(course) {
  const displayFields = new Set(['title', 'text', 'hint', 'label', 'mod', 'note', 'tip', 'where', 'desc']);
  const visit = value => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const result = { ...value };
    for (const [key, field] of Object.entries(value)) {
      if (displayFields.has(key) && typeof field === 'string') result[key] = tutorialText(field);
      else if ((key === 'demo' || key === 'guide') && typeof field === 'function') {
        result[key] = (...args) => visit(field(...args));
      } else if (field && typeof field === 'object') result[key] = visit(field);
    }
    return result;
  };
  return visit(course);
}
