# 폴더 ↔ 브랜치 ↔ 포트 ↔ 역할 지도 (BRANCH_MAP.md)

> 2026-07-03 세션 교훈: "이 폴더 = 이 브랜치 = 이 역할"이 문서에 없으면 오진이 생긴다.
> **폴더에서 브랜치를 바꾸지 말 것. 브랜치가 필요하면 폴더(워크트리)를 만든다.**

- 최종 실측: **2026-07-18** (`git worktree list` + 각 폴더 `run-server.bat` 대조)
- 배포 버전: **v1.0.2** (마지막 GitHub Release = v1.0.2)
- 이 표는 추측이 아니라 실측이다. 갱신할 때도 맨 아래 명령으로 다시 뽑는다.

---

## 현재 지도

| 폴더 (`51_5E\` 아래) | 브랜치 | 포트 | 역할 | main 대비 | origin |
|---|---|---|---|---|---|
| `5E_main` | `main` | 8190 | **배포 기준**(GitHub Pages). 급한 버그는 여기서 직접 고치기도 함 | — | ✅ 동기 |
| `5E_hubmerge` | `integration-hub` | ⚠️ 8190 | 브랜치 병합 무대 | +11 | ✅ 있음 |
| `5E_hub` | `feature/app-icon` | 8199 | 앱 아이콘·공유 썸네일 디자인 | +3 | ❌ 로컬만 |
| `branches/5E_curve_dev` | `feat/curve-smoothing` | 8340 | 자유곡선(centripetal)·베지어 핸들 편집 | +5 | ✅ 있음 |
| `branches/5E_libstore_dev` | `feat/library-storage` | 8350 | 라이브러리 IndexedDB 이전 + ZIP 백업 | +3 | ❌ 로컬만 |
| `branches/5E_macfix_dev` | `feat/mac-graph-examlib` | ⚠️ 8190 | Mac 대응 + 모달 이동 손잡이 + 기출 다중선택 | +4 | ❌ 로컬만 |
| `branches/5E_uidetail_dev` | `feat/ui-detail` | 8400 | UI 조립 원칙 적용(그래프 모달 좌표 탭) + 문서 최신화 | +5 | ❌ 로컬만 |
| `branches/5E_ai_dev` | `feat/ai-assist` | ⚠️ 없음 | AI 챗봇(Cloudflare Worker 프록시) | +2 | ❌ 로컬만 |

---

## ⚠️ 지금 걸려 있는 문제 3가지

**1. 포트 8190이 세 곳에서 겹친다** — `5E_main` · `5E_hubmerge` · `5E_macfix_dev`
- 증상: 한 폴더에서 서버를 띄워 둔 채 다른 폴더의 `run-server.bat`을 열면, 새 서버가 뜨지 못하고
  **이미 떠 있던 남의 서버**에 접속된다. "분명 고쳤는데 화면이 그대로"의 주범이다.
- 처방: 폴더마다 고유 포트를 준다. 비어 있는 대역 → **8210 · 8220 · 8230**.
- 포트를 바꾸면 브라우저 캐시(origin 단위)까지 무효화되므로 그 자체로 이득이다.

**2. `5E_ai_dev`에 `run-server.bat`이 없다** — 실행 방법이 폴더에 남아 있지 않다.
- 처방: 8250(과거 사용값)으로 만들어 둔다. `.bat`은 **ASCII + CRLF**로 저장할 것
  (UTF-8/LF이면 한국어 Windows의 cmd가 파싱에 실패한다).

**3. origin에 없는 브랜치가 5개다** — `ai-assist` · `library-storage` · `mac-graph-examlib` · `ui-detail` · `app-icon`
- 합쳐 **17커밋이 이 PC에만** 있다. 디스크가 날아가면 복구 수단이 없다.
- 처방: 병합 계획이 없더라도 `git push -u origin <브랜치>`로 올려만 둔다.

---

## 규칙

- **한 폴더 = 한 브랜치 = 한 포트.** 셋 중 하나라도 겹치면 오진이 시작된다.
- 폴더에서 `git checkout`으로 브랜치를 갈아타지 않는다. 새 작업 = 새 워크트리.
  ```bash
  git worktree add -b feat/<이름> ../branches/5E_<약칭>_dev main
  ```
- `run-server.bat`은 그 폴더 전용 포트를 박아 둔다. **병합할 때는 제외**한다(dev 전용이라 배포본에 섞이면 안 된다).
- 배포는 `main` 기준 — `main`에 올라간 것만 사용자에게 보인다.
- 작업 시작 전 `git status`로 그 폴더의 미커밋 상태를 먼저 확인한다.

## 갱신하는 법

표를 손으로 고치지 말고 아래로 다시 뽑는다.

```bash
# 폴더 ↔ 브랜치 ↔ 포트
git worktree list | while read path head br; do
  p=$(grep -ho "http.server [0-9]*" "$path/run-server.bat" 2>/dev/null | grep -o "[0-9]*")
  printf "%-28s %-28s %s\n" "$(basename $path)" "$br" "${p:-없음}"
done

# main 대비 미병합 커밋 수
for b in $(git branch --format='%(refname:short)'); do
  printf "%-26s +%s\n" "$b" "$(git rev-list --count main..$b)"
done

# origin에 없는(=로컬 전용) 브랜치
for b in $(git branch --format='%(refname:short)'); do
  git ls-remote --exit-code --heads origin "$b" >/dev/null 2>&1 || echo "$b 로컬만"
done
```
