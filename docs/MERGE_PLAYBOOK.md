# 허브 머지 플레이북 (feat/* → integration-hub)

> 이 저장소는 커밋마다 **모든 파일의 `?v=` 캐시버스트 버전을 올리는 규칙** 때문에,
> 머지하면 충돌이 수십 개로 보입니다. **겁먹지 마세요 — 대부분(보통 80~90%)은
> 버전 숫자만 다른 기계적 충돌입니다.** 진짜 코드 충돌은 보통 5~10개뿐입니다.
>
> 이 문서대로 하면 15~30분이면 안전하게 끝납니다.
> (기준 사례: 2026-07-18 `integration-hub` → `main` v1.1.0 머지 — 73파일·충돌 0)

---

## 0. 시작 전 확인 (branches/5E_hubmerge 폴더에서)

> ⚠️ 허브는 `branches/5E_hubmerge`다. **`5E_hub` 폴더는 허브가 아니라** `feature/app-icon`
> 워크트리다 — 이름에 속아 거기서 병합하지 말 것.

```bash
cd C:/Users/user/Desktop/project/51_5E/branches/5E_hubmerge
git status                      # 현재 브랜치 = integration-hub, 워킹트리 clean 확인
git log --oneline -3            # 허브 최신 상태 확인
```
- **integration-hub 브랜치에 있어야** 합니다(머지 대상). 아니면 `git switch integration-hub`.
- 미커밋 변경이 있으면 먼저 커밋하거나 stash. (미추적 `??` 파일은 머지에 영향 없음)
- 넣을 브랜치 이름 확인. 예: `feat/새기능`

**얼마나 충돌할지 미리 보기 (실제 머지 안 함, 안전):**
```bash
git rev-list --count integration-hub..feat/새기능   # 이 브랜치가 앞선 커밋 수
git rev-list --count feat/새기능..integration-hub   # 허브가 앞선 커밋 수 (0이면 fast-forward, 충돌 0)
```

---

## 1. 머지 시작 (커밋은 보류)

```bash
git merge --no-ff --no-commit feat/새기능
git diff --name-only --diff-filter=U | wc -l      # 충돌 파일 수
```

---

## 2. 버전 문자열만 다른 충돌 자동 해소 ⭐ (핵심)

아래 파이썬 한 방이면 "버전 숫자만 다른" 파일을 전부 자동 정리합니다.
(충돌 블록 안 코드가 같으면 = 버전만 다름 = 기계적)

```bash
python - <<'PY'
import subprocess, re
files = subprocess.run(["git","diff","--name-only","--diff-filter=U"],
                       capture_output=True,text=True).stdout.split()
vonly=[]; real=[]
for f in files:
    try: txt=open(f,encoding='utf-8',errors='replace').read()
    except: real.append(f); continue
    blocks=re.findall(r'<<<<<<<[^\n]*\n(.*?)\n=======\n(.*?)\n>>>>>>>[^\n]*',txt,re.S)
    if not blocks: real.append(f); continue
    norm=lambda s: re.sub(r'\d+\.\d+\.\d+','V',s).strip()   # 버전 숫자 무시하고 비교
    if all(norm(a)==norm(b) for a,b in blocks):
        # 버전만 다름 → 한쪽(theirs=들어오는 브랜치) 유지. 버전은 3단계에서 통일.
        out=re.sub(r'<<<<<<<[^\n]*\n.*?\n=======\n(.*?)\n>>>>>>>[^\n]*',
                   lambda m:m.group(1),txt,flags=re.S)
        open(f,'w',encoding='utf-8',newline='').write(out); vonly.append(f)
    else:
        real.append(f)
print("자동해소(버전만):", len(vonly), "개")
print("수동필요(실제충돌):", len(real), "개 →", " ".join(real))
PY
```

→ 여기서 출력된 **"수동필요" 목록만** 다음 단계에서 손보면 됩니다.

---

## 3. 실제 충돌 수동 해소 (보통 5~10개)

각 파일을 열어 `<<<<<<< HEAD`(허브) 와 `>>>>>>> feat/새기능`(들어오는 브랜치) 중
**둘 다의 의도를 살리도록** 고칩니다. 충돌 내용만 빠르게 보려면:

```bash
awk '/^<<<<<<</{p=1} p{print} /^>>>>>>>/{p=0}' 파일경로
```

