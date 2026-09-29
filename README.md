<p align="center">
  <img src="docs/media/readme/banner.png" alt="5E: 어떤 그림이든, 시험용 그림으로." width="100%">
</p>

<h3 align="center">어떤 그림이든, 시험용 그림으로.</h3>
<p align="center">교과서·기출 PDF에서 그림을 자르고, AI로 평가원식 흑백 선화로 바꾸고, 라벨을 붙여 바로 시험지에 씁니다.<br>과학 교사를 위한 시험용 이미지 제작기입니다.</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.6.0-3f3f46?style=flat-square&labelColor=18181b" alt="version 1.6.0">
  <img src="https://img.shields.io/badge/web-설치_없이-3f3f46?style=flat-square&labelColor=18181b" alt="web">
  <img src="https://img.shields.io/badge/Windows-x64-3f3f46?style=flat-square&labelColor=18181b&logo=windows" alt="Windows">
  <img src="https://img.shields.io/github/license/seungyeon980808-pixel/5E?style=flat-square&labelColor=18181b&color=3f3f46" alt="AGPL-3.0">
</p>

<p align="center">
  <a href="https://www.5e.ai.kr/"><img src="https://img.shields.io/badge/웹에서_바로_쓰기-5e.ai.kr-18181b?style=for-the-badge" alt="웹에서 바로 쓰기"></a>
  <a href="https://github.com/seungyeon980808-pixel/5E/releases/latest"><img src="https://img.shields.io/badge/Windows-설치판_받기-18181b?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 설치판"></a>
</p>

<table>
<tr>
<td width="42%" valign="middle">

### ① 라이브러리에서 이미지 크롭

교과서·기출 PDF를 본문까지 검색하고, 문서 전체를 스크롤하며 필요한 그림을 드래그로 자릅니다. 여러 쪽, 여러 PDF에서 자른 그림을 보관함에 모았다가 한 번에 작업대로 보냅니다.

</td>
<td width="58%"><img src="docs/media/readme/step-crop.png" alt="교과서 PDF에서 실험 장치 그림을 자르는 라이브러리 크롭 화면" width="100%"></td>
</tr>
<tr>
<td width="42%" valign="middle">

### ② AI 이미지 변환

교과서 사진과 그림을 평가원식 흑백 선화로 바꿉니다. 원본과 결과를 겹쳐 놓고 경계선을 움직여 비교하고, 고치고 싶은 곳에 점이나 영역 코멘트를 남겨 그 부분만 다시 그리게 합니다.

</td>
<td width="58%"><img src="docs/media/readme/step-convert.png" alt="교과서 원본과 AI 선화 결과를 겹쳐 비교하는 작업대" width="100%"></td>
</tr>
<tr>
<td width="42%" valign="middle">

### ③ 후처리 및 라벨링

캔버스에서 라벨러로 (가)(나)(다)와 지시선을 붙입니다. 확대경으로 정확한 위치를 잡고, PNG·SVG로 내보내 시험지에 넣습니다.

</td>
<td width="58%"><img src="docs/media/readme/step-label.png" alt="선화에 (가)(나)(다) 라벨과 지시선을 붙인 결과" width="100%"></td>
</tr>
</table>

## 기능

### 라이브러리

- **PDF 본문 검색** — 기출·교과서 PDF의 글자까지 검색하고, 학년도 범위로 좁힙니다.
- **연속 읽기** — 검색한 PDF를 전체 문서로 이어 보며 쪽을 넘기거나 스크롤합니다.
- **여러 영역 크롭** — 한 쪽에서 여러 영역을 자르고, 나중에 다시 조정합니다. 키보드로도 영역을 만들 수 있습니다.
- **크롭 보관함** — 여러 PDF에서 자른 그림을 모아, 한 작업으로 묶거나 작업별로 나눠 보냅니다.
- **공유 자료 연결** — 공개 Google Drive 폴더를 연결해 학교·교과 협의회 자료를 함께 씁니다.
- **그림·부품 검색** — 그림, 과학 부품, 개인 오브젝트를 같은 검색창에서 찾습니다.

### AI 이미지 변환

