#!/usr/bin/env python3
"""Verify every file pinned by the V2.2 final benchmark freeze."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--freeze", default="benchmarks/exam-diagram-engine-v2-2/FINAL_RUN_FREEZE.json")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    freeze_path = root / args.freeze
    freeze = json.loads(freeze_path.read_text(encoding="utf-8"))
    mismatches = []
    for relative, expected in freeze["pinned_files"].items():
        path = root / relative
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        if actual != expected:
            mismatches.append({"path": relative, "expected": expected, "actual": actual})
    result = {"pinned_file_count": len(freeze["pinned_files"]), "mismatch_count": len(mismatches), "mismatches": mismatches, "passed": not mismatches}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
