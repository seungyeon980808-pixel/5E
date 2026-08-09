#!/usr/bin/env python3
"""Compile and evaluate reference-guided KICE science diagram edits."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ENGINE_VERSION = "2.2.0"
SUBJECTS = {"physics", "chemistry", "biology", "earth_science"}
OPERATIONS = {"style_cleanup", "move", "resize", "reorder", "duplicate", "delete", "replace_state", "connect", "disconnect"}
SCORE_MAX = {
    "core_structure": 25,
    "scientific_accuracy": 20,
    "proportion_layout": 15,
    "kice_lineart": 15,
    "restrained_gray": 10,
    "no_forbidden_marks": 10,
    "editability": 5,
}
EDIT_FAILURE_TAGS = {
    "EDIT_NOT_APPLIED", "EDIT_OVERREACH", "TARGET_AMBIGUITY", "SOURCE_DRIFT",
    "STRUCTURE_LOSS", "SCIENCE_ERROR", "TOPOLOGY_LOSS", "CATEGORY_ENCODING",
    "RATIO_LAYOUT", "OVER_SHADE", "3DIFICATION", "EXTRA_TEXT_SYMBOL",
    "EXTRA_CONTEXT", "EDIT_UNSUITABLE", "MODEL_VARIANCE", "MASK_REQUIRED", "BENCHMARK_DEFECT",
    "CATEGORY_COLLAPSE", "TEXT_RESIDUE",
}


def read_json(path: str | Path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path: str | Path, value) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def validate_request(request: dict, rules: dict) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    required = [
        "case_id", "split", "subject", "source_image", "user_instruction",
        "source_inventory", "operations", "locked_invariants",
        "expected_assertions", "allowed_gray_regions",
    ]
    for key in required:
        if key not in request:
            errors.append(f"missing required field: {key}")
    if errors:
        return errors, warnings
    if request["subject"] not in SUBJECTS:
        errors.append(f"invalid subject: {request['subject']}")
    source = Path(request["source_image"])
    if not source.is_file():
        errors.append(f"source image does not exist: {source}")
    if not request["source_inventory"]:
        errors.append("source_inventory must not be empty")
    if len(request["source_inventory"]) != len(set(request["source_inventory"])):
        errors.append("source_inventory entries must be unique")
    if not request["operations"]:
        errors.append("at least one operation is required; use style_cleanup for style-only conversion")
    for index, operation in enumerate(request["operations"]):
        op_type = operation.get("type")
        if op_type not in OPERATIONS:
            errors.append(f"operations[{index}] has unsupported type: {op_type}")
        if not operation.get("target") or not operation.get("change"):
            errors.append(f"operations[{index}] needs target and change")
    if request.get("critical_uncertainties"):
        errors.append("critical uncertainties must be resolved before generation")
    spatial = request.get("spatial_contract")
    if spatial:
        for mask_kind in ("edit_masks", "annotation_masks"):
            for index, box in enumerate(spatial.get(mask_kind, [])):
                if not isinstance(box, list) or len(box) != 4 or any(not isinstance(value, (int, float)) or not 0 <= value <= 1 for value in box):
                    errors.append(f"spatial_contract.{mask_kind}[{index}] must contain four normalized numbers")
                elif box[0] >= box[2] or box[1] >= box[3]:
                    errors.append(f"spatial_contract.{mask_kind}[{index}] must satisfy left < right and top < bottom")
    if len(request["operations"]) > 1:
        warnings.append("multiple operations increase edit drift; stage independent changes when possible")
    allowed = set(rules.get("operation_rules", {}))
    missing = sorted({op["type"] for op in request["operations"]} - allowed)
    if missing:
        errors.append("ruleset has no directives for: " + ", ".join(missing))
    return errors, warnings


def compile_prompt(request: dict, rules: dict) -> str:
    inventory = "\n".join(f"- {item}" for item in request["source_inventory"])
    operations = "\n".join(
        f"- {index}. {op['type']} on [{op['target']}]: {op['change']}\n"
        f"  Operation guardrail: {rules['operation_rules'][op['type']]}"
        for index, op in enumerate(request["operations"], 1)
    )
    locks = "\n".join(f"- {item}" for item in request["locked_invariants"])
    assertions = "\n".join(f"- {item}" for item in request["expected_assertions"])
    annotations = ", ".join(request.get("source_annotations_to_remove", [])) or "none beyond the mandatory forbidden marks"
    gray = ", ".join(request["allowed_gray_regions"]) or "none"
    global_rules = "\n".join(f"- {item}" for item in rules["global"])
    forbidden = ", ".join(rules["mandatory_forbidden"])
    subject_guardrail = {
        "physics": "Preserve terminal endpoints, junction/crossing semantics, continuity, contact state, and shared geometry across state panels.",
        "chemistry": "Preserve vessel openings, liquid boundaries, stoppers, support order, and tube endpoints; add no common lab accessories.",
        "biology": "Preserve visible compartments, lumens, branches, and comparison master geometry; do not convert repeated anatomy into texture.",
        "earth_science": "Preserve layer count, order, contacts, offsets, crops, and boundary endpoints; add no terrain texture or atmospheric effects.",
    }[request["subject"]]
    return f"""Use case: precise-object-edit
