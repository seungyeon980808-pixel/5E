// 그림 엔진(1.8.0) 구체화: 교사의 짧은 요청 → 평가원 관례로 빈칸을 채운 그림 요청(장면별). 지어내지 않고, 모르는 값은 기호로.
// 원본 image_generator pipeline/expand.cjs. AI가 답을 못 주거나 JSON이 깨져도 실패로 끝내지 않고 원래 요청 한 장면으로 이어 간다.
import { expandPrompt } from './prompt.js';
import { tryParseJson } from './retrieve.js';

/** AI 응답 글 → 구체화 결과(장면이 없으면 원래 요청 하나). */
export function normalizeExpanded(parsed, request) {
  const j = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  const scenes = Array.isArray(j.scenes) ? j.scenes.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
  return {
    type: typeof j.type === 'string' ? j.type : '',
    graph: j.graph === true,
    scenes: scenes.length ? scenes : [request],
    keyValues: typeof j.keyValues === 'string' ? j.keyValues : '',
    notes: typeof j.notes === 'string' ? j.notes : '',
  };
}

/**
 * @param {{ request: string, subject?: string, context?: string, taxonomy: { types: string[] }, readText: (prompt: string) => Promise<string> }} args
 */
export async function expand({ request, subject = '', context = '', taxonomy, readText }) {
  const text = await readText(expandPrompt({ request, subject, context, types: taxonomy?.types || [] }));
  return normalizeExpanded(tryParseJson(text), request);
}
