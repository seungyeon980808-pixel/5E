# 평가원 기출(수능·모평) 과탐 시험지 더하기

2027학년도 수능(2026-11-19 시행) 8과목을 넣으면서 정리한 순서다(11-19). 다음 6·9월 모평·수능도 같은 순서로 넣는다.
평가원 기출은 라이브러리·exam 두 길로 들어가므로 아래 일곱 곳을 모두 바꿔야 한다.

| 무엇 | 어디 | 만드는 도구 |
|---|---|---|
| ① 공유 자료 묶음(문서 목록·검색 색인·형광 낱말 위치·그림 후보) | 드라이브 `5E_공유폴더테스트_0916`의 `pack.json`·`checksums.json`·`catalog.json`·`search-index.json` + PDF `기출문제/<과목>/<파일>` → 정적 거울 `5e-exam-pdf/v1/` | `tools/pdf-library/extend-pack.mjs` |
| ② 시작용 목록 | `assets/pdf-library/catalog-bootstrap.json`, `js/pdf-library/catalog-bootstrap.js` | `LIBRARY_PACK_DIR=… node scripts/build-library-catalog-bootstrap.mjs` |
| ③ 쪽 미리보기 | `assets/pdf-library/previews/<PDF sha>/` + `manifest.js` → `5e-images/previews/` | `tools/pdf-library/build-page-previews.py` |
| ④ exam 기출 색인 | `assets/exampool/convert/data/<과목>.json`·`index.json` | `tools/kice-add/add_exam.py` |
| ⑤ 정답(정답 형광) | `assets/exampool/answers/science-answers.json` | `tools/kice-add/add_exam.py` |
| ⑥ 단원·태그 작은 색인 | `assets/exampool/convert/data/library-tags.json` | `node scripts/build-library-tags.mjs` |
| ⑦ 카드 그림 | exam-search 저장소 `cards/<id>.webp`(github.io) | exam-search `build_static.py`와 같은 방식 |
| ⑧ 「변형」 미리 변환 | `data/exam-pdf/q-kice/<id>.json` → `5e-exam-pdf/q/` | `data/exam-pdf/preconvert.cjs` |

## 순서

```bash
# 0. 평가원 공개 페이지에서 문제지·정답표 PDF를 새 빈 폴더에 받는다: <받은 폴더>/p1_2027_11.pdf, p1_2027_11_answer.pdf …
#    (2027 수능: https://cdn.kice.re.kr/27dae-suneung/27DaeSuneung_43_N.pdf, N=1 물Ⅰ 2 화Ⅰ 3 생Ⅰ 4 지Ⅰ 5 물Ⅱ 6 화Ⅱ 7 생Ⅱ 8 지Ⅱ, 정답은 …_43_Na.pdf)

# 1. 공유 자료 묶음 늘리기(기존 드라이브 폴더는 읽기만, 결과는 새 폴더)
node tools/pdf-library/extend-pack.mjs --pack "<드라이브 공유 폴더>" --spec spec.json --output <새 묶음 폴더>
#    spec.json: {"version":"1.2.0","documents":[{"source":"…/p1_2027_11.pdf","destination":"기출문제/물리1/p1_2027_11.pdf","id":"kice-p1_2027_11"}, …]}

# 2. 시작용 목록
LIBRARY_PACK_DIR=<새 묶음 폴더> node scripts/build-library-catalog-bootstrap.mjs

# 3. 쪽 미리보기(cwebp 필요)
python3 -I tools/pdf-library/build-page-previews.py <받은 폴더>/{p1,p2,c1,c2,b1,b2,e1,e2}_2027_11.pdf

# 4~5. exam 기출 색인·정답
python3 -I tools/kice-add/add_exam.py --pdf-dir <받은 폴더> --pack <새 묶음 폴더> --year 2027 --month 11

# 6. 단원·태그 색인
node scripts/build-library-tags.mjs

# 7. 「변형」 미리 변환(새 문항만)
EXAM_PDF_ROOT=<새 묶음 폴더> node data/exam-pdf/preconvert.cjs --only=_2027_11
```

