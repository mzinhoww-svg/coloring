"""Step 7: palette colors, brush tool wiring and canvas scaling from serialized objects.

Facts: serialized array contents and component wiring read from MonoBehaviour payloads.
Method: MonoBehaviours have no typetree in an IL2CPP build, so each payload is walked with
Unity's serializer rules (int32 count + payload, 4-byte alignment) and cross-checked:
the 40-entry colour array appears identically in two independent components (ManageTools.colors
and ManagePhysicalBrushes.drawColors), and every PPtr is resolved or reported unresolved.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_lib import Bundle  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"


def bodies(b: Bundle, fname: str, script: str) -> list[dict]:
    sf = b.files[fname]
    found = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "MonoBehaviour":
            continue
        info = b.mono_script(sf, obj)
        if info and info.get("script") == script:
            raw = obj.get_raw_data()
            hdr = b.mono_header(raw)
            found.append({"path_id": pid, "game_object": hdr["game_object"],
                          "body": raw[hdr["field_offset"]:], "sf": sf})
    return found


def read_color_array(body: bytes, off: int) -> tuple[list[list[float]], int]:
    n = struct.unpack_from("<i", body, off)[0]
    off += 4
    colors = []
    for i in range(n):
        colors.append([round(v, 4) for v in struct.unpack_from("<4f", body, off + i * 16)])
    return colors, off + n * 16


def read_pptr_array(b: Bundle, sf, body: bytes, off: int) -> tuple[list[dict], int, list[str]]:
    n = struct.unpack_from("<i", body, off)[0]
    off += 4
    out, names = [], []
    for i in range(n):
        fid, pid = struct.unpack_from("<iq", body, off + i * 12)
        target = b.resolve(sf, fid, pid)
        entry = {"file_id": fid, "path_id": pid, "resolved": target is not None}
        if target is not None:
            d = target.read()
            entry["class"] = target.type.name
            nm = getattr(d, "m_Name", None)
            if isinstance(nm, str):
                entry["name"] = nm
                names.append(f"{target.type.name}:{nm}")
            if target.type.name == "Texture2D":
                entry["size"] = [int(d.m_Width), int(d.m_Height)]
            if target.type.name == "Sprite":
                entry["rect"] = [round(d.m_Rect.width, 1), round(d.m_Rect.height, 1)]
        out.append(entry)
    return out, off + n * 12, names


def hex_of(rgba: list[float]) -> str:
    r, g, b_, a = rgba
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b_ * 255))


def canvas_scalers(b: Bundle, fname: str) -> list[dict]:
    sf = b.files[fname]
    out = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "MonoBehaviour":
            continue
        info = b.mono_script(sf, obj)
        if not info or info.get("script") != "UnityEngine.UI.CanvasScaler":
            continue
        raw = obj.get_raw_data()
        hdr = b.mono_header(raw)
        body = raw[hdr["field_offset"]:]
        (mode, ppu, fsf, rx, ry, smode, match) = struct.unpack_from("<iffffif", body, 0)
        out.append({
            "monobehaviour_path_id": pid,
            "game_object_path_id": hdr["game_object"],
            "ui_scale_mode": int(mode),
            "reference_pixels_per_unit": round(ppu, 3),
            "scale_factor": round(fsf, 3),
            "reference_resolution": [round(rx, 1), round(ry, 1)],
            "screen_match_mode": int(smode),
            "match_width_or_height": round(match, 3),
        })
    return out


def main() -> None:
    b = Bundle()
    tools = bodies(b, "level4", "ManageTools")
    physical = bodies(b, "level4", "ManagePhysicalBrushes")
    assert len(tools) == 1 and len(physical) == 1, (len(tools), len(physical))

    t_body = tools[0]["body"]
    colors, nxt = read_color_array(t_body, 0)
    shines, nxt2, shine_names = read_pptr_array(b, tools[0]["sf"], t_body, nxt)
    patterns, nxt3, pattern_names = read_pptr_array(b, tools[0]["sf"], t_body, nxt2)

    p_body = physical[0]["body"]
    # The two leading scalars are not identified with certainty (no typetree), so locate the
    # colour array structurally: an int32 count whose 16-byte RGBA entries are all in 0..1 with
    # alpha 1. The located array must equal ManageTools.colors exactly.
    p_colors, p_off = [], -1
    for probe in range(0, 64, 4):
        n = struct.unpack_from("<i", p_body, probe)[0]
        if n != len(colors) or probe + 4 + n * 16 > len(p_body):
            continue
        cand = [[round(v, 4) for v in struct.unpack_from("<4f", p_body, probe + 4 + i * 16)]
                for i in range(n)]
        if all(0.0 <= v <= 1.0 for c in cand for v in c) and all(c[3] == 1.0 for c in cand):
            p_colors, p_off = cand, probe
            break
    assert p_off >= 0, "colour array not located in ManagePhysicalBrushes"
    assert p_colors == colors, "colour arrays disagree between ManageTools and ManagePhysicalBrushes"
    assert all(0.0 <= v <= 1.0 for c in colors for v in c), "colour outside 0..1"

    palette = [{"index": i, "rgba": c, "rgb_hex": hex_of(c)} for i, c in enumerate(colors)]

    data = {
        "evidence_id": "APK-REV-PALETTE-001",
        "source_member": "assets/bin/Data/data.unity3d::level4 (ColoringPage scene)",
        "objects": {
            "ManageTools": {"path_id": tools[0]["path_id"],
                            "game_object_path_id": tools[0]["game_object"]},
            "ManagePhysicalBrushes": {"path_id": physical[0]["path_id"],
                                      "game_object_path_id": physical[0]["game_object"]},
        },
        "confirmation": ("same 40-entry colour array serialized in two independent components; "
                         "raw payload walked with int32 count + 4-byte alignment, all components in 0..1"),
        "palette_color_count": len(palette),
        "palette_colors": palette,
        "shine_count": len(shines),
        "shine_refs": [{k: v for k, v in s.items() if k != "resolved"} for s in shines],
        "pattern_count": len(patterns),
        "pattern_refs": [{k: v for k, v in p.items() if k != "resolved"} for p in patterns],
        "unresolved_pptrs": sum(1 for s in shines + patterns if not s["resolved"]),
        "light_sheen_field_names_note": ("ManagePhysicalBrushes also declares drawColorsShines, "
                                         "drawColorsPatterns, drawPatterns, typePatterns, drawShines; "
                                         "only the plain colour array is asserted here"),
        "colour_array_offset_in_managephysicalbrushes_body": p_off,
        "canvas_scalers_coloring_page": canvas_scalers(b, "level4"),
        "canvas_scalers_all_scenes": {
            f"level{i}": canvas_scalers(b, f"level{i}") for i in range(8)
        },
    }
    (OUT / "palette-and-brushes.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({"colors": len(colors), "shines": len(shines),
                      "shine_names": shine_names[:20], "patterns": len(patterns),
                      "pattern_names": pattern_names[:20],
                      "unresolved": data["unresolved_pptrs"]}, indent=1))


if __name__ == "__main__":
    main()
