# 폴더 ↔ 브랜치 ↔ 포트 ↔ 역할 지도 (BRANCH_MAP.md)

> 2026-07-03 세션 교훈: "이 폴더 = 이 브랜치 = 이 역할"이 문서에 없으면 오진이 생긴다.
> **폴더에서 브랜치를 바꾸지 말 것. 브랜치가 필요하면 폴더(워크트리)를 만든다.**

- 최종 실측: **2026-07-23** (브랜치 대통합 직후)
- 배포 버전: **v1.1.0** (마지막 GitHub Release = v1.1.0). 코드는 그 이후 41커밋 더 나갔고
  버전 문자열은 아직 안 올렸다 — 다음 릴리즈 때 한 번에 올린다.
- 이 표는 추측이 아니라 실측이다. 갱신할 때도 맨 아래 명령으로 다시 뽑는다.

---

## 현재 지도

흐름은 **`main` 하나**다. 2026-07-23에 살아 있던 브랜치를 전부 `main`에 병합하고
origin에 올린 뒤, 역할이 끝난 브랜치·워크트리를 정리했다.
`integration-hub`(합치는 곳)는 **없앴다** — main이 그 역할을 그대로 한다.

| 폴더 (`51_5E\` 아래) | 브랜치 | 포트 | 역할 | 상태 |
|---|---|---|---|---|
| `5E_main` | `main` | 8190 | **배포 기준**(GitHub Pages) · 기본 작업 폴더 | ✅ origin 동기 |
| `branches/5E_ai_dev` | `feat/ai-assist` | 8250 | AI 챗봇(Cloudflare Worker 프록시) — 베타, 보류 | ⏸ main에 +2커밋, origin에는 있음 |

**워크트리는 2개다.** 여기 없는 폴더는 없는 게 맞다.

### 정리된 것 (2026-07-23)

- **워크트리 11개 삭제** — `5E_hub` · `5E_annot_dev` · `5E_curve_dev` · `5E_debt_dev` ·
  `5E_export_dev` · `5E_hubmerge` · `5E_label_dev` · `5E_libstore_dev` · `5E_macfix_dev` ·
  `5E_uibatch_dev` · `5E_uidetail_dev` (+ 빈 껍데기 `5E_majorfix_dev`)
- **로컬 브랜치 12개 삭제** — 전부 `git rev-list --count main..<브랜치>` = 0 확인 후 삭제.
  `integration-hub` · `feature/app-icon` · `feat/visual-weight` · `feat/annot-tab` ·
  `feat/curve-smoothing` · `feat/export-batch` · `feat/library-storage` ·
  `feat/mac-graph-examlib` · `feat/ui-batch7` · `feat/ui-detail` ·
  `fix/label-centering` · `fix/schema-backfill`
- **origin 브랜치 4개 삭제** — `integration-hub` · `object-dev` · `feat/exam-image-import` ·
  `feat/curve-smoothing` (모두 `main`에서 도달 가능)
- **남긴 것** — `origin/main-backup-20260701`. 2026-07-01 커밋 2개(`c1df5bf`·`d3e36f0`)가
  **`main`에 없다.** 잔재로 보여도 지우면 그 히스토리가 사라진다. 확인 전엔 두는 게 맞다.
- `5E_hub`에 있던 참고 이미지(`graph_reference/`, 26장)는 워크트리 삭제에 휩쓸리지 않게
  `51_5E/graph_reference/`로 옮겼다(git 밖).

---

## 규칙

- **한 폴더 = 한 브랜치 = 한 포트.** 셋 중 하나라도 겹치면 오진이 시작된다.
- **새 브랜치는 `main`에서 딴다.** 허브를 base로 삼던 습관 때문에 작업 브랜치가 main보다
  뒤처진 채로 자라 병합 때 충돌이 났다.
  ```bash
  git worktree add -b feat/<이름> ../branches/5E_<약칭>_dev main
  ```
- 폴더에서 `git checkout`으로 브랜치를 갈아타지 않는다. 새 작업 = 새 워크트리.
- **병합이 끝나면 그 자리에서 지운다.** 안 지워서 12개까지 쌓였다.
  ```bash
  git rev-list --count main..<브랜치>   # 0이면
  git worktree remove ../branches/<폴더> && git branch -d <브랜치>
  ```
- `run-server.bat`은 그 폴더 전용 포트를 박아 둔다. **병합할 때는 제외**한다(dev 전용).
- 배포는 `main` 기준 — `main`에 올라간 것만 사용자에게 보인다.
- 작업 시작 전 `git status`로 그 폴더의 미커밋 상태를 먼저 확인한다.

## 알아 둘 함정 — 줄바꿈(CRLF/LF) 충돌

2026-07-23 병합에서 `js/export-dialog.js`·`js/render/labels.js`가 **파일 전체 충돌**로 잡혔다.
내용이 아니라 한쪽이 CRLF로 다시 저장돼 모든 줄이 바뀐 것으로 보인 탓이다. 해결은 이렇게 한다.

```bash
git show $BASE:$f > base.txt
git show HEAD:$f  > ours.txt
git show <브랜치>:$f | tr -d '\r' > theirs.txt   # 줄바꿈만 되돌리고
git merge-file -L main -L base -L branch ours.txt base.txt theirs.txt   # 3-way 재실행
```
실제 충돌은 0이었다. **파일째 `--ours`로 덮지 말 것** — 반대편 변경이 통째로 날아간다.

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
