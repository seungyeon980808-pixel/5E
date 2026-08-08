import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".agents" / "skills" / "exam-diagram-engine-v2"
RENDERER_PATH = SKILL / "scripts" / "vector_renderer.py"

spec = importlib.util.spec_from_file_location("exam_diagram_vector_renderer", RENDERER_PATH)
renderer = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(renderer)


class VectorRendererTests(unittest.TestCase):
    def setUp(self):
        self.scene = json.loads((SKILL / "assets" / "example-vector-scene.json").read_text(encoding="utf-8"))

    def test_example_scene_is_valid(self):
        self.assertEqual([], renderer.validate_scene(self.scene))

    def test_text_and_arrow_primitives_are_unrepresentable(self):
        for forbidden_type in ("text", "arrow"):
            scene = copy.deepcopy(self.scene)
            scene["primitives"][0]["type"] = forbidden_type
            self.assertTrue(renderer.validate_scene(scene))

    def test_unassigned_geometry_is_rejected(self):
        scene = copy.deepcopy(self.scene)
        scene["instances"][0]["primitive_ids"] = []
        errors = renderer.validate_scene(scene)
        self.assertTrue(any("closed inventory" in error or "unassigned" in error for error in errors))

    def test_render_is_byte_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.png"
            second = Path(directory) / "second.png"
            report_one = renderer.render_scene(self.scene, first)
            report_two = renderer.render_scene(self.scene, second)
            self.assertEqual(report_one["output_sha256"], report_two["output_sha256"])
            self.assertEqual(first.read_bytes(), second.read_bytes())


if __name__ == "__main__":
    unittest.main()
