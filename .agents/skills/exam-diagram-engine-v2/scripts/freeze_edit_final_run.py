#!/usr/bin/env python3
"""Pin final benchmark data and the stabilized V2.2 engine before final generation."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


CORE_FILES = [
    ".agents/skills/exam-diagram-engine-v2/SKILL.md",
    ".agents/skills/exam-diagram-engine-v2/assets/edit-request.schema.json",
    ".agents/skills/exam-diagram-engine-v2/assets/edit-evaluation.schema.json",
    ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json",
    ".agents/skills/exam-diagram-engine-v2/assets/gray-mask.schema.json",
    ".agents/skills/exam-diagram-engine-v2/references/common-style.md",
    ".agents/skills/exam-diagram-engine-v2/references/instruction-edit.md",
    ".agents/skills/exam-diagram-engine-v2/references/subject-rules.md",
    ".agents/skills/exam-diagram-engine-v2/references/evaluation.md",
    ".agents/skills/exam-diagram-engine-v2/scripts/edit_engine.py",
    ".agents/skills/exam-diagram-engine-v2/scripts/compare_source.py",
    ".agents/skills/exam-diagram-engine-v2/scripts/flatten_gray_regions.py",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    data_freeze_path = root / "benchmarks/exam-diagram-engine-v2-2/FINAL_DATA_FREEZE.json"
    data_freeze = json.loads(data_freeze_path.read_text(encoding="utf-8"))
    rules = json.loads((root / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json").read_text(encoding="utf-8"))
    pinned = dict(data_freeze["pinned_files"])
    for relative in CORE_FILES:
        pinned[relative] = digest(root / relative)
    record = {
        "benchmark_version": "2.2.0",
        "rules_revision": rules["rules_revision"],
        "purpose": "Immutable engine and previously frozen final data for one-shot final validation.",
        "pinned_file_count": len(pinned),
        "pinned_files": dict(sorted(pinned.items())),
        "prohibition": "Do not change pinned files from final outcomes; changes require a new benchmark version."
    }
    target = root / "benchmarks/exam-diagram-engine-v2-2/FINAL_RUN_FREEZE.json"
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
