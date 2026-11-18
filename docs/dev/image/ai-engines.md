# 1.8.0 새 엔진 연결(그림 생성·그래프 그림)

엔진 계약은 image_generator `docs/5e-경계.md`를 따릅니다. 이 문서는 5E 안에서 **어디에 어떻게 붙였는지**만 적습니다.

## 파일

| 파일 | 역할 |
|---|---|
| `js/ai-figure/` | 그림 엔진(구체화 → 기출 3장 검색 → 그리기 → 설명 문장 지우기 → 흑백) |
| `js/ai-graph/` | 그래프 그림 엔진(설계 → 값 검사 → 정리 → 그리기) |
| `js/ai-engine-flags.js` | 두 엔진의 켜고 끄기(아래 표) — 한곳 |
| `js/ai-engines.js` | 5E 연결: 길 고르기, AI 연결 감싸기, 진행 글, 결과 meta. 엔진 모듈은 처음 쓸 때 `import()` |
| `js/ai-panel.js` | `runFigureEngineTurn`(이미지 생성), `runGraphPictureTurn`(그래프 생성 옵션) |

## 켜고 끄기

| 엔진 | 열쇠(localStorage) | 기본 | 옛 이름(계속 읽음) |
|---|---|---|---|
| 그림 생성 | `5e.aiEngine.figure` | 켜짐 · `'0'`이면 옛 생성 길 | `5e.aiFigureEngine`, `globalThis.FIVE_E_AI_FIGURE_ENGINE` |
| 그래프 「그림으로 생성」 | `5e.aiEngine.graphPicture` | 꺼짐 · `'1'`이면 켬 | `5e.aiGraph.pictureEngine`, `globalThis.__FIVE_E_AI_GRAPH_PICTURE__` |

새 열쇠가 옛 열쇠보다 앞섭니다. 미리보기(`/preview`) 길에서는 `channelStorage`라 앞에 `5e.preview:`가 붙습니다. 그래프 옵션을 고르는 화면은 아직 없어서 플래그가 곧 옵션입니다(작업마다 `tab.graphCreateEngine`: `'picture'|'objects'` 자리만 있음).

## 언제 새 엔진이 도는가

- **이미지 생성**(AI 이미지 → 생성, `image-create`): 설치판이고 플래그가 켜져 있고 사용자가 직접 넣은 레퍼런스가 없을 때. 웹은 지금 생성 길(연결만 있음, `engineAvailability().reason` = 「새 그림 엔진은 설치판에서 됩니다.」). 레퍼런스를 넣은 생성은 첨부를 그대로 쓰는 옛 길.
- **그래프 생성**(AI 그래프 → 대화로 만들기): 플래그가 켜졌을 때만. 웹이면 기본 그래프 객체 생성으로 만들고 기록에 설치판 안내를 남김.
- 설명으로 만드는 작업은 일괄 실행 대상이 아니라(`captureBatchTask`) 큐는 쓰지 않습니다.

## AI 연결

- 글: `desktop.readImageText`(main `codex:read-image-text`, 직접 호출). 취소 신호로 기다림을 끊음.
- 그림: `desktop.send({ purpose:'image', ephemeralRender:true })` → main `startDirectImageTurn`(`desktop/ai-direct-image.cjs`). 결과 이벤트는 전용 래스터 컨트롤러(`engineRaster`)가 받아 프라미스로. 그림 차례는 한 번에 하나.
- 모델: 그림은 AI 작업대에서 고른 모델 먼저, 실패하면 반대 모델(Luna↔Sol) 한 번. 글은 `gpt-6.1-sol`(목록에 없으면 고른 모델). 그래프는 `GRAPH_WORKBENCH_SELECTION.model`.

## 실패로 끝나지 않게

엔진 안 재시도(글 3·장면 2) → 그림은 반대 모델 → 한 장도 못 그리면 `submit('image', { legacyFigure:true })`로 옛 생성 길에 넘김. 앞 결과 카드는 지우지 않습니다. 그래프 그림이 실패하면 기본 그래프 객체 생성으로 이어 가고, 선택한 결과가 그림 그래프면 그것을 앞 결과로 넘겨 설계 실패 때 그대로 둡니다. 엔진이 단계마다 다시 시도하므로 전체 3분 제한과 「90초… 자동 재시도하지 않습니다」 안내는 이 길에서 끕니다.

## 결과 정보(`item.meta` → 캔버스 이미지 객체 `meta`)

- 그림: `{ figureEngine:'ai-figure', refs:[기출 id 3개], sceneIndex, sceneCount, strippedTexts, expanded, models, request }`. 장면이 둘이면 결과 카드도 둘.
- 그래프 그림: `{ graphEngine:'ai-graph-picture', graphPlan, graphVerified, request, collisions, fallback }`. `redrawGraphPicture(meta)`는 AI 없이 같은 그림을 다시 그립니다.
- `snapshotImageItem`이 `meta`를 지키고(작업 저장·다시 열기), `materializeCandidate` → `insertImageFromSrc`가 캔버스 객체로 옮깁니다.

## 검사

- 단위: `tests/test-ai-engines-connect.mjs`
- 브라우저(크롬·웹킷, 가짜 설치판 연결): `tests/test-ai-engines-connect-browser.cjs` — 그래프 기본 길 그대로, 그림 생성 → 캔버스 meta, 실패 → 앞 결과 유지, 그래프 그림 → 다시 열기 → 다시 그리기
