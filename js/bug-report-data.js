import { safeAiErrorText } from './ai-error-log.js?v=1.7.0-four-session-integration';

export const BUG_REPORT_MAX_BYTES = 18 * 1024 * 1024;
export const cleanReportText = (value, limit = 4000) => safeAiErrorText(value).slice(0, limit);
export function reportImage(value) {
  const data = value?.data || value?.src;
  if (typeof data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(data)
      || data.length > 8 * 1024 * 1024) return null;
  return { name: cleanReportText(value.name || '이미지', 160), data,
    role: ['original', 'result', 'screenshot'].includes(value.role) ? value.role : 'original' };
}
export function buildBugReport({ id, createdAt = new Date().toISOString(), title, description, expected, steps, context = {}, images = [], includeImages = false, includeDiagnostics = true }) {
  const report = { schemaVersion: 1, id, createdAt,
    title: cleanReportText(title, 160).trim(), description: cleanReportText(description).trim(),
    expected: cleanReportText(expected), steps: cleanReportText(steps),
    context: includeDiagnostics ? context : {},
    images: includeImages ? images.map(reportImage).filter(Boolean).slice(0, 3) : [] };
  if (!report.title || !report.description) throw new Error('문제 제목과 발생한 상황을 적어 주세요.');
  if (new Blob([JSON.stringify(report)]).size > BUG_REPORT_MAX_BYTES) throw new Error('첨부 용량이 큽니다. 이미지 일부를 빼거나 작은 화면 캡처를 첨부해 주세요.');
  return report;
}
