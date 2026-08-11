"""Build the 5E desktop/web icon set from the approved 512px artwork.

The artwork is preserved exactly; only a supersampled rounded alpha mask and
the required platform sizes are applied.
"""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "icon-512.png"
CORNER_RADIUS_RATIO = 0.22
OUTPUTS = {
    "icon-512.png": 512,
    "icon-192.png": 192,
    "apple-touch-icon.png": 180,
    "favicon.png": 64,
}


def rounded_mask(size: int) -> Image.Image:
    scale = 4
    large_size = size * scale
    radius = round(size * CORNER_RADIUS_RATIO * scale)
    mask = Image.new("L", (large_size, large_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, large_size - 1, large_size - 1), radius=radius, fill=255
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (512, 512):
        raise ValueError(f"Expected 512x512 source, got {source.size}")
    source.putalpha(ImageChops.multiply(source.getchannel("A"), rounded_mask(512)))

    for filename, size in OUTPUTS.items():
        image = source if size == 512 else source.resize((size, size), Image.Resampling.LANCZOS)
        image.save(ASSETS / filename, format="PNG", optimize=True)

    ico = source.resize((256, 256), Image.Resampling.LANCZOS)
    ico.save(
        ASSETS / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    build()
