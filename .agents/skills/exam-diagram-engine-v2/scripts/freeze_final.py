#!/usr/bin/env python3
"""Pin final manifests, input assets, prompts, and engine/spec files before evaluation."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    root = Path(__file__).resolve().parents[4]
    benchmark = root / "benchmarks" / "exam-diagram-engine-v2"
    results = root / "results" / "exam-diagram-engine-v2" / "final"
    final_path = benchmark / "final.json"
    final = json.loads(final_path.read_text(encoding="utf-8"))
    spec_paths = [
        root / ".agents/skills/exam-diagram-engine-v2/SKILL.md",
        root / ".agents/skills/exam-diagram-engine-v2/references/common-style.md",
        root / ".agents/skills/exam-diagram-engine-v2/references/input-modes.md",
        root / ".agents/skills/exam-diagram-engine-v2/references/subject-rules.md",
        root / ".agents/skills/exam-diagram-engine-v2/scripts/engine.py",
        root / ".agents/skills/exam-diagram-engine-v2/scripts/prepare_benchmark_runs.py",
    ]
    assets = {}
    prompts = {}
    for case in final["cases"]:
        if case.get("input_asset"):
            asset = benchmark / case["input_asset"]
            assets[case["input_asset"]] = digest(asset)
        prompt = results / case["case_id"] / "attempt-01" / "prompt.txt"
        prompts[case["case_id"]] = digest(prompt)
    record = {
        "benchmark_version": final["benchmark_version"],
        "engine_version": "2.0.0",
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "policy": "Evaluation-only: final outputs cannot change V2 prompts, specifications, or scoring rules.",
        "final_manifest_sha256": digest(final_path),
        "input_assets": dict(sorted(assets.items())),
        "compiled_prompts": dict(sorted(prompts.items())),
        "engine_and_spec_files": {
            str(path.relative_to(root)).replace("\\", "/"): digest(path)
            for path in spec_paths
        },
    }
    target = benchmark / "FINAL_FREEZE.json"
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
