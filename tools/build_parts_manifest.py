# -*- coding: utf-8 -*-
"""부품 라이브러리 manifest 생성기.

기출 라이브러리(assets/exam-library/manifest.json + build_manifest.py)와 같은 구조다.
서버·API 없이 정적 파일만으로 도는 것이 요점.

읽는 것: assets/parts-library/svg/*.svg  +  같은 폴더의 meta.json(사람이 손보는 정보)
쓰는 것: assets/parts-library/manifest.json

meta.json 한 항목:
  { "id":"c_distillation", "subject":"c", "part":"실험 기구", "name":"증류 장치",
    "keywords":["증류","냉각관","플라스크"], "license":"Public domain",
    "source":"https://commons.wikimedia.org/wiki/File:..." }

manifest 는 여기에 파일 크기·요소 수 같은 **측정값**을 더해 만든다. 손으로 적는 정보와
기계가 재는 정보를 섞지 않아야 다시 돌려도 사람이 쓴 게 안 날아간다.
"""

import io
import json
import pathlib
import re
import sys
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
LIB = HERE.parent / "assets" / "parts-library"
SVG_DIR = LIB / "svg"

SUBJECT_LABEL = {"p": "물리", "c": "화학", "b": "생명", "e": "지구", "x": "공통"}

# 요소 수는 "이 그림이 얼마나 복잡한가"의 대용치 — 위계 기본값을 고를 때 쓴다.
DRAW_RE = re.compile(r"<(path|circle|ellipse|rect|polygon|polyline|line)\b")


def main():
    meta_path = LIB / "meta.json"
    if not meta_path.exists():
        print("meta.json 이 없다 — 먼저 만들어야 한다"); return 1
    meta = {m["id"]: m for m in json.loads(meta_path.read_text(encoding="utf-8"))}

    # harvest.json 은 수집기(harvest_parts.py)가 쓴 것 — 기계가 모은 정보.
    # meta.json 과 겹치면 **사람이 적은 쪽이 이긴다.** 손으로 고친 게 재생성으로 날아가면 안 된다.
    harvest_path = LIB / "harvest.json"
    harvest = {}
    if harvest_path.exists():
        harvest = {h["id"]: h for h in json.loads(harvest_path.read_text(encoding="utf-8"))}

    # 골라내기(tools/triage) 결과가 있으면 반영한다 — X 한 것, 자동 분류에서 떨어진 것,
    # 닮은 그림의 대표가 아닌 것을 빼고 만든다. 결과가 없으면 전부 넣는다(예전 그대로).
    tri = HERE.parent / "_work" / "triage"
    drop, reason = set(), {}
    if (tri / "marks.json").exists():
        for name, m in json.loads((tri / "marks.json").read_text(encoding="utf-8")).items():
            if m.get("mark") == "X":
                drop.add(name); reason[name] = "X"
    if (tri / "clusters.json").exists():
        cl = json.loads((tri / "clusters.json").read_text(encoding="utf-8"))
        for lead, members in cl.items():
            for name in members:
                if name != lead and name not in drop:
                    drop.add(name); reason[name] = "중복"
    if (tri / "grades.json").exists():
        # 자동 1차 분류에서 A 를 못 받은 것(구조식·회로도·규격기호·색면·너무 단순)은 뺀다
        for name, g in json.loads((tri / "grades.json").read_text(encoding="utf-8")).items():
            if g != "A" and name not in drop:
                drop.add(name); reason[name] = f"{g}등급"
    if (tri / "scores.json").exists():
        sc = json.loads((tri / "scores.json").read_text(encoding="utf-8"))
        for name, v in sc.items():
            if v.get("fail") and name not in drop:
                drop.add(name); reason[name] = "안그려짐"

    # 사람이 골라낸 것은 자동 분류를 이긴다 — meta.json 과 같은 원칙이다.
    # 수집 페이지에서 직접 고른 그림이 "중복"·"F등급" 같은 자동 판정에 걸려 사라지면 안 된다.
    keep_path = LIB / "keep.json"
    if keep_path.exists():
        keep = set(json.loads(keep_path.read_text(encoding="utf-8")))
        back = drop & keep
        drop -= keep
        if back:
            print(f"  사람이 고른 것 {len(back)}장은 자동 판정을 무시하고 남긴다")

    items, missing, orphan = [], [], []
    for f in sorted(SVG_DIR.glob("*.svg")):
        pid = f.stem
        if f.name in drop:
            continue
        h = harvest.get(pid, {})
        m = {**h, **meta.get(pid, {})} if (h or pid in meta) else None
        if not m:
            orphan.append(pid)
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        subj = m.get("subject", "x")
        items.append({
            "id": pid,
            "file": f.name,
            "subject": subj,
            "subjectLabel": SUBJECT_LABEL.get(subj, "공통"),
            "part": m.get("part", "기타"),
            "name": m.get("name", pid),
            "keywords": m.get("keywords", []),
            # Commons 카테고리 원문. 한글 keywords 와 **함께** 색인해서
            # 한글로도 영문 카테고리로도 찾히게 한다.
            "sourceTags": m.get("sourceTags", []),
            "license": m.get("license", "unknown"),
            "source": m.get("source", ""),
            "elements": len(DRAW_RE.findall(text)),   # 복잡도 — 위계 기본값 힌트
            "bytes": f.stat().st_size,
            "defaultLevel": m.get("defaultLevel", "L2"),
        })
    for pid in meta:
        if not (SVG_DIR / f"{pid}.svg").exists():
            missing.append(pid)

    parts = sorted({it["part"] for it in items})
    subjects = sorted({it["subject"] for it in items})
    out = {
        "version": 1,
        "generated": date.today().isoformat(),
        "count": len(items),
        "subjects": subjects,
        "parts": parts,
        "items": items,
    }
    (LIB / "manifest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"manifest {len(items)}건 생성 → assets/parts-library/manifest.json")
    if drop:
        import collections as _c
        why = _c.Counter(reason.values())
        print(f"  뺀 것 {len(drop)}장 — " + " · ".join(f"{k} {v}" for k, v in why.most_common()))
    by = {}
    for it in items:
        by.setdefault(it["subjectLabel"], []).append(it)
    for k, v in sorted(by.items()):
        print(f"  {k} {len(v)}건 — " + ", ".join(x["name"] for x in v[:6]))
    if orphan:
        print(f"  ⚠ meta.json 에 설명이 없는 파일: {', '.join(orphan)}")
    if missing:
        print(f"  ⚠ 설명만 있고 파일이 없는 항목: {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
