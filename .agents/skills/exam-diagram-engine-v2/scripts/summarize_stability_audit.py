#!/usr/bin/env python3
"""Summarize repeated visual audits into raw and structure-only stability gates."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


STYLE_ONLY = {"OVER_SHADE", "MASK_REQUIRED"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", required=True)
    parser.add_argument("--audit", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    queue = json.loads(Path(args.queue).read_text(encoding="utf-8"))["queue"]
    audit = json.loads(Path(args.audit).read_text(encoding="utf-8"))
    expected = {(row["case_id"], int(row["repetition"])) for row in queue}
    observed = {(row["case_id"], int(row["repetition"])) for row in audit["cases"]}
    if expected != observed:
        raise ValueError(f"audit/queue mismatch: missing={sorted(expected-observed)}, extra={sorted(observed-expected)}")

    subjects = {row["case_id"]: row["subject"] for row in queue}
    grouped = defaultdict(list)
    tags = Counter()
    for row in audit["cases"]:
        failure_tags = set(row.get("failure_tags", []))
        tags.update(failure_tags)
        grouped[row["case_id"]].append({
            "repetition": row["repetition"],
            "raw_pass": not failure_tags,
            "structure_pass": failure_tags.issubset(STYLE_ONLY),
            "failure_tags": sorted(failure_tags),
        })
    cases = []
    subject_counts = defaultdict(Counter)
    for case_id, runs in sorted(grouped.items()):
        raw_passes = sum(run["raw_pass"] for run in runs)
        structure_passes = sum(run["structure_pass"] for run in runs)
        raw_stable = raw_passes >= 2
        structure_stable = structure_passes >= 2
        subject_counts[subjects[case_id]]["raw_stable" if raw_stable else "raw_unstable"] += 1
        subject_counts[subjects[case_id]]["structure_stable" if structure_stable else "structure_unstable"] += 1
        cases.append({"case_id": case_id, "subject": subjects[case_id], "raw_passes": raw_passes, "structure_passes": structure_passes, "raw_stable": raw_stable, "structure_stable": structure_stable, "runs": sorted(runs, key=lambda run: run["repetition"])})
    summary = {
        "reviewer": audit.get("reviewer"),
        "case_count": len(cases),
        "generation_count": len(audit["cases"]),
        "raw_stable_cases": sum(case["raw_stable"] for case in cases),
        "structure_stable_cases": sum(case["structure_stable"] for case in cases),
        "all_cases_two_of_three_raw_pass": all(case["raw_stable"] for case in cases),
        "all_cases_two_of_three_structure_pass": all(case["structure_stable"] for case in cases),
        "failure_tag_counts": dict(tags.most_common()),
        "by_subject": {subject: dict(counts) for subject, counts in sorted(subject_counts.items())},
        "cases": cases,
    }
    Path(args.out).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
