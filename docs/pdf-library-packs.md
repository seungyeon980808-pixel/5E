# PDF 자료팩 운영

자료팩은 앱 저장소 밖의 디렉터리로 만든다. 압축 파일을 앱에서 풀지 않으므로 ZIP 폭탄이나 전체 압축 해제에 따른 무제한 메모리 사용 경로가 없다. 브라우저에서는 자료팩 디렉터리를 선택해 설치한다.

## 형식

한 자료팩은 `pack.json`, `checksums.json`, `catalog.json`, `search-index.json`, `documents/*.pdf`로 구성된다. `pack.json`의 `id`는 자료팩의 영구 식별자이며, 업데이트는 같은 ID와 더 높은 유의 버전을 사용한다. 동일 버전의 매니페스트나 파일 해시는 바꿀 수 없다. `checksums.json`은 정규화한 `pack.json`의 SHA-256과 모든 카탈로그·색인·PDF 파일의 SHA-256을 기록한다.

기본 제한은 파일 512개, 파일당 256 MiB, 전체 768 MiB, JSON 파일당 32 MiB다. 절대 경로, `..`, 역슬래시, 중복 경로는 거부한다. 선언한 파일과 해시 목록은 정확히 일치해야 하며 문서 파일은 PDF 헤더를 가져야 한다. 카탈로그의 문서 수와 페이지 수는 매니페스트와 일치해야 한다.

## 생성과 검사

입력 명세는 다음 형태다. `source`는 명세 파일 기준 상대 경로나 명시한 절대 경로일 수 있다. 출력 경로는 외부 데이터 디렉터리를 사용하고 앱 Git 저장소에 완성 자료팩을 추가하지 않는다.

```json
{
  "id": "kice.recent-three.science",
  "version": "1.0.0",
  "title": "최근 3개 학년도 과학탐구",
  "kind": "exam",
  "subjects": ["physics1"],
  "academicYears": [2024, 2025, 2026],
  "createdAt": "2026-09-10T00:00:00.000Z",
  "minAppVersion": "1.5.3",
  "documents": [
    {
      "id": "2026-csat-physics1",
      "title": "2026학년도 수능 물리학 I",
      "source": "/외부/원본/physics1.pdf",
      "destination": "documents/2026-csat-physics1.pdf"
    }
  ]
}
```

```sh
node tools/pdf-library/build-pack.mjs --spec /외부/pack-spec.json --output /외부/5e-packs/recent-three
node tools/pdf-library/inspect-pack.mjs /외부/5e-packs/recent-three
```

생성기는 실제 PDF.js 색인을 실행해 공통 문서 계약의 `catalog.json`과 웹 검색용 `search-index.json`을 만든다. 새 디렉터리를 완전히 생성하고 자체 검증한 뒤 출력 경로를 교체한다. 생성이나 검증이 실패하면 기존 출력은 유지된다.

## 설치, 업데이트, 비활성화, 삭제

브라우저 저장소는 IndexedDB의 한 트랜잭션으로 새 버전 파일, 활성 버전 메타데이터, 이전 버전 제거를 함께 커밋한다. 손상된 입력은 커밋 전에 거부하므로 기존 유효 버전이 남는다. 비활성화는 검색 대상에서만 제외하고 바이트는 유지한다. 삭제는 자료팩의 카탈로그·색인·PDF 바이트를 제거한다.

캔버스에 삽입한 이미지와 AI 작업 입력은 작업 생성 시 독립된 바이트로 저장해야 한다. 자료팩 저장소의 키나 URL만 프로젝트에 저장하면 안 된다. 따라서 자료팩 삭제는 저장한 프로젝트 이미지와 진행 중 AI 스냅샷을 삭제하지 않는다.

설치형 어댑터는 `list`, `commitInstall`, `setEnabled`, `remove`, `readAsset`만 구현한다. `commitInstall(record, assets, previousVersion)`은 전체 교체를 원자적으로 수행해야 한다. 사용자 연결 폴더와 원본 PDF는 이 인터페이스의 삭제 대상이 아니다.

