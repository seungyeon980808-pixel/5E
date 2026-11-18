// 그림으로 만드는 그래프 엔진(1.8.0 옵션). image_generator의 그래프 엔진(설계 → 값 검사 → 정리 → 그리기)을 옮겼다.
// 이름·모양은 E1 확정 계약(image_generator docs/5e-경계.md 1·6·7절)을 따른다.
// 기본 그래프 생성은 지금의 5E 그래프 객체 생성이며 이 엔진은 그것을 바꾸지 않는다. 화면에서 고르는 자리는 아직 없고
// 플래그(isAiGraphPictureEnabled·graphEngineChoice)와 엔진 함수(createGraphEngine·makeGraph)만 내놓는다.
//
// const eng = createGraphEngine({ ai, conventions?, drawGraph?, models?, onPhase?, textTries? })
// await eng.makeGraph({ request, keyValues?, subject?, verify = true, plan?, signal?, previous? }) →
//   { plan,        // 설계 JSON + keyText — 이미지 객체 meta.graphPlan으로 저장(graphPlanMeta)
//     prepared,    // 그리기 직전으로 정리한 설계
//     verified,    // true(검사가 고침) | false(그대로) | null(검사 안 함·받은 설계)
//     verifyError, collisions:{n,list}, svg, png,
//     parts, size, warnings, fallback: null | 'minimal' | 'previous', cancelled?, engine, version }
// 계약보다 더 하는 것(5E 원칙 「실패로 끝나면 안 됨」): 설계를 못 받으면(GRAPH_PLAN·연결 오류) 앞 결과(previous)를,
// 없으면 요청에서 축 이름만 읽은 축만 있는 설계로 그린다. 취소는 앞 결과가 있으면 그것(cancelled:true), 없으면 AbortError.
import { plan as planGraph, makeReadText, isAbort, isPlan, abortError } from './plan.js?v=1.7.0-four-session-integration';
import { verifyPlan, prepare } from './verify.js?v=1.7.0-four-session-integration';

export { plan, planPrompt, parseJson, conventionsFor, fixTick, curveYs, fixLabels, isPlan } from './plan.js?v=1.7.0-four-session-integration';
export { verifyPlan, prepare, planFacts } from './verify.js?v=1.7.0-four-session-integration';

export const AI_GRAPH_ENGINE = 'ai-graph-picture';
export const AI_GRAPH_ENGINE_VERSION = '1.0.0';
export const AI_GRAPH_PICTURE_FLAG = '5e.aiGraph.pictureEngine';
export const DEFAULT_MODELS = Object.freeze({ text: 'gpt-6.1-sol' });
const CONVENTIONS_URL = new URL('../../assets/ai-graph/conventions.json', import.meta.url).href;

// 옵션 플래그: 켜져 있을 때만 「그림으로 생성」을 쓸 수 있다. 기본은 꺼짐(지금의 그래프 객체 생성).
//   localStorage['5e.aiGraph.pictureEngine'] === '1' 또는 globalThis.__FIVE_E_AI_GRAPH_PICTURE__ === true
export function isAiGraphPictureEnabled(storage = null) {
  if (globalThis.__FIVE_E_AI_GRAPH_PICTURE__ === true) return true;
  try {
    const s = storage || globalThis.localStorage;
    return !!s && s.getItem(AI_GRAPH_PICTURE_FLAG) === '1';
  } catch { return false; }
}
// 어떤 그래프 생성을 쓸지: 옵션을 고르고 플래그가 켜졌을 때만 'picture', 그 밖에는 언제나 'objects'(기본).
export function graphEngineChoice({ picture = false, storage = null } = {}) {
  return picture && isAiGraphPictureEnabled(storage) ? 'picture' : 'objects';
}

let conventionsPromise = null;
// 과목별 관례(180KB)는 처음 쓸 때 한 번 받는다. 못 받으면 관례 없이 설계한다.
export function loadConventions(fetchImpl = globalThis.fetch) {
  if (!conventionsPromise) {
    conventionsPromise = (async () => {
      try { const r = await fetchImpl(CONVENTIONS_URL); if (!r.ok) return null; return await r.json(); } catch { return null; }
    })();
  }
  return conventionsPromise;
}

// AI 설계를 전혀 못 받았을 때: 요청에서 축 이름만 읽은 축만 있는 설계(다시 열어 고칠 수 있음).
export function minimalPlan(request = '') {
  const text = String(request);
  const pick = (re) => { const m = re.exec(text); return m ? m[1].trim() : ''; };
  const axis = (name) => pick(new RegExp(`${name}(?:은|는|에는|:|을|를)?\\s*[‘'"「]?([^,，.\\n‘’'"」]+?)[’'"」]?\\s*(?:으로|로|,|，|이고|\\.|\\n|$)`));
  return {
    xMin: 0, xMax: 1, yMin: 0, yMax: 1, labelX: axis('가로축'), labelY: axis('세로축'),
    xTicks: [], yTicks: [], series: [], marks: [], guides: [], lineLabels: [],
    notes: '설계를 받지 못해 축만 그렸습니다. 설계를 고쳐 다시 그릴 수 있습니다.',
  };
}
// 다시 그리기용 설계가 그릴 수 있는지(곡선이 없어도 축 범위만 맞으면 됨 — 축만 있는 설계도 다시 열 수 있게).
const hasAxes = (p) => !!p && typeof p === 'object' && ['xMin', 'xMax', 'yMin', 'yMax'].every((k) => Number.isFinite(+p[k])) && +p.xMax > +p.xMin && +p.yMax > +p.yMin;

