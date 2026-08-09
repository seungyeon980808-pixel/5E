#!/usr/bin/env python3
"""Compile one immutable prompt into repeated stability-run payloads."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import edit_engine


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--rules", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    manifest_path = (root / args.manifest).resolve()
    manifest = edit_engine.read_json(manifest_path)
    rules = edit_engine.read_json(root / args.rules)
    repetitions = int(manifest["repetitions"])
    if repetitions < 2:
        raise ValueError("stability runs require at least two repetitions")

    out_root = root / args.out
    queue = []
    for relative in manifest["cases"]:
        request_path = manifest_path.parent / relative
        request = edit_engine.read_json(request_path)
        errors, warnings = edit_engine.validate_request(request, rules)
        if errors:
            raise ValueError(f"{request['case_id']}: {'; '.join(errors)}")
        prompt = edit_engine.compile_prompt(request, rules)
        prompt_sha = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        for repetition in range(1, repetitions + 1):
            run_dir = out_root / request["case_id"] / f"run-{repetition:02d}"
            run_dir.mkdir(parents=True, exist_ok=True)
            edit_engine.write_json(run_dir / "edit-request.json", request)
            (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
            edit_engine.write_json(run_dir / "prompt.json", {
                "engine_version": edit_engine.ENGINE_VERSION,
                "rules_revision": rules["rules_revision"],
                "case_id": request["case_id"],
                "repetition": repetition,
                "prompt_sha256": prompt_sha,
                "compiled_at": datetime.now(timezone.utc).isoformat(),
                "prompt": prompt,
            })
            edit_engine.write_json(run_dir / "preflight.json", {
                "passed": True,
                "case_id": request["case_id"],
                "rules_revision": rules["rules_revision"],
                "warnings": warnings,
            })
            queue.append({
                "case_id": request["case_id"],
                "subject": request["subject"],
                "repetition": repetition,
                "source_image": request["source_image"],
                "prompt": str((run_dir / "prompt.txt").relative_to(root)).replace("\\", "/"),
                "output": str((run_dir / "generated.png").relative_to(root)).replace("\\", "/"),
                "prompt_sha256": prompt_sha,
            })

    payload = {
        "benchmark_version": manifest["benchmark_version"],
        "rules_revision": rules["rules_revision"],
        "case_count": len(manifest["cases"]),
        "repetitions": repetitions,
        "generation_count": len(queue),
        "queue": queue,
    }
    edit_engine.write_json(out_root / "generation-queue.json", payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
