// 1.8.0 새 엔진 옵션 플래그(한곳). 화면에 고르는 자리가 생기기 전까지는 이 값으로만 켜고 끈다.
//
// | 엔진 | 저장 열쇠(localStorage) | 기본 | 끄기/켜기 | 옛 이름(계속 읽음) |
// |---|---|---|---|---|
// | 그림 생성(js/ai-figure) | `5e.aiEngine.figure` | **켜짐**(11-19 사용자 결정: 이미지 생성은 새 엔진으로 대체) | '0'이면 끔(옛 생성 길) | `5e.aiFigureEngine`('0' 끔·'1' 켬), `globalThis.FIVE_E_AI_FIGURE_ENGINE`(true/false) |
// | 그래프 「그림으로 생성」(js/ai-graph) | `5e.aiEngine.graphPicture` | **꺼짐**(기본은 지금의 그래프 객체 생성) | '1'이면 켬 | `5e.aiGraph.pictureEngine`('1'), `globalThis.__FIVE_E_AI_GRAPH_PICTURE__`(true) |
// | 그림 생성의 그림 모델 | `5e.aiEngine.figureImageModel` | **luna**(gpt-6-luna, 원본 image_generator와 같음 — 11-19 사용자 결정) | 'sol'이면 gpt-6.1-sol로 그림 | 없음 |
// | 그림 생성 빠르게(GENSPEED 11-20: 검색을 구체화와 나란히, 글자만 지우는 고침은 다시 그리지 않음) | `5e.aiEngine.figureSpeed` | **켜짐** | '0'이면 끔(11-19 길) | 없음 |
// | 설명 문장 지우기 확인 건너뛰기(밤샘 파트1 11-21: 품질 같음 52/64 대 51/64, 한 장 3~11초 절약, 1.7.2 기본 켬 — (가)(나)는 지시문에서 아예 안 그리게 함) | `5e.aiEngine.figureSkipStripCheck` | **켜짐** | '0'이면 확인함 | 없음 |
// | 글자 바꾸기 고침도 다시 그리지 않음(새 글자를 5E 글꼴로 그려 넣음 — 글꼴이 그림과 달라 보일 수 있음) | `5e.aiEngine.figureLocalReplace` | **꺼짐** | '1'이면 켬 | 없음 |
//
// 새 열쇠가 있으면 새 열쇠가 이긴다. 저장소를 읽지 못하면(사생활 보호 창 등) 기본값.
export const AI_ENGINE_FLAG_KEYS = Object.freeze({ figure: '5e.aiEngine.figure', graphPicture: '5e.aiEngine.graphPicture', figureImageModel: '5e.aiEngine.figureImageModel', figureSpeed: '5e.aiEngine.figureSpeed', figureLocalReplace: '5e.aiEngine.figureLocalReplace', figureSkipStripCheck: '5e.aiEngine.figureSkipStripCheck' });
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

/** 그림 생성 엔진이 그림을 그릴 모델 선택. 기본 'luna'(원본과 같음, Sol보다 한 장에 약 13초 빠름 — FIGGAP 11-19). 'sol'이면 Sol. */
export const FIGURE_IMAGE_MODEL_CHOICES = Object.freeze({ luna: 'gpt-6-luna', sol: 'gpt-6.1-sol' });
export function figureImageModelFlag(scope = globalThis) {
  const v = read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureImageModel);
  return v === 'sol' || v === FIGURE_IMAGE_MODEL_CHOICES.sol ? 'sol' : 'luna';
}

/** 그림 생성 빠르게(GENSPEED). 기본 true, '0'이면 11-19 길(차례 검색·고침은 늘 다시 그림). */
export function figureSpeedFlag(scope = globalThis) {
  return read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureSpeed) !== '0';
}

/** 글자 「바꾸기」 고침도 로컬로(GENSPEED). 기본 false — 새 글자 글꼴이 그림 글꼴과 달라 심사에서 「5분 손질」이 늘었음(11-20). */
export function figureLocalReplaceFlag(scope = globalThis) {
  return read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureLocalReplace) === '1';
}

/** 그림 생성 뒤 「설명 문장 지우기」 확인(글 AI 한 번, 찾으면 그림 다시 그리기)을 건너뛸지. 1.7.2 기본 true('0'이면 확인).
 *  밤샘 파트1 11-21: 흰 바탕 섞어 두 번 채점 52/64(확인) 대 51/64(건너뜀), 그림 안 설명 문장 지적 둘 다 0. 171건 중 찾은 것 2건. */
export function figureSkipStripCheckFlag(scope = globalThis) {
  return read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureSkipStripCheck) !== '0';
}

export function aiEngineFlags(scope = globalThis) {
  return { figure: figureEngineFlag(scope), graphPicture: graphPictureFlag(scope), figureImageModel: figureImageModelFlag(scope), figureSpeed: figureSpeedFlag(scope), figureLocalReplace: figureLocalReplaceFlag(scope), figureSkipStripCheck: figureSkipStripCheckFlag(scope) };
}
