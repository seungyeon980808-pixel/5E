#!/usr/bin/env python3
"""Return one compiled generation payload from a V2.2 queue."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--split", choices=["development", "final"], default="development")
    parser.add_argument("--case-id")
    parser.add_argument("--attempt", type=int, default=1)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    queue_path = root / f"results/exam-diagram-engine-v2-2/{args.split}/generation-queue.json"
    queue = json.loads(queue_path.read_text(encoding="utf-8"))["queue"]
    candidates = [item for item in queue if args.case_id is None or item["case_id"] == args.case_id]
    if args.case_id and not candidates:
        raise SystemExit(f"unknown case: {args.case_id}")
    def attempt_item(item):
        if args.attempt == 1:
            return item
        result = dict(item)
        case_root = root / f"results/exam-diagram-engine-v2-2/{args.split}/{item['case_id']}/attempt-{args.attempt:02d}"
        result["prompt"] = str((case_root / "prompt.txt").relative_to(root)).replace("\\", "/")
        result["output"] = str((case_root / "generated.png").relative_to(root)).replace("\\", "/")
        return result
    candidates = [attempt_item(item) for item in candidates]
    selected = next((item for item in candidates if not (root / item["output"]).exists()), None)
    if selected is None:
        print(json.dumps({"complete": True, "split": args.split}, ensure_ascii=False))
        return 0
    payload = {
        **selected,
        "source_image": str((root / selected["source_image"]).resolve()),
        "output": str((root / selected["output"]).resolve()),
        "prompt_text": (root / selected["prompt"]).read_text(encoding="utf-8"),
        "complete": False,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
