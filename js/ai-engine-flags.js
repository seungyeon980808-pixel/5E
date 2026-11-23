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
// | (앱 반영 후보 exp/1122-figure-candidate) 교사 그림이 있는 생성의 길 — 손그림만 새 엔진(짧은 명세), 레퍼런스·표현 참고는 옛 길(생성 2차 눈가림: 레퍼런스는 옛 길이 나음) | `5e.aiEngine.figureUserRefs` | **'sketch'**(첨부가 모두 손그림일 때만 새 엔진) | '0'이면 모두 옛 길(exam-brief), '1'이면 모두 새 엔진(고침 U1) | 없음 |
// | (실험 갈래 고침 E2) 빈 장면이 나오면 그 장면만 다시(같은 장면 글·참고 기출) | `5e.aiEngine.figureBlankSceneOnly` | **켜짐**(이 갈래만) | '0'이면 전체를 다시 그려 번호로 섞음(옛 길) | 없음 |
// ── 11-23 밤샘 실험 우승안(결과/create-3차-보고.md·conv-*.md) — 앱 반영 후보. 모두 기본 켬, '0'이면 그 항목만 지금(1.7.2) 동작으로 ──
// | 글로 그리기 G4: 구체화가 검색 조건까지 내고(분류 AI 없음) 고르기 AI 끔 + 안 시킨 이름·설명 글 안 붙임(대화 속 이름은 살림) | `5e.aiEngine.figureG4` | **켜짐** | '0'이면 분류·고르기 AI·이름 규칙 지금대로 | 없음 |
// | 화풍 못 박기(교사 말의 「모식도/일러스트」를 지시문 끝에) | `5e.aiEngine.figureStyleDirective` | **켜짐** | '0'이면 끔 | 없음 |
// | 여러 장면을 한 장에 그려 칸별로 자르고 AI 없이 2배 키움(2~5장면, 칸 수가 안 맞으면 장면마다 따로) | `5e.aiEngine.figureMultiCombined` | **켜짐** | '0'이면 장면마다 따로 그림 | 없음 |
// | 손그림 짧은 명세(손그림 → 12줄 이하 글 명세 → 명세 + 손그림 배치 안내로 그리기) | `5e.aiEngine.figureSketchSpec` | **켜짐**('4') | '0'이면 명세 없이 고침 U1 길(기출 1장) | 없음 |
// | 그림 고치기: 그리기 서버 오류로 앞 그림 그대로 끝나면 한 번 더 | `5e.aiEngine.figureEditRetryOnError` | **켜짐** | '0'이면 끔 | 없음 |
// | 흑백 뒤 흰 종이에 한 번 더 얹기(흑백 실패 때 투명 보험) | `5e.aiEngine.figureFlattenWhite` | **켜짐** | '0'이면 끔 | 없음 |
// | (1.7.3 ⑫) 그림 고치기: 고친 그림에서 바뀐 덩어리만 앞 그림에 붙임(나머지는 앞 그림 픽셀 — 연속 고치기 누적 변화 막기) | `5e.aiEngine.figureEditMerge` | **켜짐** | '0'이면 고친 그림 그대로(1.7.2) | 없음 |
// | 기출 그림 변환: 첫 그림 모델 Sol + 「동그라미 문자는 동그라미까지 지움」「화살촉 화살표는 남김」 두 줄 | `5e.aiEngine.convertExamSolCircled` | **켜짐** | '0'이면 Luna·두 줄 없음(1.7.2) | 없음 |
// | 교과서 그림 변환: 원본 윤곽 밑그림(AI 없이 뽑은 선화)을 두 번째 첨부로 | `5e.aiEngine.convertTextbookEdgeGuide` | **켜짐** | '0'이면 끔(1.7.2) | 없음 |
//
// 새 열쇠가 있으면 새 열쇠가 이긴다. 저장소를 읽지 못하면(사생활 보호 창 등) 기본값.
export const AI_ENGINE_FLAG_KEYS = Object.freeze({ figure: '5e.aiEngine.figure', graphPicture: '5e.aiEngine.graphPicture', figureImageModel: '5e.aiEngine.figureImageModel', figureSpeed: '5e.aiEngine.figureSpeed', figureLocalReplace: '5e.aiEngine.figureLocalReplace', figureSkipStripCheck: '5e.aiEngine.figureSkipStripCheck', figureUserRefs: '5e.aiEngine.figureUserRefs', figureBlankSceneOnly: '5e.aiEngine.figureBlankSceneOnly',
  figureG4: '5e.aiEngine.figureG4', figureStyleDirective: '5e.aiEngine.figureStyleDirective', figureMultiCombined: '5e.aiEngine.figureMultiCombined', figureSketchSpec: '5e.aiEngine.figureSketchSpec',
  figureEditRetryOnError: '5e.aiEngine.figureEditRetryOnError', figureFlattenWhite: '5e.aiEngine.figureFlattenWhite', figureEditMerge: '5e.aiEngine.figureEditMerge', convertExamSolCircled: '5e.aiEngine.convertExamSolCircled', convertTextbookEdgeGuide: '5e.aiEngine.convertTextbookEdgeGuide' });
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

