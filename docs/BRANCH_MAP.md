# 폴더 ↔ 브랜치 ↔ 포트 ↔ 역할 지도 (BRANCH_MAP.md)

> 2026-07-03 세션 교훈: "이 폴더 = 이 브랜치 = 이 역할"이 문서에 없으면 오진이 생긴다.
> **폴더에서 브랜치를 바꾸지 말 것. 브랜치가 필요하면 폴더(워크트리)를 만든다.**

- 최종 실측: **2026-07-19** (`git worktree list` + 각 폴더 `run-server.bat` 대조)
- 배포 버전: **v1.1.0** (마지막 GitHub Release = v1.1.0, 태그 커밋 `48ab998` = `main` HEAD)
- 이 표는 추측이 아니라 실측이다. 갱신할 때도 맨 아래 명령으로 다시 뽑는다.

---

## 현재 지도

흐름은 **작업 브랜치 → `integration-hub`(합치는 곳) → `main`(배포)** 이다.
다만 v1.1.0 릴리즈로 허브의 내용이 전부 `main`에 들어갔고 `main`은 origin과 동기다.
따라서 지금은 대부분의 브랜치가 이미 안전하며, **판단 기준은 "이 커밋이 origin 어딘가에 있나"** 하나다.

| 폴더 (`51_5E\` 아래) | 브랜치 | 포트 | 역할 | main 병합 | origin |
|---|---|---|---|---|---|
| `5E_main` | `main` | 8190 | **배포 기준**(GitHub Pages) | (배포선) | ✅ 동기 |
| `branches/5E_hubmerge` | `integration-hub` | ⚠️ 8320 | **합치는 곳** — main에 전부 흡수됨(4커밋 뒤짐) | ✅ 흡수 | ✅ (main 경유) |
| `branches/5E_curve_dev` | `feat/curve-smoothing` | 8340 | 자유곡선(centripetal)·베지어 핸들 편집 | ✅ 병합됨 | ✅ 있음 |
| `branches/5E_macfix_dev` | `feat/mac-graph-examlib` | ⚠️ 8190 | Mac 대응 + 모달 이동 손잡이 + 기출 다중선택 | ✅ 병합됨 | ✅ (main 경유) |
| `5E_hub` | `feature/app-icon` | 8199 | 앱 아이콘·공유 썸네일 디자인 | ✅ 병합됨 | ✅ (main 경유) |
| `branches/5E_libstore_dev` | `feat/library-storage` | 8350 | 라이브러리 IndexedDB 이전 + ZIP 백업 | ✅ 병합됨 | ✅ (main 경유) |
| `branches/5E_label_dev` | `fix/label-centering` | ⚠️ 8320 | 사각형 안 라벨 세로 중심 보정 | ✅ 병합됨 | ✅ (main 경유) |
| `branches/5E_uibatch_dev` | `feat/ui-batch7` | ⚠️ 8320 | UI 요구 7건(툴바·참고창·객체화·환경설정 탭) | ✅ 병합됨 | ✅ (main 경유) |
| `branches/5E_uidetail_dev` | `feat/ui-detail` | 8400 | UI 조립 원칙 적용 + 문서 최신화 | ✅ 병합됨 | ✅ (main 경유) |
| `branches/5E_ai_dev` | `feat/ai-assist` | ⚠️ 없음 | AI 챗봇(Cloudflare Worker 프록시) | ❌ **+2커밋** | ❌ **로컬 전용** |

> **워크트리는 10개다.** `main` 병합이 끝난 브랜치는 폴더째 정리해도 되지만,
> 지우기 전에 `git rev-list --count main..<브랜치>`가 0인지 반드시 확인한다.

---

## ⚠️ 지금 걸려 있는 문제 3가지

**1. 포트가 두 군데서 겹친다**
- **8190**: `5E_main` · `branches/5E_macfix_dev`
- **8320**: `branches/5E_hubmerge` · `branches/5E_label_dev` · `branches/5E_uibatch_dev`
- 증상: 한 폴더에서 서버를 띄워 둔 채 다른 폴더의 `run-server.bat`을 열면, 새 서버가 뜨지 못하고
  **이미 떠 있던 남의 서버**에 접속된다. "분명 고쳤는데 화면이 그대로"의 주범이다.
- 처방: 폴더마다 고유 포트를 준다. 실제로 비어 있는 대역 → **8440 · 8450 · 8460**.
  (8210·8220·8230은 이미 `.claude/launch.json`에서 쓰고 있으니 고르지 말 것.)
- 포트를 바꾸면 브라우저 캐시(origin 단위)까지 무효화되므로 그 자체로 이득이다.

**2. `5E_ai_dev`에 `run-server.bat`이 없다** — 실행 방법이 폴더에 남아 있지 않다.
- 처방: 8250(과거 사용값)으로 만들어 둔다. `.bat`은 **ASCII + CRLF**로 저장할 것
  (UTF-8/LF이면 한국어 Windows의 cmd가 파싱에 실패한다).

**3. `feat/ai-assist` 2커밋이 어디에도 없다 — 유일하게 남은 위험이다.**
- `094b535`·`626794d` — main에도, 허브에도, origin에도 없다. **이 PC에만 존재한다.**
- 처방: `git push -u origin feat/ai-assist` 또는 허브에 병합.
- 챗봇은 베타이고 Cloudflare Worker에 의존해 v1.1.0에서 **의도적으로 제외**했다.
  기능을 넣지 않더라도 커밋 보존을 위해 push는 해 두는 편이 안전하다.
- (구 위험이던 "허브 미push"는 v1.1.0 머지로 해소됐다. `origin/integration-hub`는 16커밋
  뒤져 있지만 그 커밋들은 전부 `origin/main`에서 도달 가능하다.)

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
