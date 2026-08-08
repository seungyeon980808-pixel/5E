#!/usr/bin/env python3
"""Freeze the untouched V2.1 final vector benchmark before final rendering."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--root",default=".")
    root=Path(parser.parse_args().root).resolve(); benchmark=root/"benchmarks"/"exam-diagram-engine-v2-1"
    development_path=benchmark/"development.json"; final_path=benchmark/"final.json"
    development=json.loads(development_path.read_text(encoding="utf-8")); final=json.loads(final_path.read_text(encoding="utf-8"))
    final["frozen"]=True; write(final_path,final)
    pinned=[
        root/".agents/skills/exam-diagram-engine-v2/scripts/vector_renderer.py",
        root/".agents/skills/exam-diagram-engine-v2/assets/vector-scene.schema.json",
        root/".agents/skills/exam-diagram-engine-v2/references/common-style.md",
        root/".agents/skills/exam-diagram-engine-v2/references/input-modes.md",
        root/".agents/skills/exam-diagram-engine-v2/references/subject-rules.md",
        final_path,
    ]
    for case in final["cases"]:
        pinned.append(benchmark/case["scene_contract"])
        if case.get("input_asset"): pinned.append(benchmark/case["input_asset"])
    hashes={str(path.relative_to(root)).replace("\\","/"):digest(path) for path in pinned}
    mode_counts={mode:sum(case["input_mode"]==mode for case in development["cases"]+final["cases"]) for mode in ("reference_image","description_only","sketch_plus_description")}
    subject_counts={subject:sum(case["subject"]==subject for case in development["cases"]+final["cases"]) for subject in ("physics","chemistry","biology","earth_science")}
    lock={"benchmark":"exam-diagram-engine-v2-1","version":"2.1.0","development_sha256":digest(development_path),"final_sha256":digest(final_path),"development_cases":len(development["cases"]),"final_cases":len(final["cases"]),"combined_input_modes":mode_counts,"combined_subjects":subject_counts}
    freeze={"benchmark":"exam-diagram-engine-v2-1","version":"2.1.0","frozen_at":datetime.now(timezone.utc).isoformat(),"policy":"No renderer, specification, scene contract, input asset, or manifest change after this record. Final failures are evaluation-only.","hashes":hashes}
    write(benchmark/"LOCK.json",lock); write(benchmark/"FINAL_FREEZE.json",freeze)
    print(json.dumps(lock,ensure_ascii=False,indent=2))


if __name__=="__main__": main()