/** 교사 그림이 있는 그림 생성의 길: 'sketch'(기본 — 첨부가 모두 손그림일 때만 새 엔진) · 'all'(고침 U1, '1') · 'off'('0', 모두 옛 길).
 *  생성 2차 눈가림: 레퍼런스 사진·그림은 옛 길 12장 모두 5점, 새 길 3.79(S5 달 위상 반대) → 레퍼런스는 옛 길. 손그림은 새 엔진 + 짧은 명세가 4.50 vs 옛 길 3.89. */
export function figureUserRefsMode(scope = globalThis) {
  const v = read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureUserRefs);
  if (v === '0') return 'off';
  if (v === '1' || v === 'all') return 'all';
  return 'sketch';
}
/** 옛 이름(호환): 교사 그림이 새 엔진으로 갈 수 있는지('off'가 아니면 true). */
export function figureUserRefsFlag(scope = globalThis) {
  return figureUserRefsMode(scope) !== 'off';
}
// 11-23 우승안 플래그: 기본 켬, '0'이면 끔.
const onUnlessZero = (key) => (scope = globalThis) => read(storageOf(scope), key) !== '0';
export const figureG4Flag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureG4);
export const figureStyleDirectiveFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureStyleDirective);
export const figureMultiCombinedFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureMultiCombined);
export const figureSketchSpecFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureSketchSpec);
export const figureEditRetryOnErrorFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureEditRetryOnError);
export const figureFlattenWhiteFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureFlattenWhite);
export const figureEditMergeFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.figureEditMerge);
export const convertExamSolCircledFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.convertExamSolCircled);
export const convertTextbookEdgeGuideFlag = onUnlessZero(AI_ENGINE_FLAG_KEYS.convertTextbookEdgeGuide);

/** 고침 E2: 빈 장면만 다시 그리기. 이 갈래 기본 true, '0'이면 전체 다시(옛 길). */
export function figureBlankSceneOnlyFlag(scope = globalThis) {
  return read(storageOf(scope), AI_ENGINE_FLAG_KEYS.figureBlankSceneOnly) !== '0';
}

export function aiEngineFlags(scope = globalThis) {
  return { figure: figureEngineFlag(scope), graphPicture: graphPictureFlag(scope), figureImageModel: figureImageModelFlag(scope), figureSpeed: figureSpeedFlag(scope), figureLocalReplace: figureLocalReplaceFlag(scope), figureSkipStripCheck: figureSkipStripCheckFlag(scope), figureUserRefs: figureUserRefsFlag(scope), figureBlankSceneOnly: figureBlankSceneOnlyFlag(scope) };
}

/** 11-23 우승안 플래그 한눈에(검사·보고용). aiEngineFlags와 나눠 둔다 — 옛 모양을 보는 검사가 그대로 돈다. */
export function aiWinnerFlags(scope = globalThis) {
  return { figureUserRefsMode: figureUserRefsMode(scope), figureG4: figureG4Flag(scope), figureStyleDirective: figureStyleDirectiveFlag(scope), figureMultiCombined: figureMultiCombinedFlag(scope), figureSketchSpec: figureSketchSpecFlag(scope),
    figureEditRetryOnError: figureEditRetryOnErrorFlag(scope), figureFlattenWhite: figureFlattenWhiteFlag(scope), figureEditMerge: figureEditMergeFlag(scope), convertExamSolCircled: convertExamSolCircledFlag(scope), convertTextbookEdgeGuide: convertTextbookEdgeGuideFlag(scope) };
}
