#!/usr/bin/env python3
"""Build src-tauri/icons/icon.ico (Windows window/taskbar icon).

The macOS icon (Icon Composer, see build-app-icon.sh) draws the pheromone
glyph at ~0.4 scale inside a squircle because macOS adds its own margins and
every Dock icon shares that inset look. Reusing that composition on Windows
makes the logo look tiny: Windows taskbar/title-bar icons conventionally fill
the canvas (full-bleed plate, glyph at ~2/3 of the canvas).

This script composes a Windows-specific icon from the raw glyph
(media/logo/logo-light.png, dark glyph for a light plate): a white
rounded-rect plate filling the whole canvas + the glyph scaled to
GLYPH_SCALE of the canvas, rendered per size (16..256) into a multi-size
PNG-compressed .ico.

Requires Pillow (pip install --user pillow). Re-run after editing the logo.
"""

from __future__ import annotations

import struct
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
GLYPH = ROOT / "media" / "logo" / "logo-light.png"
OUT = ROOT / "src-tauri" / "icons" / "icon.ico"

SIZES = [16, 24, 32, 48, 64, 128, 256]
# Fraction of the canvas the glyph's bounding box occupies (Windows
# convention: generous full-bleed, unlike the macOS 0.4 composition).
GLYPH_SCALE = 0.70
# Plate corner radius as a fraction of the canvas (Windows 11 look).
CORNER_RADIUS = 0.22
SUPERSAMPLE = 4  # render plate+glyph at Nx then downscale for crisp edges


def compose(size: int, glyph: Image.Image) -> Image.Image:
    big = size * SUPERSAMPLE
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (0, 0, big - 1, big - 1),
        radius=int(big * CORNER_RADIUS),
        fill=(255, 255, 255, 255),
    )

    # Fit the glyph's content bbox into GLYPH_SCALE of the canvas, centered.
    target = int(big * GLYPH_SCALE)
    gw, gh = glyph.size
    ratio = min(target / gw, target / gh)
    resized = glyph.resize(
        (max(1, round(gw * ratio)), max(1, round(gh * ratio))),
        Image.LANCZOS,
    )
    x = (big - resized.width) // 2
    y = (big - resized.height) // 2
    canvas.paste(resized, (x, y), resized)

    return canvas.resize((size, size), Image.LANCZOS)


def write_ico(images: list[Image.Image], path: Path) -> None:
    """Write a PNG-compressed .ico (all entries PNG, like Tauri's default)."""
    entries = []
    blobs = []
    offset = 6 + 16 * len(images)
    for im in images:
        buf = BytesIO()
        im.save(buf, format="PNG")
        blob = buf.getvalue()
        w = im.width if im.width < 256 else 0
        h = im.height if im.height < 256 else 0
        entries.append(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(blob), offset))
        blobs.append(blob)
        offset += len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(images)))
        f.writelines(entries)
        f.writelines(blobs)


def main() -> int:
    glyph = Image.open(GLYPH).convert("RGBA")
    bbox = glyph.getchannel("A").getbbox()
    if bbox is None:
        print(f"error: {GLYPH} is fully transparent", file=sys.stderr)
        return 1
    glyph = glyph.crop(bbox)

    write_ico([compose(s, glyph) for s in SIZES], OUT)
    print(f"built: {OUT.relative_to(ROOT)} ({', '.join(map(str, SIZES))})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
