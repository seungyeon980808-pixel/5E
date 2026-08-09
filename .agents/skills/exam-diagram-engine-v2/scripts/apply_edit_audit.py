#!/usr/bin/env python3
"""Materialize a human/Sol visual audit into per-attempt evaluations and scores."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import edit_engine


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--audit", required=True)
    parser.add_argument("--split", default="development")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    audit = json.loads((root / args.audit).read_text(encoding="utf-8"))
    written = []
    for row in audit["cases"]:
        attempt_dir = root / f"results/exam-diagram-engine-v2-2/{args.split}/{row['case_id']}/attempt-{row.get('attempt', 1):02d}"
        artifact_dir = attempt_dir / row.get("artifact_dir", "")
        request_path = attempt_dir / "edit-request.json"
        if not request_path.exists():
            request_path = root / f"results/exam-diagram-engine-v2-2/{args.split}/{row['case_id']}/attempt-01/edit-request.json"
        request = json.loads(request_path.read_text(encoding="utf-8"))
        tags = row.get("failure_tags", [])
        scores = row.get("scores") or {"core_structure": 25, "scientific_accuracy": 20, "proportion_layout": 15, "kice_lineart": 15, "restrained_gray": 10, "no_forbidden_marks": 10, "editability": 5}
        if not row.get("scores"):
            if any(tag in tags for tag in ("STRUCTURE_LOSS", "TOPOLOGY_LOSS", "EDIT_NOT_APPLIED")):
                scores["core_structure"] = 18
            if "SCIENCE_ERROR" in tags:
                scores["scientific_accuracy"] = 12
            if any(tag in tags for tag in ("RATIO_LAYOUT", "SOURCE_DRIFT", "EDIT_OVERREACH")):
                scores["proportion_layout"] = 9
            if "OVER_SHADE" in tags:
                scores["restrained_gray"] = 2
                scores["kice_lineart"] = 12
        gates = {
            "requested_changes_complete": "EDIT_NOT_APPLIED" not in tags,
            "locked_invariants_preserved": not any(tag in tags for tag in ("STRUCTURE_LOSS", "TOPOLOGY_LOSS", "SCIENCE_ERROR", "SOURCE_DRIFT", "EDIT_OVERREACH")),
            "severe_science_error": False,
            "forbidden_mark_count": 0,
            "unlisted_object_count": 0,
            "critical_structure_broken": any(tag in tags for tag in ("STRUCTURE_LOSS", "TOPOLOGY_LOSS")),
            "style_contract_broken": "OVER_SHADE" in tags,
            "category_encoding_valid": not any(tag in tags for tag in ("CATEGORY_ENCODING", "CATEGORY_COLLAPSE")),
        }
        gates.update(row.get("hard_gates", {}))
        evaluation = {
            "case_id": row["case_id"],
            "attempt": row.get("result_attempt", row.get("attempt", 1)),
            "subject": request["subject"],
            "operations": [operation["type"] for operation in request["operations"]],
            "scores": scores,
            "hard_gates": gates,
            "failure_tags": tags,
            "evidence": row["evidence"],
            "reviewer": audit.get("reviewer", "Sol visual audit"),
            "artifact": row.get("artifact", "generated.png"),
        }
        if row.get("source_comparison"):
            evaluation["source_comparison"] = row["source_comparison"]
        edit_engine.write_json(artifact_dir / "evaluation.json", evaluation)
        score_args = type("Args", (), {"evaluation": str(artifact_dir / "evaluation.json"), "out": str(artifact_dir / "score.json")})
        edit_engine.command_score(score_args)
        written.append(row["case_id"])
    print(json.dumps({"written": written}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
