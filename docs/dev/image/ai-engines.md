# 1.7.2 새 엔진 연결(그림 생성·그래프 그림)

> 처음엔 「1.8.0」으로 부르던 작업입니다. 화면 변화 없는 엔진 교체라 1.7.2로 냅니다(11-19 결정).

엔진 계약은 image_generator `docs/5e-경계.md`를 따릅니다. 이 문서는 5E 안에서 **어디에 어떻게 붙였는지**만 적습니다.

## 파일

| 파일 | 역할 |
|---|---|
| `js/ai-figure/` | 그림 엔진(구체화 → 기출 3장 검색 → 그리기 → 설명 문장 지우기 → 흑백) |
| `js/ai-graph/` | 그래프 그림 엔진(설계 → 값 검사 → 정리 → 그리기) |
| `js/ai-engine-flags.js` | 두 엔진의 켜고 끄기(아래 표) — 한곳 |
| `js/ai-engines.js` | 5E 연결: 길 고르기, AI 연결 감싸기, 진행 글, 결과 meta. 엔진 모듈은 처음 쓸 때 `import()` |
| `js/ai-panel.js` | `runFigureEngineTurn`(이미지 생성), `runGraphPictureTurn`(그래프 생성 옵션) |
| `assets/ai-figure/` | 기출 그림 색인 `tags.jsonl`(평가원)·`tags-hak.jsonl`(학평)·`taxonomy.json`, 약 7MB. 그림 자체는 없고 id·과목·종류·태그·한 줄 설명만. 다시 만들기·검사는 `data/ai-figure/build-index.mjs`(`--check`) |
| `assets/ai-graph/` | 과목별 그래프 관례 `conventions.json`, 그리기 판 스타일 `graph-stage.css` |
| `vendor/katex/` | KaTeX 0.16.11(앱에 넣음 — 인터넷 없이 수식). 그래프 그리기(`js/ai-graph/draw.js`)만 씀 |

참고 기출 그림은 앱에 싣지 않고 기출 Worker(`js/library/image-hosts.js`의 `EXAM_QUESTION_HOSTS`)에서 문항 JSON으로 받습니다. 평가원·학평은 색인 줄의 `src`로 가리고, 모르면 평가원 → 학평 순. 최근 24개 캐시.

## 처음 쓸 때만 불러오기

엔진 모듈·색인·KaTeX는 첫 화면에서 받지 않습니다. `js/ai-engines.js`만 앱에 정적으로 들어가고, `loadFigureEngine`·`loadGraphEngine`이 처음 쓸 때 `import()`합니다. 색인은 엔진이 `loadFigureIndex`로(캐시), KaTeX는 그래프 그리기 때 받습니다. `tests/test-ai-engines-lazy-load.mjs`가 앱 코드의 정적 import·`<script>`·`<link>`·시작 로딩(`js/main.js`)의 미리 준비 단계에 이것들이 들어가면 실패시킵니다.

## 켜고 끄기

| 엔진 | 열쇠(localStorage) | 기본 | 옛 이름(계속 읽음) |
|---|---|---|---|
| 그림 생성 | `5e.aiEngine.figure` | 켜짐 · `'0'`이면 옛 생성 길 | `5e.aiFigureEngine`, `globalThis.FIVE_E_AI_FIGURE_ENGINE` |
| 그래프 「그림으로 생성」 | `5e.aiEngine.graphPicture` | 꺼짐 · `'1'`이면 켬 | `5e.aiGraph.pictureEngine`, `globalThis.__FIVE_E_AI_GRAPH_PICTURE__` |
| 그림 생성의 그림 모델 | `5e.aiEngine.figureImageModel` | `luna`(gpt-6-luna) · `'sol'`이면 gpt-6.1-sol | 없음 |

새 열쇠가 옛 열쇠보다 앞섭니다. 미리보기(`/preview`) 길에서는 `channelStorage`라 앞에 `5e.preview:`가 붙습니다. 그래프 옵션을 고르는 화면은 아직 없어서 플래그가 곧 옵션입니다(작업마다 `tab.graphCreateEngine`: `'picture'|'objects'` 자리만 있음).

## 언제 새 엔진이 도는가

- **이미지 생성**(AI 이미지 → 생성, `image-create`): 설치판이고 플래그가 켜져 있고 사용자가 직접 넣은 레퍼런스가 없을 때. 웹은 지금 생성 길(연결만 있음, `engineAvailability().reason` = 「새 그림 엔진은 설치판에서 됩니다.」). 레퍼런스를 넣은 생성은 첨부를 그대로 쓰는 옛 길.
- **그래프 생성**(AI 그래프 → 대화로 만들기): 플래그가 켜졌을 때만. 웹이면 기본 그래프 객체 생성으로 만들고 기록에 설치판 안내를 남김.
- 설명으로 만드는 작업은 일괄 실행 대상이 아니라(`captureBatchTask`) 큐는 쓰지 않습니다.

## AI 연결

