#!/usr/bin/env python3
"""Create a data-only freeze that remains valid while development rules evolve."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    benchmark = root / "benchmarks/exam-diagram-engine-v2-2"
    manifest = json.loads((benchmark / "final.json").read_text(encoding="utf-8"))
    files = [benchmark / "final.json"] + [benchmark / relative for relative in manifest["cases"]]
    requests = [json.loads(path.read_text(encoding="utf-8")) for path in files[1:]]
    files += sorted({root / request["source_image"] for request in requests})
    pinned = {str(path.relative_to(root)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    record = {
        "benchmark_version": "2.2.0",
        "purpose": "Pin final case contracts and source inputs before development; engine files are pinned later in FINAL_RUN_FREEZE.json.",
        "pinned_file_count": len(pinned),
        "pinned_files": pinned,
        "prohibition": "Do not modify final contracts or sources from development findings."
    }
    target = benchmark / "FINAL_DATA_FREEZE.json"
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
