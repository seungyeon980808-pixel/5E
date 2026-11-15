<p align="center">
  <img src="assets/icon-192.png" alt="5E" width="96" height="96">
</p>

<h1 align="center">5E</h1>

<p align="center">
  <b>과학 교육을 위한 평가 문항 편집기</b><br>
  <i>sciEnce Educational Evaluation Exam Editor</i>
</p>

<p align="center">
  그림을 다듬고, 문항을 쓰고, 학교 시험지로 묶어 한글로 인쇄하기까지.<br>
  과학 교사의 출제를 한 흐름으로 잇습니다.
</p>

<p align="center">
  <a href="https://www.5e.ai.kr/"><b>웹에서 시작하기</b></a> ·
  <a href="https://github.com/seungyeon980808-pixel/5E/releases/latest"><b>설치판 내려받기</b></a> ·
  <a href="docs/RELEASE_NOTES_v1.7.0.md">1.7.0 변경 내용</a> ·
  <a href="https://www.5e.ai.kr/bug/">문제 신고</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.7.0-3f3f46?style=flat-square&labelColor=18181b" alt="version 1.7.0">
  <img src="https://img.shields.io/badge/web%20·%20Windows%20·%20Mac-3f3f46?style=flat-square&labelColor=18181b" alt="web, Windows, Mac">
  <img src="https://img.shields.io/github/license/seungyeon980808-pixel/5E?style=flat-square&labelColor=18181b&color=3f3f46" alt="AGPL-3.0">
</p>

---

## 교사의 도구

학교 시험은 문제를 많이 만드는 일이 아니라, 성취기준 안에서 근거를 남기며 한 부를 바르게 만드는 일입니다.
5E는 그 과정에 필요한 일 — 그림 준비, 문항 쓰기, 근거 연결, 시험지 배치, 한글 조판, 인쇄 전 점검 — 을 세 개의 프로그램으로 나누어 한 흐름으로 잇습니다.

| | 하는 일 |
|---|---|
| **5E_image** | 교과서·기출 그림을 평가원식 흑백 선화로 바꾸고, 라벨을 붙이고, 그래프를 복원합니다. |
| **5E_exam** | 문항 카드로 문항을 쓰고, 기출을 찾아 변형하고, 학교 양식으로 시험지를 묶습니다. |
| **5E_hwp** | 한글 파일을 열어 다듬고, 점검하고, 정답표·분류표·학생용 사본과 함께 인쇄합니다. |

맨 위 이름 줄로 세 프로그램을 오가고, 세 프로그램이 함께 쓰는 **5E 클립보드**(⌘C · ⌘V · ⇧⌘V)로 그림·그래프·표를 옮깁니다.

## 출제 흐름

**1 · 찾기** — 라이브러리에서 평가원·학평·교과서 자료를 과목, 단원, 연도, 낱말로 찾습니다. 문항은 정답 선지 형광펜과 함께 보이고, 별표로 모아 둡니다.

**2 · 그리기** — 필요한 그림을 잘라 AI로 시험용 선화로 바꿉니다. 원본의 글자는 고칠 수 있는 라벨로 제자리에 다시 얹힙니다.

**3 · 쓰기** — 유형과 자료 구조를 고르면 평가원 문항 틀이 열립니다. 카드에 쓰는 대로 옆에 실제 한글 조판이 그려집니다.

**4 · 묶기** — 학교 원안지 양식을 고르면 문항이 실제 한글 쪽에 배치됩니다. 순서와 여백을 정하고 배점·정답 분포를 점검합니다.

**5 · 인쇄** — 5E_hwp에서 마지막으로 다듬고 인쇄 전 점검을 거쳐 PDF·HWPX로 저장합니다.

## 기능

<details open>
<summary><b>5E_image — 시험용 그림</b></summary>