- 글: `desktop.readImageText`(main `codex:read-image-text`, 직접 호출). 취소 신호로 기다림을 끊음.
- 그림: `desktop.send({ purpose:'image', ephemeralRender:true })` → main `startDirectImageTurn`(`desktop/ai-direct-image.cjs`). 결과 이벤트는 전용 래스터 컨트롤러(`engineRaster`)가 받아 프라미스로. 그림 차례는 한 번에 하나.
- 모델: 그림은 기본 `ENGINE_IMAGE_MODEL` = `gpt-6-luna`(원본 image_generator와 같음), 옵션 `5e.aiEngine.figureImageModel`='sol'이면 `gpt-6.1-sol`(`engineModels`·`figureImageModelFlag`). 작업대에서 고른 대화 모델은 따르지 않습니다(11-19 사용자 결정 — 앞서는 따라가서 설치판이 기본 선택 Sol로 그렸고, 한 장에 약 13초 더 걸렸음, FIGGAP). 실패하면 반대 모델(Luna↔Sol) 한 번(`imageModelOrder`). 글은 `ENGINE_TEXT_MODEL` = `gpt-6.1-sol`(목록에 없으면 고른 모델), 거절(400)이면 다음 글 모델. 그래프는 `GRAPH_WORKBENCH_SELECTION.model`.
- 재시도 수: 5E가 엔진에 넘기는 값은 글 3·그림 1·장면 2(`runFigureEngine`). 그림 한 차례 안의 재시도는 반대 모델이 맡습니다.
- 차례 시계: 그림·글 차례마다 240초(`ENGINE_IMAGE_DEADLINE_MS`·`ENGINE_TEXT_DEADLINE_MS`, `js/ai-engines.js`). main 쪽 한도(한 번 100초 + 다시 1번)보다 길게 두어, main이 끝을 알리지 못했을 때만 화면 쪽이 끊습니다. 검사는 `globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS`·`__FIVE_E_ENGINE_TEXT_DEADLINE_MS`로 줄입니다.

## 실패로 끝나지 않게

순서: 엔진 안 재시도(글 3·장면 2) → 그림은 반대 모델 → 글이 계속 안 되면 글 단계를 건너뛰고 요청 그대로·참고 그림 없이 → 한 장도 못 그리면 `submit('image', { legacyFigure:true })`로 옛 생성 길에 넘김. 앞 결과 카드는 지우지 않습니다. 그래프 그림이 실패하면 기본 그래프 객체 생성으로 이어 가고, 선택한 결과가 그림 그래프면 그것을 앞 결과로 넘겨 설계 실패 때 그대로 둡니다. 엔진이 단계마다 다시 시도하므로 전체 3분 제한과 「90초… 자동 재시도하지 않습니다」 안내는 이 길에서 끕니다.

### 고장별 길(E9, 11-19)

| 고장 | 길 |
|---|---|
| AI 글 읽기 시간 초과·429·5xx | main(`ai-direct-image.cjs`)이 이미 두 번 더 시도함 → 같은 차례에서 두 번 이어지면 글 단계(구체화·검색·설명 찾기)는 건너뛰고(`health.textDown`) 요청 그대로·참고 그림 없이 그림 |
| 깨진 JSON·빈 응답 | 단계마다 대체(요청 한 장면·점수 고르기·지우기 전 그림) |
| 분류 AI 실패·JSON 깨짐 | `roughClassify`로 요청 낱말에서 검색어를 대강 뽑아 점수로 참고 그림을 고름(원본 image_generator와 같게) |
| 기출 문항 JSON의 그림이 PNG·JPEG·WebP·GIF base64가 아니거나 8MB(글자 수, `MAX_REFERENCE_DATA_URL_CHARS`) 넘음 | 「그림 없음」으로 보고 다음 후보 |
| 글 모델 거절(400) | 다음 글 모델(고른 모델 → Luna/Sol)로 한 번 더 |
| 그림 모델 실패 | 반대 모델 → 장면 재시도 → 옛 생성 길 |
| 기출 Worker 404·너무 큼 | 그 그림만 건너뛰고 다른 후보, 없으면 참고 그림 없이 |
| 기출 Worker 응답 없음 | 한 문항 15초 제한(`REFERENCE_FETCH_TIMEOUT_MS`), 넘으면 남은 후보는 묻지 않고 참고 그림 없이 |
| 연결 끊김(글·그림 모두 연결 실패) | 옛 길도 같은 연결이라 넘기지 않음 → 「인터넷 연결을 확인해 주세요」, 앞 결과·입력 유지, `online` 되면 한 번 이어서 |
| Codex 로그인 없음(시작 전 `desktop.status()`) 또는 실행 중 만료 | AI를 더 부르지 않고 「연결 정보」 창을 띄워 「Codex 로그인」으로 데려감 → 로그인되면 같은 요청으로 이어서 |
| 취소 | 그 차례만 멈춤·옛 길로 넘기지 않음, 다음 차례는 새로 시작(앞 취소 표시를 지움) |
| 그림 차례·글 읽기가 끝을 알리지 않음(E9b) | 화면 쪽 차례 시계(`ENGINE_IMAGE_DEADLINE_MS`·`ENGINE_TEXT_DEADLINE_MS` = 240초, main 한도 100초×2보다 김)로 끊음 — 그림은 interrupt 뒤 반대 모델, 두 차례 연달아 답이 없으면 `health.imageDown`으로 장면 재시도 없이 옛 길; 글은 transport로 세어 `textDown` |
| 엔진 모듈(`ai-figure/index.js`·`ai-graph/index.js`·`draw.js`)을 못 받음(E9b) | 이번에는 옛 길·기본 생성으로. 브라우저가 실패한 import를 주소별로 기억하므로 다음 차례에는 `&retry=N` 주소로 다시 받음 |

