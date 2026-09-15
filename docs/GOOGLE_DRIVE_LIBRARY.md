# Google Drive 공개 자료 연결 운영 가이드

5E는 공개 Google Drive 폴더를 읽기 전용 자료 원본으로 사용할 수 있다. 앱은 `pack.json`, `checksums.json`, `catalog.json`, `search-index.json`을 연결 시 먼저 읽고, PDF 원문은 사용자가 미리보기, 자르기 또는 저장을 요청할 때만 내려받아 체크섬별로 캐시한다.

## 준비할 폴더

1. 기존 빌더로 PDF 자료팩을 만든다.

   ```sh
   node tools/pdf-library/build-pack.mjs --spec /path/to/spec.json --output /path/to/drive-pack
   ```

2. 생성된 자료팩 루트의 파일과 `documents/` 구조를 그대로 Google Drive 폴더에 업로드한다.
3. 루트 폴더와 모든 하위 폴더 및 파일을 `링크가 있는 모든 사용자`의 `뷰어`로 공유한다. 편집 권한은 필요 없다.
4. 같은 상대 경로에 이름이 중복되지 않는지 확인한다. 지원 범위는 폴더 하나, JSON 색인, PDF 원문이다.

Drive 원본을 갱신할 때는 로컬에서 자료팩을 다시 빌드한 뒤 전체 산출물을 함께 교체한다. `checksums.json`과 실제 PDF가 어긋난 상태에서는 5E가 원문을 거부한다. 새 체크섬은 별도 캐시 키를 만들므로 기존 캐시를 수동 삭제할 필요가 없다.

## 읽기 전용 게이트웨이 배포

브라우저 앱에 Google API 키를 포함하지 않는다. `services/google-drive-gateway/worker.mjs`를 Cloudflare Workers 같은 서버 런타임에 배포하고 서버 비밀 `GOOGLE_DRIVE_API_KEY`를 설정한다. 예시 설정은 `services/google-drive-gateway/wrangler.toml.example`에 있다.

게이트웨이는 `GET`, `HEAD`, `OPTIONS`만 받고 Google Drive `files.list`와 `files.get?alt=media`만 호출한다. Drive 파일을 생성, 수정, 이동 또는 삭제하는 경로는 없다. API 키에는 Google Drive API만 허용하는 API 제한과 적절한 애플리케이션 제한을 적용한다.

배포 후 `assets/pdf-library/google-drive.json`의 `gatewayBaseUrl`에 HTTPS 게이트웨이 루트 주소를 넣는다. 이 파일에는 API 키를 넣지 않는다. 로컬 검증에서는 전역 `FIVE_E_GOOGLE_DRIVE_GATEWAY_URL` 또는 정확한 루프백 주소 `http://127.0.0.1:<port>/`를 사용할 수 있다.

## 앱에서 연결

1. 라이브러리의 검색 위치에서 `Drive 자료 연결`을 연다.
2. `Google Drive 공개 폴더`에 공유 링크를 붙여 넣고 `연결`을 누른다.
3. 자료팩 이름과 PDF 수가 표시되면 검색, 미리보기, 자르기, 컴퓨터 저장을 사용할 수 있다.
4. `연결 해제`는 5E의 연결 정보만 지운다. Google Drive 원본은 바꾸거나 삭제하지 않는다.

리소스 키가 포함된 공유 링크도 지원한다. 폴더 또는 하위 파일이 공개되지 않았거나 다운로드가 금지된 경우 연결 서비스가 읽기 전용 공유 설정을 확인하라는 오류를 반환한다.

## 운영 확인

- 앱 배포물과 브라우저 네트워크 응답에 Google API 키가 없는지 확인한다.
- `pack.json`, `checksums.json`, `catalog.json`, `search-index.json` 요청 뒤에는 PDF를 선택하기 전까지 `.pdf` 요청이 없는지 확인한다.
- 같은 PDF를 두 번 열었을 때 두 번째 요청이 브라우저 Cache Storage에서 제공되는지 확인한다.
- 데스크톱에서는 저장 대화상자, 웹에서는 브라우저 다운로드가 동작하는지 확인한다.

관련 Google 문서:

- 파일 검색: https://developers.google.com/workspace/drive/api/guides/search-files
- 파일 다운로드: https://developers.google.com/workspace/drive/api/guides/manage-downloads
- 리소스 키: https://developers.google.com/workspace/drive/api/guides/resource-keys
- API 키 보안: https://docs.cloud.google.com/docs/authentication/api-keys
