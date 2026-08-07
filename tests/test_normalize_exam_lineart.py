import importlib.util
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOL = Path(__file__).resolve().parents[1] / "tools" / "normalize-exam-lineart.py"
SPEC = importlib.util.spec_from_file_location("normalize_exam_lineart", TOOL)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NormalizeExamLineartTests(unittest.TestCase):
    def test_palette_and_alpha_are_deterministic(self):
        pixels = np.array(
            [[
                [5, 10, 15, 255],
                [100, 110, 120, 255],
                [170, 180, 190, 255],
                [225, 230, 235, 255],
                [247, 247, 247, 128],
            ]],
            dtype=np.uint8,
        )
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.png"
            target = Path(directory) / "target.png"
            Image.fromarray(pixels, mode="RGBA").save(source)

            stats = MODULE.normalize_image(source, target)
            output = np.asarray(Image.open(target).convert("RGBA"))

        tones = set(output[0, :, 0].tolist())
        self.assertTrue(tones.issubset(set(MODULE.DEFAULT_PALETTE)))
        self.assertEqual(output[0, -1, 0], 255)
        self.assertEqual(output[0, -1, 3], 128)
        self.assertLessEqual(stats["output_gray_levels"], len(MODULE.DEFAULT_PALETTE))

    def test_palette_requires_black_and_white(self):
        with self.assertRaises(Exception):
            MODULE.parse_palette("20,100,220")


if __name__ == "__main__":
    unittest.main()
