// 1.8.0 새 엔진 옵션 플래그(한곳). 화면에 고르는 자리가 생기기 전까지는 이 값으로만 켜고 끈다.
//
// | 엔진 | 저장 열쇠(localStorage) | 기본 | 끄기/켜기 | 옛 이름(계속 읽음) |
// |---|---|---|---|---|
// | 그림 생성(js/ai-figure) | `5e.aiEngine.figure` | **켜짐**(11-19 사용자 결정: 이미지 생성은 새 엔진으로 대체) | '0'이면 끔(옛 생성 길) | `5e.aiFigureEngine`('0' 끔·'1' 켬), `globalThis.FIVE_E_AI_FIGURE_ENGINE`(true/false) |
// | 그래프 「그림으로 생성」(js/ai-graph) | `5e.aiEngine.graphPicture` | **꺼짐**(기본은 지금의 그래프 객체 생성) | '1'이면 켬 | `5e.aiGraph.pictureEngine`('1'), `globalThis.__FIVE_E_AI_GRAPH_PICTURE__`(true) |
//
// 새 열쇠가 있으면 새 열쇠가 이긴다. 저장소를 읽지 못하면(사생활 보호 창 등) 기본값.
export const AI_ENGINE_FLAG_KEYS = Object.freeze({ figure: '5e.aiEngine.figure', graphPicture: '5e.aiEngine.graphPicture' });
export const AI_ENGINE_LEGACY_KEYS = Object.freeze({ figure: '5e.aiFigureEngine', graphPicture: '5e.aiGraph.pictureEngine' });

function read(storage, key) {
  try { const v = storage?.getItem?.(key); return v == null ? null : String(v); } catch { return null; }
}
function storageOf(scope) {
  if (scope && typeof scope.getItem === 'function') return scope; // 저장소를 바로 넘긴 경우
  try { return scope?.localStorage ?? null; } catch { return null; }
}

/** 그림 생성에 새 엔진을 쓸지. 기본 true. */
export function figureEngineFlag(scope = globalThis) {
  const g = scope && typeof scope.getItem !== 'function' ? scope.FIVE_E_AI_FIGURE_ENGINE : undefined;
  const storage = storageOf(scope);
  const now = read(storage, AI_ENGINE_FLAG_KEYS.figure);
  if (now === '0') return false;
  if (now === '1') return true;
  if (g === false) return false;
  if (g === true) return true;
  return read(storage, AI_ENGINE_LEGACY_KEYS.figure) !== '0';
}

/** 그래프 생성에서 「그림으로 생성」을 쓸 수 있는지(옵션). 기본 false. */
export function graphPictureFlag(scope = globalThis) {
  const g = scope && typeof scope.getItem !== 'function' ? scope.__FIVE_E_AI_GRAPH_PICTURE__ : undefined;
  const storage = storageOf(scope);
  const now = read(storage, AI_ENGINE_FLAG_KEYS.graphPicture);
  if (now === '1') return true;
  if (now === '0') return false;
  if (g === true) return true;
  return read(storage, AI_ENGINE_LEGACY_KEYS.graphPicture) === '1';
}

export function aiEngineFlags(scope = globalThis) {
  return { figure: figureEngineFlag(scope), graphPicture: graphPictureFlag(scope) };
}