- **AI 작업대** — 이미지 변환 · 이미지 생성 · 그래프 복원 · 그래프 생성을 한 창에서. 여러 작업을 걸어 두면 끝날 때 알려 줍니다.
- **라벨 복원** — 원본 글자를 크기·위치 그대로 고칠 수 있는 라벨로. 물리량은 기울임, 숫자·단위는 바로 세웁니다.
- **부분 수정** — 고칠 곳에 점이나 영역 코멘트를 남기면 그 부분만 다시 그립니다.
- **그래프** — 원본 그래프를 눈금·글자 크기까지 재어 복원하고, 함수로 새로 그리고, 축 이름·눈금을 그래프 위에서 바로 고칩니다.
- **캔버스** — 도형 · 글 · 수식 · 실험 장치 · 과학 오브젝트 · 에셋 라이브러리. PNG · SVG · `.5e`로 저장합니다.

</details>

<details open>
<summary><b>5E_exam — 문항과 시험지</b></summary>

- **문항 카드** — 지문 · 자료 · 발문 · 〈보기〉 · 선지를 시험지 순서대로. 〈보기〉 ○·×로 정답이 정해지고, 표는 한글처럼(F5 · M · S), 수식은 글 속에서(⌘E).
- **실시간 조판** — 카드 옆 미리보기가 실제 HWP 조판입니다. 기본 틀은 수능 B4 원본 지면(단 폭 112mm · 11.5pt).
- **기출 변형** — AI 없이 원본 PDF를 편집 가능한 한글 문항으로. 1,440문항 시험에서 95.7%가 제자리에 복원됩니다.
- **시험지** — 담기 → 학교 양식으로 배치 → 여백·순서 → 점검 → 이원목적분류표 · B형 · 인쇄 · HWPX.
- **학교 양식** — 학교 원안지 한글 파일을 등록하면 머리 표와 꼬리말을 그대로 두고 그 위에 조판합니다.
- **시험지 파일** — 문항 · 그림 · 양식 · 조판 기준을 `.exampool` 하나에. 시험이 끝난 시험지는 잠가 둡니다.
- **AI 출제 대화** — 대화로 문항을 다듬고 범위·정답·그림을 검토합니다. 변경은 「적용」을 눌러야 들어갑니다.

</details>

<details open>
<summary><b>5E_hwp — 한글 조판과 인쇄</b></summary>

- 한글 프로그램 없이 HWP·HWPX를 열고, 고치고, 저장합니다.
- **교사용 줄** — `[정답]` 한 번이면 정답표 · 나형 정답 · 정답 분포 · 해설지 · 분류표 · 정답 QR이 따라오고, 학생용 사본에서는 빠집니다.
- **시험지 도구** — 문항 틀 14종 · 조합 선지 · 배점 한 번에 · 정답 한 번에 · 가·나형 · 쪽 번호 · 머리말.
- **인쇄 전 점검** — 넓은 그림, 번호 빠짐, 배점 합계, 글꼴 섞임, 숫자·단위 띄어쓰기, 정답 분포 치우침을 찾아 한 번에 고칩니다.
- **학습지** — 빈칸 학습지 · 실험 보고서 · 형성 평가 틀 · QR 코드 · 화학식 첨자.
- 한컴 한글과 같은 단축키. [전체 목록](docs/HWP_EXAM_SHORTCUTS.md)

</details>

## 시작하기

**웹** — <https://www.5e.ai.kr/> 을 엽니다. 설치는 필요 없습니다. 시작 화면에서 image · exam · hwp 중 하나를 고르세요.

