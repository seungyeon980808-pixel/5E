# 기출 조판 눈 검사 도구 (10-25)

기출 PDF → 5E 문항 → 한글 조판 결과를 **원본과 눈으로 비교**하는 도구입니다.
기준은 「눈으로 봤을 때 이상하지 않을 것」이고, 픽셀 단위 일치는 쫓지 않습니다.

모든 도구는 저장소 루트에서 실행합니다. 원본 PDF 폴더는 `KICE_PDF_ROOT` 환경 변수로 바꿀 수 있습니다(기본: 구글 드라이브 5E_공유폴더테스트_0916).

## 흐름

```bash
# 1) 변환 (문항 JSON → _work/kice/<이름>/shots/*.json)
node tools/kice-convert/run.cjs --ids $(cat tools/kice-convert/visual/ids-new32.txt) --convert-only --workers 2 --out _work/kice/new32

# 2) 원본 자르기 (PDF 문항 영역을 3배로, 위아래 6pt 여유)
node tools/kice-convert/visual/origshots.cjs $(cat tools/kice-convert/visual/ids-new32.txt) /tmp/orig

# 3) 우리 카드 찍기 (사파리 엔진 webkit, 10문항 이하씩 — 목록이 쪽으로 나뉨)
node tools/kice-convert/visual/cardshots.cjs _work/kice/new32/shots /tmp/ours

# 4) 원본·우리 나란히 모아 보기 (한 장에 4문항)
node tools/kice-convert/visual/grid.cjs /tmp/orig /tmp/ours /tmp/grid 4
```

## 도구

| 파일 | 하는 일 |
|---|---|
| `origshots.cjs` | 원본 PDF 문항 영역 PNG (원본 사진 좌표 = (pt − (box − 6)) × 3) |
| `cardshots.cjs` | 변환 문항을 시험지에 담아 카드 미리보기를 webkit으로 찍음 |
| `grid.cjs` | 원본·우리 짝을 한 장에 모음 |
| `orignum.cjs` | 원본 문항 번호 글자의 왼쪽 x·기준선 (겹쳐 보기 맞춤점) |
| `overlay.cjs` | 원본(파랑) 위에 우리(빨강)를 같은 배율로 겹침. 겹치면 검정. 엔진 SVG를 빈 페이지에 3배로 그려 찍는다 |
| `choicepos.cjs` / `choicecheck.cjs` | 원본 PDF·우리 엔진의 선지 ①~⑤ 좌표 (선지 배열 비교) |
| `origwords.cjs` | 원본 PDF 글 조각(글자·x·폭·글자 크기) — 글자 폭·줄 간격 실측 |
| `runs-dump.cjs` | 우리 엔진 줄 조각 좌표·표 위치 (줄 나눔·겹침 디버그) |
| `measure-symbols.cjs` / `measure-spacing.cjs` | 우리 폭 재기 대 엔진 실제 폭, 자간 % 효과 실측 |
| `ids-62.txt` / `ids-new32.txt` | 10-25 검사 문항(62 = 조판 맞춘 문항, 32 = 처음 보는 과적합 시험) |

## 10-25에 확인된 엔진 사실 (조판 코드에 반영됨)

- 원본 PDF 쪽은 A3(842×1191pt) — 시험지 B4를 1.156배. 우리 B4 틀은 이 PDF 배율과 같다: 본문 11.5pt·장평 95%·자간 −3%·줄 간격 145%(16.65pt).
- 한글 엔진의 장평·자간은 기호·문장 부호·띄어쓰기까지 모든 글자에 걸린다(실제 = 잰 값 × 0.92).
- 자간 %는 글자마다 자기 폭 기준(줄어드는 폭 ≈ c% × 줄 폭).
- 칸 안에서 넘친 줄은 엔진이 눌러 담지 않고 다시 나눈다 — 넘칠 땐 자간 좁힘 표시(글자색 #0A0BNN → normalizeQuestionImport가 자간으로)를 건다.
- 표는 들여오면 바깥 여백(283단위×2 = 7.55px)만큼 좁아졌다가 widenTablesByMargins가 되돌린다 → 칸 안 글 폭에 더해야 한다(TABLE_OUT).
- 칸 안 그림은 문단 기준 위치만 되고 음수·종이 기준 위치는 안 된다.
- 폭 없는 글자 U+2060은 글자 크기대로 13px로 그려진다 → 1pt 글자로 넣는다.
