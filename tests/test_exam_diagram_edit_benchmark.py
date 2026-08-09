import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE_PATH = ROOT / ".agents/skills/exam-diagram-engine-v2/scripts/edit_engine.py"
SPEC = importlib.util.spec_from_file_location("edit_engine_benchmark", ENGINE_PATH)
ENGINE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(ENGINE)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_edit_benchmark_balance_and_requests():
    benchmark = ROOT / "benchmarks/exam-diagram-engine-v2-2"
    rules = load(ROOT / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json")
    for split, expected_count, expected_per_subject in (("development", 36, 9), ("final", 24, 6)):
        manifest = load(benchmark / f"{split}.json")
        assert manifest["case_count"] == expected_count
        requests = [load(benchmark / relative) for relative in manifest["cases"]]
        assert Counter(request["subject"] for request in requests) == Counter({subject: expected_per_subject for subject in ENGINE.SUBJECTS})
        for request in requests:
            errors, _ = ENGINE.validate_request(request, rules)
            assert errors == [], (request["case_id"], errors)


def test_development_and_final_families_do_not_overlap():
    benchmark = ROOT / "benchmarks/exam-diagram-engine-v2-2"
    manifests = {split: load(benchmark / f"{split}.json") for split in ("development", "final")}
    families = {}
    for split, manifest in manifests.items():
        families[split] = {load(benchmark / relative)["scenario_family"] for relative in manifest["cases"]}
    assert families["development"].isdisjoint(families["final"])