## 검색 색인 나눠 받기 (11-20부터)

앱은 JSON 파일 하나를 32MiB(33,554,432바이트)까지만 받는다(`js/pdf-library/remote-pack.js` `MAX_JSON_BYTES`).
첫 색인 `search-index.json`은 2027 수능까지 넣고 33,180,641바이트라 더 넣을 수 없다(11-19에 줄 상자를 소수 셋째 자리로 줄여 맞춤).
그래서 1.7.2부터 색인을 나눠 받는다(`js/pdf-library/search-index-parts.js`).

- 첫 색인 `search-index.json`은 **바이트 그대로 둔다.** 1.7.1 이하 앱은 이것만 읽는다(조각에 든 시험만 본문 검색에 안 나오고, 목록·미리보기는 된다).
- 새 시험의 항목은 조각 `search-index-2.json`, `search-index-3.json` …에 넣는다. 조각 목록은 `search-index-parts.json`
  (`{"schemaVersion":"pdf-search-index-parts-v1","parts":["search-index-2.json"]}`)이고, 셋 다 `checksums.json`에 해시를 적는다.
  `pack.json` 모양은 그대로다(옛 앱 pack-store가 정해진 칸만 남겨 해시를 맞추므로 칸을 더하면 안 된다).
- 32MiB 한도는 조각마다다. `extend-pack.mjs`가 마지막 조각에 들어가면 거기에, 넘치면 새 조각을 만든다. 시험 하나는 약 67만 바이트.
- 정적 거울(`data/exam-pdf/build-site.mjs`)은 색인 파일마다 `<이름>.parts.json` + `<이름>.part<n>`(16MB)으로 올린다.
- 2027 9월 모평(11-20)이 첫 조각 `search-index-2.json`(671,204바이트)에 들어갔다.

## 자동으로 채운 것 · 확인한 것

- 문항 상자: 번호 글자 위 −5.7pt ~ 같은 단 다음 번호 −5.7pt(단의 마지막이면 1140pt), 좌우는 단 경계. 기존 2024~2027 640문항 중 628개가 소수 둘째 자리까지 같다.
- 묶음 색인: 옛 `build-pack.mjs`와 같은 앱 코드로 만든다. 기존 2027 6평·2026 수능을 다시 만들어 보면 본문·문항 영역·그림 후보는 같고, 줄 상자 합치기만 소수점 차이.
- 단원·태그: 같은 과목 기존 문항에서 빌려 온 추정(2026 수능으로 시험해 재현율 0.88·정밀도 0.57).
- 정답: 평가원 정답표 PDF에서 읽는다(번호·정답·배점 세 개씩). 20개를 다 못 읽으면 멈춘다.

## 올리기 (사용자 승인 뒤에만)

1. 드라이브: 새 PDF 8개를 `기출문제/<과목>/`에 넣고, 바뀐 묶음 파일(pack·checksums·catalog·조각 색인·조각 목록)을 새것으로 바꾼다(옛것은 보관 폴더로). 첫 색인은 바뀌지 않는다.
2. 정적 거울 `5e-exam-pdf`: `data/exam-pdf/build-site.mjs` → `npx wrangler@4 deploy --config cloudflare/exam-pdf/wrangler.jsonc`.
   **이 Worker는 올릴 때 파일 전체를 바꾼다.** `data/exam-pdf/q-kice/`에 기존 미리 변환(11-20 기준 8,707개)이 같이 있어야 지워지지 않는다.
3. 그림 Worker `5e-images`: `node data/images/build-bundle.mjs` → `npx wrangler@4 deploy --config cloudflare/images/wrangler.jsonc`.
4. 카드: exam-search 저장소에 `cards/*_2027_11_*.webp`를 커밋·푸시(github.io).
5. 웹 배포(이 갈래를 합친 뒤).