async function defaultDrawGraph(prepared, options) {
  const { drawGraph } = await import('./draw.js?v=1.7.0-four-session-integration');
  return drawGraph(prepared, options);
}

export function createGraphEngine({ ai, conventions, drawGraph = defaultDrawGraph, models = {}, onPhase = () => {}, textTries = 3, fetch: fetchImpl } = {}) {
  if (!ai || typeof ai.readText !== 'function') throw new Error('createGraphEngine: ai.readText가 필요합니다.');
  const M = { ...DEFAULT_MODELS, ...models };
  const phase = (p, extra = {}) => { try { onPhase({ phase: p, ...extra }); } catch { /* 진행 알림 오류는 무시 */ } };
  const rt = (signal) => makeReadText(ai, { model: M.text, signal, tries: textTries });
  const conv = async () => (conventions !== undefined ? conventions : loadConventions(fetchImpl));

  async function makeGraph({ request = '', keyValues = '', subject = '', verify = true, plan = null, signal, previous = null, drawOptions = {} } = {}) {
    const warnings = [];
    const keepPrevious = (why) => ({ ...previous, warnings: [...(previous.warnings || []), why], fallback: 'previous' });
    try {
      if (signal?.aborted) throw abortError();
      let p = plan, verified = null, verifyError = null, fallback = null;
      if (p && !hasAxes(p)) { warnings.push('저장된 설계의 축 범위가 올바르지 않아 축만 그립니다.'); p = minimalPlan(p.request || request); fallback = 'minimal'; }
      if (!p) {
        phase('graph-plan');
        try { p = await planGraph(rt(signal), request, keyValues, { conventions: await conv() }); }
        catch (error) {
          if (isAbort(error) || signal?.aborted) throw error;
          warnings.push('설계 AI 실패: ' + (error?.message || error));
          if (previous?.png && previous?.plan) return keepPrevious('설계를 받지 못해 앞 결과를 그대로 둡니다.');
          p = minimalPlan(request); fallback = 'minimal';
        }
        if (verify && !fallback) {
          phase('graph-verify');
          const v = await verifyPlan(rt(signal), request, keyValues, p);
          p = v.plan; verified = v.changed; verifyError = v.error || null;
          if (verifyError) warnings.push('값 검사 AI 실패(앞 설계로 그림): ' + verifyError);
        }
        p = { ...p, ...(request ? { request } : {}), ...(subject ? { subject } : {}) };
      }
      p = { ...p, keyText: keyValues || p.keyText || '' };
      const prepared = prepare(p, keyValues);
      if (signal?.aborted) throw abortError();
      phase('graph-draw');
      let drawn;
      try { drawn = await drawGraph(prepared, { signal, ...drawOptions }); }
      catch (error) {
        if (isAbort(error) || signal?.aborted) throw error;
        if (previous?.png) return keepPrevious('그리기 실패로 앞 결과를 그대로 둡니다: ' + (error?.message || error));
        warnings.push('그리기 실패, 축만 다시 그림: ' + (error?.message || error));
        drawn = await drawGraph(prepare(minimalPlan(request), ''), { signal, ...drawOptions });
        fallback = 'minimal';
      }
      phase('done');
      return {
        plan: p, prepared, verified, verifyError,
        collisions: drawn?.collisions || null, svg: drawn?.svg || null, png: drawn?.png || null,
        parts: drawn?.parts || null, size: drawn?.size || null,
        warnings: [...warnings, ...(drawn?.warnings || [])], fallback,
        engine: AI_GRAPH_ENGINE, version: AI_GRAPH_ENGINE_VERSION,
      };
    } catch (error) {
      if ((isAbort(error) || signal?.aborted) && previous?.png) return { ...previous, cancelled: true };
      throw error;
    }
  }

  return {
    models: M, makeGraph,
    graphPlan: async (request, keyValues, { signal } = {}) => planGraph(rt(signal), request, keyValues, { conventions: await conv() }),
    verifyPlan: (request, keyValues, p, { signal } = {}) => verifyPlan(rt(signal), request, keyValues, p),
  };
}

// 한 번 쓰기: makeGraph(input, deps) = createGraphEngine(deps).makeGraph(input)
export function makeGraph(input = {}, deps = {}) {
  return createGraphEngine(deps).makeGraph(input);
}

// 5E 이미지 객체 meta에 붙일 것. 다시 열어 고치고 다시 그리기: makeGraph({ plan: meta.graphPlan }, { ai }).
export function graphPlanMeta(result) {
  return {
    graphEngine: AI_GRAPH_ENGINE,
    graphEngineVersion: AI_GRAPH_ENGINE_VERSION,
    graphPlan: JSON.parse(JSON.stringify(result.plan)),
    graphVerified: result.verified ?? null,
  };
}
