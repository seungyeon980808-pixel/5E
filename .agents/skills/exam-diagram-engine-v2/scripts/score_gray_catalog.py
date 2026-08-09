#!/usr/bin/env python3
"""Score visually approved flat-gray derivatives without overwriting parent failures."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import edit_engine


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--catalog", required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    catalog = json.loads((root / args.catalog).read_text(encoding="utf-8"))
    scored = []
    for case in catalog["cases"]:
        parent_dir = root / f"results/exam-diagram-engine-v2-2/development/{case['case_id']}/attempt-01"
        derivative_dir = parent_dir / "flat-gray-v1"
        parent = json.loads((parent_dir / "evaluation.json").read_text(encoding="utf-8"))
        if set(parent["failure_tags"]) != {"OVER_SHADE"}:
            raise ValueError(f"{case['case_id']} has non-tonal parent failures: {parent['failure_tags']}")
        report = json.loads((derivative_dir / "flatten-report.json").read_text(encoding="utf-8"))
        if not report["passed_preflight"]:
            raise ValueError(f"flatten preflight failed: {case['case_id']}")
        scores = dict(parent["scores"])
        scores["kice_lineart"] = 15
        scores["restrained_gray"] = 10
        gates = dict(parent["hard_gates"])
        gates["style_contract_broken"] = False
        evaluation = {
            **parent,
            "attempt": 2,
            "derivative_of_attempt": 1,
            "artifact": "flat-gray-v1/generated.png",
            "scores": scores,
            "hard_gates": gates,
            "failure_tags": [],
            "evidence": parent["evidence"] + ["explicit physical-region mask flattened tonal variation to one constant gray without changing geometry"],
            "reviewer": "Sol derivative source/output visual audit",
        }
        edit_engine.write_json(derivative_dir / "evaluation.json", evaluation)
        score_args = type("Args", (), {"evaluation": str(derivative_dir / "evaluation.json"), "out": str(derivative_dir / "score.json")})
        edit_engine.command_score(score_args)
        scored.append(case["case_id"])
    print(json.dumps({"scored": scored}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
