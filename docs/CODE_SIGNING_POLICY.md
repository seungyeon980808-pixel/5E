# Code signing policy

5E의 Windows 설치 파일은 공개 저장소의 소스와 GitHub Actions 워크플로에서 재현 가능한 방식으로 빌드한다.

## 역할

- Committer and reviewer: [seungyeon980808-pixel](https://github.com/seungyeon980808-pixel)
- Signing approver: [seungyeon980808-pixel](https://github.com/seungyeon980808-pixel)

저장소와 코드 서명 계정에는 다중 인증을 사용한다. 서명 요청은 공개 태그와 GitHub가 보관한 빌드 산출물에서만 시작한다.

## 개인정보와 네트워크 사용

5E의 편집·저장·내보내기 기능은 로컬에서 동작한다. Windows 데스크톱판의 AI 이미지 기능은 사용자가 명시적으로 요청했을 때만 입력한 설명과 첨부 이미지를 로컬 Codex App Server에 전달한다. 이후 처리는 사용자가 로그인한 ChatGPT/Codex 계정과 해당 서비스의 개인정보 처리 조건을 따른다. 5E는 계정 비밀번호나 인증 토큰을 저장하거나 자체 서버로 전송하지 않는다.

## 무료 OSS 서명

SignPath Foundation 승인을 받은 뒤 다음 문구와 실제 통합 상태를 유지한다.

> Free code signing provided by SignPath.io, certificate by SignPath Foundation.

승인 전 배포 파일은 서명되지 않았음을 릴리스 페이지에 명확히 표시한다.