## 최근 3개 학년도 상태

[`recent-three.config.json`](../tools/pdf-library/recent-three.config.json)은 로컬 검토 자료팩을 가리킨다. 범위는 완결된 2024·2025·2026학년도이며 각 학년도 24개, 전체 72개다. 각 학년도는 6월·9월 모의평가와 수능, 과학탐구 I·II 8개 과목을 포함한다. 진행 중이라 완결되지 않은 2027학년도는 제외한다.

실제 자료 경로 검증은 EBSi 원본 URL 72개에 대해 HTTP 응답, PDF 헤더와 로컬 파일을 확인했다. 생성한 `ebsi.recent-three.science` 자료팩은 72개 문서, 288페이지, 76개 파일이며 논리 크기는 133.90 MiB다. 카탈로그에는 질문 fallback과 함께 1,280개 문항의 도판 판정, 2,383개 도판·표 후보를 저장한다. 검색 색인은 1,312개 문항과 175,699개 좌표 포함 단어를 압축 형태로 저장해 학년도·시행·과목·단어 검색과 검색어 위치를 보존한다. 로컬 개발 서버에서는 매니페스트·체크섬·카탈로그·검색 색인만 먼저 가져오고, 사용자가 결과를 미리 보거나 삽입할 때 선택된 PDF만 연다.

## 구현·배포 상태

자료팩 생성, 해시 검증, 브라우저 설치·업데이트·비활성화·삭제, 원격 카탈로그 선로딩과 선택 PDF 지연 열기는 구현됐다. 서로 다른 자료팩의 내부 문서 ID가 같아도 자료팩 ID를 붙인 실행 ID로 검색·선택·열기를 구분한다. 제품 기획의 Python FTS 경로 대신 웹과 설치형이 같은 PDF.js 런타임과 미리 생성한 JavaScript 검색 색인을 사용한다. 로컬 측정에서 1,312개 문항 색인 로드는 0.659 ms, 구조화 필터를 포함한 100회 검색은 중앙값 0.021 ms, p95 0.065 ms였다. 이 수치는 개발 장비의 Node 측정값이며 배포 환경 성능 보장은 아니다.

현재 공개된 프로덕션 자료팩 URL은 없다. 로컬 검토 빌드는 `/.omo/evidence/pdf-library/T5/recent-three-pack/`을 사용하고, 배포 빌드는 앱 모듈을 불러오기 전에 `window.FIVE_E_PDF_PACK_BASE_URL`에 검증한 HTTPS 자료팩 디렉터리를 지정한다. 값을 지정하지 않으면 앱은 자료팩을 비어 있는 상태로 유지하고 배포 주소가 없다는 안내와 오프라인 자료팩 폴더 설치 경로를 보여 준다. 설치형 사용자는 같은 형식의 자료팩 폴더를 직접 선택해 네트워크 없이 설치할 수 있다. 원격 자료는 검색 시 PDF를 받지 않지만, 사용자가 문서를 처음 열면 선택한 PDF 전체를 최대 256 MiB까지 내려받아 SHA-256과 PDF 헤더를 확인한 뒤 PDF.js에 전달한다. 무결성 검증 때문에 선택 파일을 부분 다운로드하는 경로는 사용하지 않는다.

배포할 때는 앱 모듈을 불러오기 전에 `window.FIVE_E_PDF_PACK_BASE_URL`에 자료팩 디렉터리의 절대 HTTPS URL을 설정한다. 값이 없으면 앱은 기본 자료를 찾은 것처럼 동작하지 않고 배포 주소가 없다는 안내와 자료팩 폴더 설치 동작을 보여 준다. URL을 설정하기 전에 `pack.json`, `catalog.json`, `search-index.json`, 선택 PDF에 대한 CORS, `Content-Length`와 캐시 갱신을 배포 호스트에서 확인한다. 원본 URL 72개와 생성 자료팩은 공개 배포 승인을 뜻하지 않는다.