**설치판** — [릴리스](https://github.com/seungyeon980808-pixel/5E/releases/latest)에서 내려받습니다.

| | 파일 |
|---|---|
| Windows | `5E-1.7.0-windows-x64.exe` |
| Mac · 애플 실리콘 | `5E-1.7.0-macos-arm64.dmg` |
| Mac · 인텔 | `5E-1.7.0-macos-x64.dmg` |

> 설치 파일에는 아직 코드 서명이 없습니다. Windows에서 「PC 보호」 창이 뜨면 **추가 정보 → 실행**, Mac에서 처음 열 때 막히면 응용 프로그램 폴더에서 5E를 **Control-클릭 → 열기**를 누르세요.
>
> 1.7.0 이전 설치판의 최신 릴리즈 <strong>v1.5.8</strong>은 [v1.5.8 릴리즈 페이지](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8)에 남아 있습니다.

**AI** — 웹에서는 AI 창에서 ChatGPT 계정으로 기기 로그인하고, 설치판에서는 내 컴퓨터에 로그인된 Codex를 씁니다. 5E는 비밀번호를 받지 않습니다. AI 없이도 그리기 · 문항 쓰기 · 조판 · 점검은 모두 됩니다.

## 단축키

| | Mac | Windows |
|---|---|---|
| 프로그램 전환 | ⌥⌘1 · 2 · 3 | Ctrl+Alt+1 · 2 · 3 |
| 5E 클립보드 | ⇧⌘V | Ctrl+Shift+V |
| 기능 검색 | ⌘K | Ctrl+K |
| 글 속 수식 | ⌘E | Ctrl+E |
| 새로 조판 · 저장하고 시험지로 | ⌘Enter | Ctrl+Enter |
| 되돌리기 · 다시 하기 | ⌘Z · ⇧⌘Z | Ctrl+Z · Ctrl+Shift+Z |

단추에 마우스를 올리면 그 기능의 단축키가 보입니다.

## 내 자료

| | 저장되는 곳 | 밖으로 |
|---|---|---|
| 그림 · 문항 · 시험지 | 브라우저 저장소 (설치판은 `~/Documents/5E/출제`에도 자동 저장·백업) | 나가지 않음 |
| 프로젝트 · 시험지 파일 | 내가 저장한 `.5e` · `.exampool` | 직접 옮길 때만 |
| AI 작업 | 브라우저 저장소 | 실행할 때 원본과 요청만 AI 연결 서버로 |
| 웹 AI 로그인 | 탭의 sessionStorage에 5E 세션 토큰 하나 | 30분 쓰지 않으면 끝 |

웹과 설치판, 브라우저마다 저장 공간이 다릅니다. 옮길 때는 그림은 `.5e`, 시험지는 `.exampool` 파일을 쓰세요.

## 자주 묻는 질문

<details>
<summary><b>비용이 드나요?</b></summary>

5E는 무료입니다. AI 기능만 로그인한 ChatGPT 계정의 기능과 이용 한도 안에서 실행됩니다.
</details>

<details>
<summary><b>한글 프로그램이 있어야 하나요?</b></summary>

아니요. 5E_hwp가 한글 문서를 직접 열고 저장합니다. 내보낸 HWPX는 한컴 한글에서도 그대로 열립니다.
</details>

<details>
<summary><b>기출 변형 결과는 원본과 같나요?</b></summary>

눈으로 보아 어색하지 않은 수준을 목표로 합니다. 시험지에 넣기 전에 원본과 나란히 확인하세요.
</details>

<details>
<summary><b>교과서·기출 그림을 써도 되나요?</b></summary>

교과서·기출 자료는 각 저작권자의 이용 조건을 따릅니다. 라이브러리에 보인다는 것이 이용 권리를 확인했다는 뜻은 아닙니다.
</details>

## 개발

```bash
npm ci
npm run exam        # 로컬 서버로 열기
npm run desktop     # 설치판(Electron)으로 열기
npm test            # 단위 검사
```

Node 24.21 · Electron 44.4.5 · 한글 조판 엔진 rhwp. 설계 문서는 [DESIGN.md](DESIGN.md)와 [docs/](docs/)에 있습니다.

## 문서

[1.7.0 변경 내용](docs/RELEASE_NOTES_v1.7.0.md) · [사용 가이드](docs/USER_GUIDE.md) · [5E_hwp 단축키](docs/HWP_EXAM_SHORTCUTS.md) · [1.6.3 → 1.7.0 자료 호환](docs/DATA_COMPAT_1_6_3_TO_1_7_0.md) · [릴리스 이력](https://github.com/seungyeon980808-pixel/5E/releases)

## 문제 신고 · 라이선스

문제를 찾으면 [문제 신고 게시판](https://www.5e.ai.kr/bug/)이나 [GitHub Issues](https://github.com/seungyeon980808-pixel/5E/issues)에 남겨 주세요. 사용한 주소(웹/설치판), 브라우저, 어떤 순서로 무엇을 했는지 적어 주시면 빨리 고칠 수 있습니다.

5E는 [GNU AGPL v3](LICENSE)로 배포됩니다.

<p align="center"><sub>개발 박승연 (SMOE) · © 2026</sub></p>
