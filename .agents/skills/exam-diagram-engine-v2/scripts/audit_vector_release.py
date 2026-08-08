#!/usr/bin/env python3
"""Audit every explicit V2.1 release gate from repository evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


def read(path): return json.loads(Path(path).read_text(encoding="utf-8-sig"))
def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--root",default="."); parser.add_argument("--out"); args=parser.parse_args(); root=Path(args.root).resolve(); benchmark=root/"benchmarks"/"exam-diagram-engine-v2-1"; results=root/"results"/"exam-diagram-engine-v2-1"
    development=read(benchmark/"development.json"); final=read(benchmark/"final.json"); freeze=read(benchmark/"FINAL_FREEZE.json"); stability=read(results/"stability-summary.json"); errors=[]
    combined=development["cases"]+final["cases"]
    mode_counts=Counter(case["input_mode"] for case in combined); subject_counts=Counter(case["subject"] for case in combined)
    if len(development["cases"])!=36 or len(final["cases"])!=24: errors.append("benchmark split must be 36 development and 24 final")
    if set(mode_counts.values())!={20}: errors.append("each input mode must have 20 combined cases")
    if set(subject_counts.values())!={15}: errors.append("each subject must have 15 combined cases")
    mismatches=[]
    for relative,expected in freeze["hashes"].items():
        path=root/relative; actual=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        if actual!=expected: mismatches.append(relative)
    if mismatches: errors.append("frozen artifact mismatch: "+", ".join(mismatches))
    records=[]
    for case in final["cases"]:
        directory=results/"final"/case["case_id"]/"attempt-01"
        required=("scene.json","generated.png","validation.json","render.json","evaluation.json","score.json","image-metrics.json")
        missing=[name for name in required if not (directory/name).exists()]
        if missing: errors.append(case["case_id"]+" missing "+", ".join(missing)); continue
        score=read(directory/"score.json"); evaluation=read(directory/"evaluation.json")
        records.append({"case_id":case["case_id"],"input_mode":case["input_mode"],"subject":case["subject"],"passed":score["verdict"]=="PASS","severe":evaluation["hard_gates"]["severe_science_error"],"forbidden":evaluation["hard_gates"]["forbidden_mark_count"]})
    def group(field):
        grouped=defaultdict(list)
        for record in records: grouped[record[field]].append(record)
        return {name:{"passed":sum(item["passed"] for item in items),"total":len(items),"pass_rate":sum(item["passed"] for item in items)/len(items)} for name,items in grouped.items()}
    overall=sum(record["passed"] for record in records)/len(records) if records else 0; modes=group("input_mode"); subjects=group("subject")
    if overall<0.85: errors.append("overall final pass rate below 85%")
    if any(item["pass_rate"]<0.80 for item in modes.values()): errors.append("an input mode is below 80%")
    if any(item["pass_rate"]<0.80 for item in subjects.values()): errors.append("a subject is below 80%")
    if any(record["severe"] for record in records): errors.append("severe scientific error present")
    if any(record["passed"] and record["forbidden"] for record in records): errors.append("passing output contains forbidden marks")
    if stability["representative_hard_cases"]!=12 or not stability["gate_passed"]: errors.append("12-case stability gate failed")
    manual=read(results/"final-manual-visual-audit.json")
    if manual["overall_verdict"]!="PASS" or manual["severe_science_errors"]!=0: errors.append("manual visual/science audit failed")
    report={"engine_version":"2.1.0","passed":not errors,"errors":errors,"benchmark":{"development":len(development["cases"]),"final":len(final["cases"]),"combined_input_modes":dict(mode_counts),"combined_subjects":dict(subject_counts)},"final":{"evaluated":len(records),"passed":sum(record["passed"] for record in records),"pass_rate":overall,"by_input_mode":modes,"by_subject":subjects,"severe_science_errors":sum(record["severe"] for record in records),"passing_with_forbidden_marks":sum(record["passed"] and record["forbidden"] for record in records)},"stability":{"representative_hard_cases":stability["representative_hard_cases"],"gate_passed":stability["gate_passed"],"all_byte_identical":stability["all_byte_identical"]},"freeze":{"checked":len(freeze["hashes"]),"mismatches":mismatches},"manual_audit":manual["overall_verdict"]}
    output=Path(args.out) if args.out else results/"completion-audit.json"; output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); print(json.dumps(report,ensure_ascii=False,indent=2)); raise SystemExit(0 if not errors else 1)


if __name__=="__main__": main()