### 그래프 「그림으로 생성」 고장별 길(E9b, 11-19)

| 고장 | 길 |
|---|---|
| 시작 전 Codex 로그인 없음·실행 중 만료 | AI를 부르지 않고(또는 더 부르지 않고) 「연결 정보」 창 → 로그인하면 같은 요청으로 이어서(`guideDesktopLogin`) |
| 인터넷 끊김 | 기본 생성으로 넘기지 않음 → 「인터넷 연결을 확인해 주세요」, `online`이 되면 한 번 이어서 |
| 설계 AI 시간 초과·429·5xx·답 없음 / 설계 JSON이 깨짐·축 범위 없음·곡선 없음 | 엔진은 축만 그린 설계(`minimal`)를 내지만 패널은 그것으로 끝내지 않고 **기본 그래프 객체 생성**으로. 기본 생성도 실패하면 축만 그린 그림을 결과로(실패로 끝나지 않음) |
| 고른 결과가 그림 그래프인데 설계 실패(엔진 `previous`) | 기본 생성으로 새로 만들고, 그것도 실패하면 앞 결과 그대로(경고) |
| 값 검사 AI 실패·엉뚱한 답 | 받은 설계 그대로 그림(결과 확인에 경고) |
| 글 모델 거절(400) | 다른 글 모델로 한 번 더 |
| 글자 겹침이 남음 | 그림은 넣고 결과 확인에 `GRAPH_PICTURE_LABEL_OVERLAP`(major), 상태 글 「글자 겹침 n곳」 |
| KaTeX·수식 글꼴을 못 받음 | 수식 없이(대체 글꼴로) 그리고 상태 글로 알림. 다음 그리기에서 KaTeX·판 스타일을 다시 받음(실패를 붙들지 않음) |
| 엔진·그리기 모듈을 못 받음 | 기본 생성으로, 다음 차례에는 다시 받아 그림으로 |
| 취소 | 「그래프 생성 취소됨 · 이전 결과 유지」, 다음 차례는 새로 |
| 저장된 `meta.graphPlan`으로 다시 그리기 | AI·연결 없이 그림. 망가진 설계면 축만 그린 그림(`minimal`) |

IPC를 건너온 오류는 code가 사라지므로 `classifyAiError`가 글로 가릅니다(auth·network·transport·model·other). 검사: `tests/test-ai-engines-faults.mjs`(단위), `tests/test-ai-engines-faults-browser.cjs`(크롬·웹킷, 그림 고장 25가지 + 동시성), `tests/test-ai-engines-faults-graph-browser.cjs`(크롬·웹킷, 그래프 그림 고장 25가지 + 다시 그리기 3가지).

## 결과 정보(`item.meta` → 캔버스 이미지 객체 `meta`)

- 그림: `{ figureEngine:'ai-figure', refs:[기출 id 3개], sceneIndex, sceneCount, strippedTexts, expanded, models, request }`. 장면이 둘이면 결과 카드도 둘.
- 그래프 그림: `{ graphEngine:'ai-graph-picture', graphPlan, graphVerified, request, collisions, fallback }`. `redrawGraphPicture(meta)`는 AI 없이 같은 그림을 다시 그립니다.
- `snapshotImageItem`이 `meta`를 지키고(작업 저장·다시 열기), `materializeCandidate` → `insertImageFromSrc`가 캔버스 객체로 옮깁니다.

## 검사

- 단위: `tests/test-ai-engines-connect.mjs`(연결), `tests/test-ai-figure-engine.mjs`(그림 엔진·지시문 해시·점수), `tests/test-ai-graph-engine.mjs`(그래프 설계·검사), `tests/test-ai-engines-faults.mjs`(고장), `tests/test-ai-engines-lazy-load.mjs`(첫 화면에 안 실림)
- 브라우저: `tests/test-ai-graph-draw-browser.cjs`(고정 설계 그리기·겹침), `tests/test-ai-graph-task-transfer-browser.cjs`, 고장 검사 두 개(위)
- 브라우저(크롬·웹킷, 가짜 설치판 연결): `tests/test-ai-engines-connect-browser.cjs` — 그래프 기본 길 그대로, 그림 생성 → 캔버스 meta, 실패 → 앞 결과 유지, 그래프 그림 → 다시 열기 → 다시 그리기
