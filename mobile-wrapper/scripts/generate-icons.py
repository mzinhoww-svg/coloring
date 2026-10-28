#!/usr/bin/env python3
"""Generates Android launcher icons and splash screens from the app's own art.

Source: ../public/icons/icon-512.png and icon-maskable-512.png (project assets).
Only writes into mobile-wrapper/android/app/src/main/res.
"""
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT.parent / "public" / "icons"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

icon = Image.open(SRC / "icon-512.png").convert("RGBA")
maskable = Image.open(SRC / "icon-maskable-512.png").convert("RGBA")

# Launcher (legacy) and adaptive foreground buckets.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def resized(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


for density, scale in DENSITIES.items():
    out = RES / f"mipmap-{density}"
    out.mkdir(parents=True, exist_ok=True)
    legacy = resized(icon, round(48 * scale))
    legacy.save(out / "ic_launcher.png")
    round_icon = legacy.copy()
    mask = Image.new("L", round_icon.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, *round_icon.size), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(out / "ic_launcher_round.png")
    resized(maskable, round(108 * scale)).save(out / "ic_launcher_foreground.png")

# Splash: cream background, centered app mark, original dimensions preserved.
for splash in RES.glob("drawable*/splash.png"):
    width, height = Image.open(splash).size
    canvas = Image.new("RGB", (width, height), "#fbf4e7")
    mark_size = max(64, int(min(width, height) * 0.28))
    mark = resized(icon, mark_size)
    canvas.paste(mark, ((width - mark_size) // 2, (height - mark_size) // 2), mark)
    canvas.save(splash)

print("icons and splashes generated")
