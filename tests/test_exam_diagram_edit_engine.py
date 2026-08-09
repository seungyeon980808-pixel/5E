import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".agents/skills/exam-diagram-engine-v2/scripts/edit_engine.py"
SPEC = importlib.util.spec_from_file_location("edit_engine", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_example_edit_request_compiles_without_errors():
    request = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/example-edit-request.json")
    rules = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json")
    errors, warnings = MODULE.validate_request(request, rules)
    assert errors == []
    prompt = MODULE.compile_prompt(request, rules)
    assert "Change only the requested properties" in prompt
    assert "open switch" in prompt
    assert "red leader arrow" in prompt


def test_revision_six_prompt_contains_locality_category_and_delete_guards():
    request = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/example-edit-request.json")
    rules = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json")
    assert rules["rules_revision"] == 6
    prompt = MODULE.compile_prompt(request, rules)
    assert "strict locality fence" in prompt
    assert "Never collapse two source categories" in prompt
    assert "Leave zero dangling stubs" in rules["operation_rules"]["delete"]


def test_critical_uncertainty_blocks_generation():
    request = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/example-edit-request.json")
    rules = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json")
    request["critical_uncertainties"] = ["which of two vessels is the target"]
    errors, _ = MODULE.validate_request(request, rules)
    assert any("critical uncertainties" in error for error in errors)


def test_score_requires_edit_and_preservation_gates(tmp_path):
    evaluation = {
        "case_id": "case-1", "attempt": 1, "subject": "physics", "operations": ["move"],
        "scores": {"core_structure": 25, "scientific_accuracy": 20, "proportion_layout": 15, "kice_lineart": 15, "restrained_gray": 10, "no_forbidden_marks": 10, "editability": 5},
        "hard_gates": {"requested_changes_complete": True, "locked_invariants_preserved": False, "severe_science_error": False, "forbidden_mark_count": 0, "unlisted_object_count": 0, "critical_structure_broken": False},
        "failure_tags": ["EDIT_OVERREACH"], "evidence": ["an unedited object moved"]
    }
    evaluation_path, score_path = tmp_path / "evaluation.json", tmp_path / "score.json"
    evaluation_path.write_text(json.dumps(evaluation), encoding="utf-8")
    args = type("Args", (), {"evaluation": str(evaluation_path), "out": str(score_path)})
    assert MODULE.command_score(args) == 1
    assert load(score_path)["passed"] is False


def test_category_collapse_is_a_valid_hard_gate_failure_tag(tmp_path):
    evaluation = {
        "case_id": "case-category", "attempt": 1, "subject": "chemistry", "operations": ["style_cleanup"],
        "scores": {"core_structure": 25, "scientific_accuracy": 20, "proportion_layout": 15, "kice_lineart": 15, "restrained_gray": 10, "no_forbidden_marks": 10, "editability": 5},
        "hard_gates": {"requested_changes_complete": True, "locked_invariants_preserved": True, "severe_science_error": False, "forbidden_mark_count": 0, "unlisted_object_count": 0, "critical_structure_broken": False, "category_encoding_valid": False},
        "failure_tags": ["CATEGORY_COLLAPSE"], "evidence": ["three source categories became identical"]
    }
    evaluation_path, score_path = tmp_path / "evaluation.json", tmp_path / "score.json"
    evaluation_path.write_text(json.dumps(evaluation), encoding="utf-8")
    args = type("Args", (), {"evaluation": str(evaluation_path), "out": str(score_path)})
    assert MODULE.command_score(args) == 1
    score = load(score_path)
    assert score["passed"] is False
    assert score["validation_errors"] == []
