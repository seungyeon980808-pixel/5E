import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".agents" / "skills" / "exam-diagram-engine-v2"
ENGINE_PATH = SKILL / "scripts" / "engine.py"

spec = importlib.util.spec_from_file_location("exam_diagram_engine_v2", ENGINE_PATH)
engine = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(engine)


class EngineV2Tests(unittest.TestCase):
    def test_example_request_compiles_with_zero_tolerance_prompt(self):
        request = json.loads((SKILL / "assets" / "example-request.json").read_text(encoding="utf-8"))
        normalized = engine.normalize_request(request)
        errors, _ = engine.validate_request(normalized)
        self.assertEqual([], errors)
        prompt = engine.compile_prompt(normalized)
        self.assertIn("exactly zero", prompt)
        self.assertIn("zero objects outside this list", prompt)
        self.assertIn("do not add, remove, merge, substitute", prompt.lower())

    def test_unresolved_critical_ambiguity_blocks_preflight(self):
        request = json.loads((SKILL / "assets" / "example-request.json").read_text(encoding="utf-8"))
        request["ambiguities"] = [{"question": "Which apparatus?", "severity": "critical", "status": "unresolved"}]
        errors, _ = engine.validate_request(engine.normalize_request(request))
        self.assertTrue(any("unresolved critical ambiguity" in error for error in errors))

    def test_hard_gate_overrides_perfect_score(self):
        evaluation = json.loads((SKILL / "assets" / "example-evaluation.json").read_text(encoding="utf-8"))
        evaluation["hard_gates"]["forbidden_mark_count"] = 1
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "evaluation.json"
            output = Path(directory) / "score.json"
            source.write_text(json.dumps(evaluation), encoding="utf-8")
            completed = subprocess.run([sys.executable, str(ENGINE_PATH), "score", "--evaluation", str(source), "--out", str(output)], check=False)
            self.assertEqual(1, completed.returncode)
            self.assertEqual("FAIL", json.loads(output.read_text(encoding="utf-8"))["verdict"])

    def test_benchmark_balance_and_lock(self):
        benchmark = ROOT / "benchmarks" / "exam-diagram-engine-v2"
        development = json.loads((benchmark / "development.json").read_text(encoding="utf-8"))
        final = json.loads((benchmark / "final.json").read_text(encoding="utf-8"))
        lock = json.loads((benchmark / "LOCK.json").read_text(encoding="utf-8"))
        self.assertEqual(36, len(development["cases"]))
        self.assertEqual(24, len(final["cases"]))
        self.assertTrue(final["frozen"])
        self.assertEqual(lock["development_sha256"], engine.sha256_json(development))
        self.assertEqual(lock["final_sha256"], engine.sha256_json(final))


if __name__ == "__main__":
    unittest.main()