**판단 기준 (실전 경험):**
| 상황 | 처리 |
|---|---|
| 한쪽에만 새 import/코드 추가 | **양쪽 다 살림** (허브 신규 + 브랜치 신규 둘 다) |
| 한쪽이 파일/기능 삭제(delete/modify, `UD`) | 삭제 의도가 맞으면 `git rm 파일` |
| 순수 버전 숫자만 (2단계가 놓친 것) | 아무 쪽이나 (3단계에서 통일됨) |
| 같은 함수를 서로 다르게 수정 | **가장 주의** — 두 로직을 손으로 합침 |

⚠️ **주의: import는 있는데 호출이 없거나 그 반대** — 자동해소가 한쪽 import를 지우면
호출부만 남아 `ReferenceError`가 납니다. 아래 4단계 문법검사 + 브라우저로 꼭 잡으세요.
(실제로 tool-ux-revamp 머지 때 `initExamLibrary` import가 이렇게 빠져서 수동 복구함)

**마커 남았는지 확인:**
```bash
grep -rl "^<<<<<<< \|^>>>>>>> " --include="*.js" --include="*.html" --include="*.json" --include="*.css" .
```
(아무것도 안 나와야 함)

---

## 4. 버전 전체 통일 ⭐

**⚠️ 버전은 사용자 지시가 있을 때만 올립니다.** 병합 자체로는 올리지 않고, 릴리즈하기로
정한 시점에만 이 단계를 밟습니다. (규칙: 기능 추가면 `v1.X.0`, 버그픽스면 `v1.1.X`.
다음 번호는 **마지막 GitHub Release 기준**으로 셉니다.)

```bash
# 예: 최종 버전을 1.2.0으로 → 이전 1.0.x/1.1.x 흔적을 전부 교체
grep -rl "1\.[01]\.[0-9]" --include="*.js" --include="*.html" --include="*.css" . \
  | xargs sed -i -E 's/1\.[01]\.[0-9]+/1.2.0/g'

# 확인: 남은 이전 버전 없어야 함
grep -rn "1\.[01]\.[0-9]" --include="*.js" --include="*.html" . | grep -v "1.2.0"
# 확인: 푸터 버전 단일
grep -o 'v1\.[0-9]*\.[0-9]*' index.html | sort -u
# 확인: ?v= 개수(v1.1.0 시점 297곳). 주석 속 "?v=" 설명 4곳은 여기 안 잡힌다
grep -ro "?v=1\.2\.0" --include=*.js --include=*.html --include=*.css . | wc -l
```
> 범위(`1\.[01]`)는 그때그때 실제 남아있는 버전대에 맞춰 조정하세요.
> **옛 `v0\.` 패턴은 더 이상 아무것도 잡지 못합니다** — 1.x대로 넘어왔습니다.

---

## 5. 검증 (커밋 전 필수)

**(a) 문법 검사 — 머지로 코드가 깨졌는지 즉시 잡음:**
```bash
git add -A
bad=0; for f in $(find js -name "*.js"); do node --check "$f" 2>/tmp/e || { echo "FAIL $f"; cat /tmp/e; bad=1; }; done; [ "$bad" = 0 ] && echo "전부 통과"
```

**(b) 브라우저 스모크 — import 누락/런타임 에러 잡음:**
```bash
# 허브 폴더를 로컬 서버로 띄우기 (포트는 비어있는 것 아무거나)
python -m http.server 8012
```
브라우저 `http://localhost:8012/index.html` 접속 → **F12 콘솔 에러 0** 확인 →
양쪽 브랜치의 대표 기능을 하나씩 눌러보기(허브 신규 1개 + 들어온 브랜치 신규 1개).

---

## 6. 머지 커밋

```bash
git commit    # 에디터 열림 → 머지 메시지 작성 후 저장
```
- 부모가 2개인 머지 커밋이 생깁니다: `git log -1 --pretty="%h parents: %p"`
- **push는 별도**입니다. 원할 때 `git push origin integration-hub`.

---

## 문제 생기면 안전 탈출

머지 도중 꼬였다 싶으면 언제든 되돌리기(작업 전 상태로):
```bash
git merge --abort
```
커밋까지 한 뒤 되돌리려면:
```bash
git reset --hard HEAD~1      # 방금 만든 머지 커밋 취소 (push 전에만 안전)
```

---

## 요약 한 줄
**충돌 수십 개 = 대부분 버전 숫자(2단계 자동). 진짜는 5~10개(3단계 수동, 둘 다 살리기).
버전 통일(4단계) → 문법+브라우저 검증(5단계) → 커밋(6단계). 막히면 `git merge --abort`.**
