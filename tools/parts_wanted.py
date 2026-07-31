# -*- coding: utf-8 -*-
"""기출 도판 분해 결과(936장)에서 **그림 자산이 필요한 항목**만 뽑아 빈도순으로 정리한다.

왜: 수집 검색어를 사람이 지어내면 엉뚱한 게 섞인다(어제 'circuit' → F1 서킷 지도).
실제 기출에서 "이게 없어서 못 그린다"고 표시된 것만 모으면 헛수집이 없다.

읽는 것: docs/figure-atlas.jsonl(물리 483) · -c(화학 280) · -e(지구 104) · -b(생명 69)
쓰는 것: docs/PARTS_WANTED.md  — 수집 목록 초안
"""

import collections
import io
import json
import pathlib
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = pathlib.Path(__file__).resolve().parent
DOCS = HERE.parent / "docs"
FILES = {
    "물리": DOCS / "figure-atlas.jsonl",
    "화학": DOCS / "figure-atlas-c.jsonl",
    "지구": DOCS / "figure-atlas-e.jsonl",
    "생명": DOCS / "figure-atlas-b.jsonl",
}

# 그림(자산)이 필요한 부류인지 판정.
#  - type "illustration" : 사람·손·차량 등 — 애초에 그릴 물건이 아니다
#  - type "part" 중 유기적인 것 : 세포·기관·생물·지형 등 수치로 정의 안 되는 것
# 파라미터로 만들 수 있는 것(표·그래프·기호)은 제외 — 그건 코드로 만든다.
PARAMETRIC_HINT = (
    "table", "chart", "graph", "axis", "dash", "arrow", "brace", "legend", "grid",
    "dim_", "tick", "bar_", "dual_", "marker", "break", "pedigree", "punnett",
    "chromosome", "seq_", "band", "scale_", "symbol", "wiring", "layout",
)
ORGANIC_HINT = (
    "cell", "organ", "neuron", "muscle", "eye", "heart", "leaf", "flower", "plant",
    "bacteri", "virus", "animal", "person", "hand", "human", "body", "sperm", "egg",
    "bone", "skull", "brain", "vessel", "tissue", "membrane", "protein", "enzyme",
    "dna", "rna", "nucleic", "mito", "chloro", "landform", "mountain", "island",
    "rock", "strata", "volcano", "cloud", "wave_", "terrain", "map", "star", "planet",
    "moon", "sun", "galaxy", "telescope", "apparatus", "glassware", "burner",
    "flask", "beaker", "tube", "device", "instrument", "vehicle", "photo",
)


# ── 세 갈래로 나눈다. 이걸 안 나누면 "63건짜리 person"이 목록 1위로 올라와
#    이미 정해진 정책과 충돌한다.
#  가) 이미 만든 부품으로 해결됨 — 분해는 부품 제작 **이전** 스냅샷이라 그대로 믿으면 안 된다
#  나) 기출 크롭 정책 — docs/PARTS_PIPELINE.md: 손·사람은 그리지도 구하지도 말고 600dpi에서 오린다
#  다) 웹 수집 대상 — 남은 것
SOLVED = {  # 화학 vessel 타입(js/render/vessel.js)이 겨냥해 만든 항목들
    "vessel_round", "glassware", "syringe_piston", "stopcock", "tube", "tube_clamp",
    "gas_canister", "membrane", "shaded_apparatus",
}
CROP_POLICY = {  # 사람·물건 삽화 — 기출 PDF 600dpi 크롭
    "person", "vehicle", "hand", "speech_bubble", "blackboard", "lab_bench", "photo",
    "photo_image", "helmet", "desk", "food", "note_paper", "product_package",
    "campsite", "laptop", "smartwatch", "camera", "drone", "appliance", "whiteboard",
    "hammer", "chimney", "space_station", "spacecraft", "point_cloud", "dot_cloud",
}


def bucket(key):
    if key in SOLVED:
        return "가) 이미 해결"
    if key in CROP_POLICY:
        return "나) 기출 크롭"
    return "다) 웹 수집"


def wants_art(what, btype, note):
    w = (what or "").lower()
    n = (note or "").lower()
    if btype == "illustration":
        return True
    if "svgasset" in n or "자산" in n:
        return True
    if btype in ("assembly", "layout"):
        return False
    if any(k in w for k in PARAMETRIC_HINT):
        return False
    return any(k in w for k in ORGANIC_HINT)


def main():
    rows = []
    per_subject = collections.defaultdict(collections.Counter)
    figures = collections.defaultdict(set)
    notes = collections.defaultdict(collections.Counter)
    totals = {}

    for subj, path in FILES.items():
        if not path.exists():
            print(f"[{subj}] 파일 없음 — 건너뜀"); continue
        lines = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
        totals[subj] = len(lines)
        for r in lines:
            seen = set()
            for b in r.get("blockers", []) or []:
                what = (b.get("what") or "").strip()
                if not what:
                    continue
                btype = b.get("type") or "part"
                if not wants_art(what, btype, b.get("note")):
                    continue
                key = what.lower()
                if key in seen:
                    continue
                seen.add(key)
                per_subject[key][subj] += 1
                figures[key].add(f"{subj}:{r.get('file','?')}")
                if b.get("note"):
                    notes[key][b["note"][:60]] += 1

    for key, cnt in per_subject.items():
        rows.append((sum(cnt.values()), key, dict(cnt)))
    rows.sort(key=lambda x: (-x[0], x[1]))

    out = ["# 수집 목록 초안 — 그림 자산이 필요한 것 (PARTS_WANTED.md)", "",
           "> 기출 도판 분해 결과에서 **자동 추출**했다. 사람이 검색어를 지어내면 엉뚱한 것이",
           "> 섞이므로(예: 'circuit' → F1 서킷 지도), 실제 기출에서 '없어서 못 그린다'고",
           "> 표시된 항목만 모았다.", "",
           f"> 분해 대상: " + " · ".join(f"{k} {v}장" for k, v in totals.items()) +
           f" (합 {sum(totals.values())}장)", "",
           "| 갈래 | 항목 | 총 | 과목별 | 비고 |", "|---|---|---:|---|---|"]
    tally = collections.Counter()
    for total, key, cnt in rows:
        tally[bucket(key)] += total
    for total, key, cnt in rows:
        by = " ".join(f"{s}{n}" for s, n in sorted(cnt.items(), key=lambda x: -x[1]))
        note = notes[key].most_common(1)[0][0] if notes[key] else ""
        out.append(f"| {bucket(key)} | `{key}` | {total} | {by} | {note} |")
    out += ["", "## 갈래별 합계", ""]
    for b, n in sorted(tally.items()):
        out.append(f"- **{b}** — {n}건")
    out += ["", f"항목 {len(rows)}종 · 연관 도판 {len(set().union(*figures.values()) if figures else set())}장"]

    (DOCS / "PARTS_WANTED.md").write_text("\n".join(out), encoding="utf-8")
    print(f"항목 {len(rows)}종 추출 → docs/PARTS_WANTED.md")
    print("\n상위 25:")
    for total, key, cnt in rows[:25]:
        by = " ".join(f"{s}{n}" for s, n in sorted(cnt.items(), key=lambda x: -x[1]))
        print(f"  {total:3d}  {key:26s} {by}")


if __name__ == "__main__":
    main()