Asset type: label-free Korean KICE assessment science diagram for later 5E editing

PRIMARY RULE
Edit the supplied source image itself. Change only the requested properties. Everything else is locked.

USER INSTRUCTION
{request['user_instruction']}

SOURCE AUTHORITY
{global_rules}

CLOSED SOURCE INVENTORY
{inventory}
No scientific object outside this inventory may appear unless a duplicate operation explicitly authorizes it.

REQUESTED ATOMIC CHANGES
{operations}

LOCKED INVARIANTS
{locks}

EXPECTED POST-EDIT ASSERTIONS
{assertions}

SUBJECT GUARDRAIL
{subject_guardrail}

STYLE CLEANUP
- Pure white background and clean black two-dimensional linework.
- White interiors by default; uniform flat gray only in: {gray}.
- Remove these source annotations: {annotations}.
- Preserve the cleared annotation areas as empty space.
- No lighting, highlights, reflections, shadows, gradients, texture, decorative hatching, or excessive perspective.
- Leave clear margins and separable shapes for later 5E labels.

ZERO-TOLERANCE NEGATIVES
- Generate exactly zero of: {forbidden}.
- Do not improve, redesign, complete, substitute, or scientifically embellish the apparatus.
- Change only the requested properties. Preserve every other source property.
"""


def command_compile(args) -> int:
    request, rules = read_json(args.request), read_json(args.rules)
    errors, warnings = validate_request(request, rules)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    preflight = {
        "engine_version": ENGINE_VERSION,
        "rules_revision": rules.get("rules_revision"),
        "case_id": request.get("case_id"),
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "request_sha256": digest(request),
        "rules_sha256": digest(rules),
    }
    write_json(out_dir / "preflight.json", preflight)
    write_json(out_dir / "edit-request.json", request)
    if errors:
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 2
    prompt = compile_prompt(request, rules)
    (out_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    write_json(out_dir / "prompt.json", {
        **{key: preflight[key] for key in ("engine_version", "rules_revision", "case_id", "request_sha256", "rules_sha256")},
        "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "compiled_at": datetime.now(timezone.utc).isoformat(),
        "prompt": prompt,
    })
    print(out_dir / "prompt.txt")
    return 0


def command_score(args) -> int:
    evaluation = read_json(args.evaluation)
    errors = []
    scores = evaluation.get("scores", {})
    for key, maximum in SCORE_MAX.items():
        value = scores.get(key)
        if not isinstance(value, (int, float)) or math.isnan(value) or not 0 <= value <= maximum:
            errors.append(f"score {key} must be between 0 and {maximum}")
    gates = evaluation.get("hard_gates", {})
    required_gates = [
        "requested_changes_complete", "locked_invariants_preserved", "severe_science_error",
        "forbidden_mark_count", "unlisted_object_count", "critical_structure_broken",
    ]
    for key in required_gates:
        if key not in gates:
            errors.append(f"missing hard gate: {key}")
    unknown = sorted(set(evaluation.get("failure_tags", [])) - EDIT_FAILURE_TAGS)
    if unknown:
        errors.append("unknown failure tags: " + ", ".join(unknown))
    total = sum(float(scores.get(key, 0)) for key in SCORE_MAX)
    hard_pass = (
        gates.get("requested_changes_complete") is True
        and gates.get("locked_invariants_preserved") is True
        and gates.get("severe_science_error") is False
        and gates.get("forbidden_mark_count") == 0
        and gates.get("unlisted_object_count") == 0
        and gates.get("critical_structure_broken") is False
        and gates.get("style_contract_broken", False) is False
        and gates.get("category_encoding_valid", True) is True
    )
    result = {
        "engine_version": ENGINE_VERSION,
        "case_id": evaluation.get("case_id"),
        "attempt": evaluation.get("attempt"),
        "total": total,
        "score_threshold_pass": total >= 85,
        "hard_gate_pass": hard_pass,
        "passed": not errors and total >= 85 and hard_pass,
        "validation_errors": errors,
        "failure_tags": evaluation.get("failure_tags", []),
    }
    write_json(args.out, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["passed"] else 1


def command_revise(args) -> int:
    parent_dir, out_dir = Path(args.parent_dir), Path(args.out_dir)
    correction = read_json(args.correction)
    required = ["parent_attempt", "failure_tags", "observed_failure", "single_change"]
    missing = [key for key in required if key not in correction]
    if missing:
        print("missing correction fields: " + ", ".join(missing), file=sys.stderr)
        return 2
    if len(correction["failure_tags"]) < 1:
        print("at least one failure tag is required", file=sys.stderr)
        return 2
    unknown = sorted(set(correction["failure_tags"]) - EDIT_FAILURE_TAGS)
    if unknown:
        print("unknown failure tags: " + ", ".join(unknown), file=sys.stderr)
        return 2
    parent_prompt = (parent_dir / "prompt.txt").read_text(encoding="utf-8")
    request = read_json(parent_dir / "edit-request.json")
    revised_prompt = parent_prompt + f"""

