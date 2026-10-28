"""Step 9: media inventory (names, sizes, classes only — no pixels, no audio bytes).

Facts: which textures/sprites/audio/fonts/shaders/materials ship, and their dimensions.
"""
from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_lib import Bundle  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"

TEXTURE_FORMAT = {
    1: "Alpha8", 2: "ARGB4444", 3: "RGB24", 4: "RGBA32", 5: "ARGB32",
    7: "RGB565", 10: "DXT1", 12: "DXT5", 13: "RGBA4444", 14: "BGRA32",
    28: "ETC_RGB4", 47: "ASTC_4x4", 48: "ASTC_5x5", 49: "ASTC_6x6",
    50: "ASTC_8x8", 51: "ASTC_10x10", 52: "ASTC_12x12",
}


def main() -> None:
    b = Bundle()
    textures = []
    sprites = collections.Counter()
    audio = []
    fonts = []
    shaders = []
    materials = []
    for fname, sf in b.files.items():
        for pid, obj in sf.objects.items():
            t = obj.type.name
            try:
                d = obj.read()
            except Exception:
                continue
            if t == "Texture2D":
                textures.append({
                    "serialized_file": fname, "path_id": pid, "name": d.m_Name,
                    "size": [int(d.m_Width), int(d.m_Height)],
                    "format": TEXTURE_FORMAT.get(int(d.m_TextureFormat), str(int(d.m_TextureFormat))),
                    "mip_maps": bool(getattr(d, "m_MipCount", 1) and d.m_MipCount > 1),
                })
            elif t == "Sprite":
                sprites[fname] += 1
            elif t == "AudioClip":
                audio.append({"serialized_file": fname, "path_id": pid, "name": d.m_Name,
                              "channels": getattr(d, "m_Channels", None),
                              "frequency": getattr(d, "m_Frequency", None),
                              "bits": getattr(d, "m_BitsPerSample", None),
                              "length_seconds": (round(d.m_Length, 3)
                                                 if isinstance(getattr(d, "m_Length", None), (int, float)) else None)})
            elif t == "Font":
                fonts.append({"serialized_file": fname, "path_id": pid, "name": d.m_Name})
            elif t == "Shader":
                shaders.append({"serialized_file": fname, "path_id": pid, "name": d.m_Name})
            elif t == "Material":
                materials.append({"serialized_file": fname, "path_id": pid, "name": d.m_Name})

    size_hist = collections.Counter(f"{t['size'][0]}x{t['size'][1]}" for t in textures)
    tool_textures = sorted({t["name"] for t in textures if "tool-colors" in t["name"]})
    names_by_prefix = collections.Counter()
    for t in textures:
        prefix = "".join(ch if not ch.isdigit() else "#" for ch in t["name"])[:28]
        names_by_prefix[prefix] += 1

    data = {
        "evidence_id": "APK-REV-MEDIA-001",
        "source_member": "assets/bin/Data/data.unity3d",
        "texture_count": len(textures),
        "texture_size_histogram": dict(size_hist.most_common(20)),
        "sprite_count_by_file": dict(sprites),
        "audio_clip_count": len(audio),
        "audio_clips": audio,
        "font_count": len(fonts),
        "fonts": fonts,
        "shader_count": len(shaders),
        "shaders": shaders,
        "material_count": len(materials),
        "materials": materials,
        "tool_colour_texture_names": tool_textures,
        "common_texture_name_prefixes": dict(names_by_prefix.most_common(20)),
        "texture_inventory": textures,
        "rights": "Private reference only. No pixels or audio exported; rights unconfirmed.",
    }
    (OUT / "media-inventory.json").write_text(json.dumps(data, indent=1) + "\n")
    print(json.dumps({"textures": len(textures), "sizes": dict(size_hist.most_common(8)),
                      "audio": len(audio), "fonts": len(fonts), "shaders": len(shaders),
                      "materials": len(materials)}, indent=1))


if __name__ == "__main__":
    main()