- **평가원식 선화 변환** — 사진과 컬러 그림을 시험지용 흑백 선화로 바꿉니다.
- **부분 수정** — 결과에 점·영역 코멘트를 남기면 그 부분만 고친 후보를 받아 비교 후 적용합니다.
- **겹쳐 비교** — 원본과 결과를 나란히 두거나, 경계선을 움직여 겹쳐 봅니다. 크기가 달라도 위치를 맞춰 보여 줍니다.
- **배경 제거·색·선 굵기** — 드롭다운에서 고르면 바로 미리보기에 반영됩니다.
- **물체별 분리** — 자동 감지·격자·직접 지정으로 그림을 물체별 이미지로 나눠 캔버스에 놓습니다.
- **여러 작업 동시 실행** — 원본 여러 장을 작업별로 나누어 한꺼번에 변환하고, 작업마다 경과 시간을 확인합니다.
- **모델 선택과 오류 기록** — 사용할 모델과 사고 수준을 고르고, 실패하면 상세 기록을 열어 확인·복사합니다.
- **작업 공유** — 보기 전용 또는 편집 가능한 복사본 링크로 동료와 나눕니다.

### 캔버스

- **라벨러** — 확대경, 최대 다섯 시작점 연결, 선과 글자 간격 조절.
- **그리기 도구** — 선·도형·텍스트·지시선·자유 그리기·자르기·지우개.
- **과학 부품** — 비커·플라스크·회로 소자·용수철·전극·세포막·염색체·주기율표 등.
- **그래프** — 좌표평면, 함수 그래프(불연속 구간 보존), 데이터 그래프.
- **내보내기** — PNG·SVG, 내용에 맞춘 저장, 여러 결과 ZIP 내보내기.
- **프로젝트 저장과 복구** — 파일로 저장해 다시 열고, 갑자기 닫혀도 자동 저장에서 복구합니다.

### Lite와 Pro

**Lite**는 자주 쓰는 도구와 캔버스만 보여 주는 화면이고, **Pro**는 모든 그리기·오브젝트 도구를 씁니다. 모드를 바꿀 때 현재 작업을 이어갈지 새로 시작할지 고를 수 있고, 새로 시작하기 전에 기존 도면을 복구용으로 보관합니다.

## 시작하기

| 방법 | 버전 | 안내 |
|---|---|---|
| 웹 | 1.6.0 | [5e.ai.kr](https://www.5e.ai.kr/)에서 설치 없이 바로 사용 |
| Windows 설치판 | 1.6.0 | [릴리즈 페이지](https://github.com/seungyeon980808-pixel/5E/releases/latest)에서 내려받기 |

**AI 연결** — 웹에서는 AI 이미지 변환 창에서 ChatGPT 계정으로 로그인합니다. Windows 설치판은 내 컴퓨터의 Codex 로그인을 사용합니다. 5E는 비밀번호나 인증 토큰을 저장하지 않습니다. AI 연결 없이도 그리기와 편집은 모두 쓸 수 있습니다.

## 문서

- [1.6.0 변경 내용](docs/RELEASE_NOTES_v1.6.0.md)
- [사용 가이드](docs/USER_GUIDE.md)
- [릴리즈 이력](https://github.com/seungyeon980808-pixel/5E/releases)
- [이미지 출처](docs/credits.html)

<details>
<summary><b>알아 두면 좋은 점</b></summary>

- AI 결과가 원본 구도나 과학적 표현을 항상 그대로 지키지는 않습니다. 시험지에 넣기 전에 원본과 비교하세요.
- 물체별 분리는 이미지(래스터) 분리입니다. 맞닿거나 겹친 물체는 함께 나뉠 수 있습니다.
- 웹 AI 서버를 다시 시작하거나 30분 동안 요청이 없으면 다시 로그인해야 합니다.
- 공유 링크는 최대 1시간 동안 유지됩니다.
- 교과서·기출 자료는 각 저작권자의 이용 조건을 따릅니다.
- 버전을 옮기기 전에는 프로젝트 파일을 따로 저장해 두세요. 웹과 설치판의 저장 공간은 서로 다릅니다.

</details>

<details>
<summary><b>개발자용: 로컬에서 실행하기</b></summary>

웹 화면은 정적 파일입니다. 저장소 루트에서 실행한 뒤 `http://localhost:8000`을 엽니다.

```sh
python3 -m http.server 8000
```

데스크톱 개발에는 [Node.js 24.21.x](.nvmrc)가 필요합니다.

```sh
npm ci
npm test
npm run test:browser
npm run desktop
```

설계 기록은 [DESIGN.md](DESIGN.md), 배포 절차는 [docs/GITHUB_RELEASES.md](docs/GITHUB_RELEASES.md)에 있습니다.

</details>

## 라이선스

5E는 [GNU AGPL v3](LICENSE)로 배포됩니다. 개발 박승연 · Copyright © 2026 박승연

