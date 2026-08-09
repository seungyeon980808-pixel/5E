#!/usr/bin/env python3
"""Prepare identical repeated prompts for targeted stability corrections."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import edit_engine


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--rules", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    catalog = edit_engine.read_json(root / args.catalog)
    rules = edit_engine.read_json(root / args.rules)
    parent = edit_engine.read_json(root / catalog["parent_queue"])["queue"]
    parent_by_case = {}
    for item in parent:
        parent_by_case.setdefault(item["case_id"], item)
    queue = []
    for correction in catalog["cases"]:
        item = parent_by_case[correction["case_id"]]
        request = edit_engine.read_json((root / item["prompt"]).with_name("edit-request.json"))
        base_prompt = edit_engine.compile_prompt(request, rules)
        prompt = base_prompt + f"""

TARGETED CORRECTION FOR THIS STABILITY REVISION
Observed repeated failure: {correction['observed_failure']}
Make exactly this corrective change: {correction['single_change']}.
Retain every other requested operation, source inventory item, locked invariant, and forbidden-mark rule above.
"""
        prompt_sha = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        for repetition in range(1, int(catalog["repetitions"]) + 1):
            run_dir = root / args.out / correction["case_id"] / f"run-{repetition:02d}"
            run_dir.mkdir(parents=True, exist_ok=True)
            edit_engine.write_json(run_dir / "edit-request.json", request)
            edit_engine.write_json(run_dir / "correction.json", correction)
            (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
            edit_engine.write_json(run_dir / "prompt.json", {"case_id": correction["case_id"], "repetition": repetition, "rules_revision": rules["rules_revision"], "prompt_sha256": prompt_sha, "prompt": prompt})
            queue.append({"case_id": correction["case_id"], "subject": request["subject"], "repetition": repetition, "source_image": request["source_image"], "prompt": str((run_dir / "prompt.txt").relative_to(root)).replace("\\", "/"), "output": str((run_dir / "generated.png").relative_to(root)).replace("\\", "/"), "prompt_sha256": prompt_sha})
    payload = {"rules_revision": rules["rules_revision"], "case_count": len(catalog["cases"]), "repetitions": catalog["repetitions"], "generation_count": len(queue), "queue": queue}
    edit_engine.write_json(root / args.out / "generation-queue.json", payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