TARGETED CORRECTION FOR THIS ATTEMPT
Observed failure: {correction['observed_failure']}
Make exactly this one corrective change: {correction['single_change']}
Retain every other instruction and locked invariant above. Do not compensate by redesigning another object.
"""
    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "edit-request.json", request)
    write_json(out_dir / "correction.json", correction)
    (out_dir / "prompt.txt").write_text(revised_prompt, encoding="utf-8")
    write_json(out_dir / "prompt.json", {
        "engine_version": ENGINE_VERSION,
        "case_id": request["case_id"],
        "parent_attempt": correction["parent_attempt"],
        "failure_tags": correction["failure_tags"],
        "prompt_sha256": hashlib.sha256(revised_prompt.encode("utf-8")).hexdigest(),
        "compiled_at": datetime.now(timezone.utc).isoformat(),
        "prompt": revised_prompt,
    })
    print(out_dir / "prompt.txt")
    return 0


def _evaluation_files(root: Path):
    return sorted(path for path in root.rglob("evaluation.json") if path.is_file())


def command_summarize(args) -> int:
    rows = []
    allowed_case_ids = None
    if getattr(args, "manifest", None):
        manifest_path = Path(args.manifest)
        manifest = read_json(manifest_path)
        allowed_case_ids = {read_json(manifest_path.parent / relative)["case_id"] for relative in manifest["cases"]}
    for path in _evaluation_files(Path(args.results)):
        evaluation = read_json(path)
        if allowed_case_ids is not None and evaluation.get("case_id") not in allowed_case_ids:
            continue
        score_path = path.with_name("score.json")
        score = read_json(score_path) if score_path.exists() else {"passed": False, "total": 0}
        rows.append((evaluation, score, str(path)))
    latest_by_case = {}
    for row in rows:
        evaluation = row[0]
        case_id = evaluation.get("case_id", "unknown")
        if case_id not in latest_by_case or evaluation.get("attempt", 0) > latest_by_case[case_id][0].get("attempt", 0):
            latest_by_case[case_id] = row
    latest_rows = list(latest_by_case.values())
    by_subject, by_operation = defaultdict(Counter), defaultdict(Counter)
    failures = Counter()
    for evaluation, score, _ in latest_rows:
        status = "passed" if score.get("passed") else "failed"
        by_subject[evaluation.get("subject", "unknown")][status] += 1
        for operation in evaluation.get("operations", ["unknown"]):
            by_operation[operation][status] += 1
        failures.update(evaluation.get("failure_tags", []))
    def rates(groups):
        return {key: {**count, "total": sum(count.values()), "pass_rate": round(count["passed"] / sum(count.values()), 4) if sum(count.values()) else 0} for key, count in sorted(groups.items())}
    passed = sum(1 for _, score, _ in latest_rows if score.get("passed"))
    attempt_passed = sum(1 for _, score, _ in rows if score.get("passed"))
    summary = {
        "engine_version": ENGINE_VERSION,
        "evaluated_cases": len(latest_rows),
        "passed": passed,
        "pass_rate": round(passed / len(latest_rows), 4) if latest_rows else 0,
        "attempts": len(rows),
        "passing_attempts": attempt_passed,
        "attempt_pass_rate": round(attempt_passed / len(rows), 4) if rows else 0,
        "by_subject": rates(by_subject),
        "by_operation": rates(by_operation),
        "failure_tag_counts": dict(failures.most_common()),
        "evidence_files": [path for _, _, path in rows],
    }
    write_json(args.out, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    compile_parser = sub.add_parser("compile")
    compile_parser.add_argument("--request", required=True)
    compile_parser.add_argument("--rules", required=True)
    compile_parser.add_argument("--out-dir", required=True)
    compile_parser.set_defaults(func=command_compile)
    score_parser = sub.add_parser("score")
    score_parser.add_argument("--evaluation", required=True)
    score_parser.add_argument("--out", required=True)
    score_parser.set_defaults(func=command_score)
    revise_parser = sub.add_parser("revise")
    revise_parser.add_argument("--parent-dir", required=True)
    revise_parser.add_argument("--correction", required=True)
    revise_parser.add_argument("--out-dir", required=True)
    revise_parser.set_defaults(func=command_revise)
    summary_parser = sub.add_parser("summarize")
    summary_parser.add_argument("--results", required=True)
    summary_parser.add_argument("--out", required=True)
    summary_parser.add_argument("--manifest")
    summary_parser.set_defaults(func=command_summarize)
    return parser


if __name__ == "__main__":
    parsed = build_parser().parse_args()
    raise SystemExit(parsed.func(parsed))
