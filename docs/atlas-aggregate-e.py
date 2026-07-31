# 지구과학 도판 아틀라스 집계 (figure-atlas-e.jsonl -> 보고서용 수치)
# 사용: python docs/atlas-aggregate-e.py
import json, collections, pathlib, sys

HERE = pathlib.Path(__file__).parent
src = HERE / "figure-atlas-e.jsonl"

rows = []
for i, line in enumerate(src.read_text(encoding="utf-8").splitlines(), 1):
    line = line.strip()
    if not line:
        continue
    try:
        rows.append(json.loads(line))
    except json.JSONDecodeError as e:
        print(f"[JSON 오류] {i}행: {e}", file=sys.stderr)

print(f"총 {len(rows)}장\n")

def table(counter, total, title, top=None):
    print(f"## {title}")
    items = counter.most_common(top)
    for k, v in items:
        print(f"| {k} | {v} | {v/total*100:.0f}% |")
    print()

repro = collections.Counter(r.get("repro") for r in rows)
table(repro, len(rows), "repro 분포")

kinds = collections.Counter(p.get("kind") for r in rows for p in r.get("panels", []))
npanel = sum(kinds.values())
table(kinds, npanel, f"패널 종류 분포 (패널 {npanel}개)")

# misc 어휘: 장 단위 중복 제거
misc = collections.Counter()
for r in rows:
    seen = set()
    for p in r.get("panels", []):
        for vals in p.get("elements", {}).values():
            for v in vals:
                if isinstance(v, str) and v.startswith("misc:"):
                    seen.add(v)
    misc.update(seen)
table(misc, len(rows), "misc 빈도 (장 수)", 30)

# blockers: 장 단위 중복 제거, type별
by_type = collections.defaultdict(collections.Counter)
for r in rows:
    seen = set()
    for b in r.get("blockers", []) or []:
        seen.add((b.get("type"), b.get("what")))
    for t, w in seen:
        by_type[t][w] += 1
for t in ("part", "assembly", "layout", "illustration"):
    if by_type[t]:
        table(by_type[t], len(rows), f"blockers — {t} (장 수)")

# 과목·회차별 repro
print("## 회차별 repro")
per = collections.defaultdict(collections.Counter)
for r in rows:
    key = f'{r.get("subject")}_{r.get("file","").split("_")[2] if len(r.get("file","").split("_"))>2 else "?"}'
    per[key][r.get("repro")] += 1
for k in sorted(per):
    c = per[k]
    n = sum(c.values())
    print(f"| {k} | {n} | full {c['full']} | partial {c['partial']} | none {c['none']} |")
