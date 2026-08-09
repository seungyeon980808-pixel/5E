#!/usr/bin/env python3
"""Compile benchmark requests and emit a generator queue without running a model."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import edit_engine


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--split", choices=["development", "final"], default="development")
    parser.add_argument("--allow-final", action="store_true")
    args = parser.parse_args()
    if args.split == "final" and not args.allow_final:
        raise SystemExit("refusing to prepare frozen final without --allow-final")
    root = Path(args.root).resolve()
    benchmark = root / "benchmarks/exam-diagram-engine-v2-2"
    manifest = json.loads((benchmark / f"{args.split}.json").read_text(encoding="utf-8"))
    rules_path = root / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json"
    rules = json.loads(rules_path.read_text(encoding="utf-8"))
    result_root = root / f"results/exam-diagram-engine-v2-2/{args.split}"
    queue, failures = [], []
    for relative in manifest["cases"]:
        request_path = benchmark / relative
        request = json.loads(request_path.read_text(encoding="utf-8"))
        errors, warnings = edit_engine.validate_request(request, rules)
        out_dir = result_root / request["case_id"] / "attempt-01"
        out_dir.mkdir(parents=True, exist_ok=True)
        preflight = {
            "engine_version": edit_engine.ENGINE_VERSION,
            "rules_revision": rules["rules_revision"],
            "case_id": request["case_id"],
            "passed": not errors,
            "errors": errors,
            "warnings": warnings,
            "request_sha256": edit_engine.digest(request),
            "rules_sha256": edit_engine.digest(rules),
        }
        write_json(out_dir / "preflight.json", preflight)
        write_json(out_dir / "edit-request.json", request)
        if errors:
            failures.append({"case_id": request["case_id"], "errors": errors})
            continue
        prompt = edit_engine.compile_prompt(request, rules)
        (out_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
        write_json(out_dir / "prompt.json", {
            "engine_version": edit_engine.ENGINE_VERSION,
            "rules_revision": rules["rules_revision"],
            "case_id": request["case_id"],
            "request_sha256": edit_engine.digest(request),
            "rules_sha256": edit_engine.digest(rules),
            "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
            "compiled_at": datetime.now(timezone.utc).isoformat(),
            "prompt": prompt,
        })
        queue.append({
            "case_id": request["case_id"],
            "subject": request["subject"],
            "scenario_family": request["scenario_family"],
            "source_image": request["source_image"],
            "request": str(request_path.relative_to(root)).replace("\\", "/"),
            "prompt": str((out_dir / "prompt.txt").relative_to(root)).replace("\\", "/"),
            "output": str((out_dir / "generated.png").relative_to(root)).replace("\\", "/"),
        })
    queue_record = {"split": args.split, "case_count": len(queue), "failures": failures, "queue": queue}
    write_json(result_root / "generation-queue.json", queue_record)
    print(json.dumps({"compiled": len(queue), "failures": failures, "queue_path": str(result_root / "generation-queue.json")}, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
