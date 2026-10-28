"""Step 6: app-specific type / field / method inventory from IL2CPP metadata.

Facts: symbol names, declaration order, parameter counts, access/static/virtual flags.
Not facts: that a method executes, its body, or any UI binding.
"""
from __future__ import annotations

import json
import sys
import struct
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module  # noqa: E402

il2cpp = import_module("05_il2cpp_metadata") if False else None  # keep linters calm

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"
PRIV = ROOT / ".private" / "reverse"
META = ROOT / ".private" / "reverse" / "apk" / "assets" / "bin" / "Data" / "Managed" / "Metadata" / "global-metadata.dat"

# import parser class by path
import importlib.util

spec = importlib.util.spec_from_file_location("md", Path(__file__).with_name("05_il2cpp_metadata.py"))
md = importlib.util.module_from_spec(spec)
spec.loader.exec_module(md)

ACCESS = {0: "privatescope", 1: "private", 2: "privateprotected", 3: "internal",
          4: "protected", 5: "protectedinternal", 6: "public"}


def decode_flags(flags: int) -> dict:
    return {
        "access": ACCESS.get(flags & 0x7, "unknown"),
        "static": bool(flags & 0x10),
        "virtual": bool(flags & 0x40),
        "abstract": bool(flags & 0x400),
        "special": bool(flags & 0x800),
        "access_flags": flags,
    }


def main() -> None:
    m = md.Metadata(META)
    types = m.type_definitions()
    by_index = {t["index"]: t for t in types}
    methods = m.methods(32)
    fields = m.fields()
    images = m.images(40)

    per_type_methods: dict[int, list[dict]] = {}
    for meth in methods:
        per_type_methods.setdefault(meth["declaring_type"], []).append(meth)

    def fq(i: int) -> str:
        t = by_index.get(i)
        if not t:
            return f"<type {i}>"
        return f"{t['namespace']}.{t['name']}" if t["namespace"] else t["name"]

    graph = {}
    for img in images:
        if not img["name"] or not img["type_count"]:
            continue
        if img["name"] not in ("Assembly-CSharp.dll", "PaintIn3D.dll", "CW.Common.dll",
                               "Unity.ResourceManager.dll", "Unity.Addressables.dll"):
            continue
        start, count = img["type_start"], img["type_count"]
        for idx in range(start, start + count):
            t = by_index.get(idx)
            if not t or not t["name"] or t["name"].startswith("<"):
                continue
            fs = fields[t["field_start"]:t["field_start"] + t["field_count"]]
            ms = per_type_methods.get(idx, [])
            graph[fq(idx)] = {
                "image": img["name"],
                "namespace": t["namespace"],
                "flags": hex(t["flags"]),
                "parent": fq(t["parent_index"]),
                "field_count": t["field_count"],
                "fields": [f["name"] for f in fs],
                "methods": [
                    {"name": x["name"], "params": x["parameter_count"], **decode_flags(x["flags"])}
                    for x in sorted(ms, key=lambda y: y["index"])
                ],
            }

    (PRIV / "il2cpp-type-graph.json").write_text(json.dumps(graph, indent=1) + "\n")

    # Curated public slice: painting/coloring domain only, names + signatures.
    core = {
        "ColoringPage", "Paintable", "PaintablesController", "PaletteController",
        "PaletteContent", "PaletteItem", "PaletteColor", "PaletteLock", "Palettes",
        "ManagePalettes", "Brush", "ManageTools", "ToolsManager", "ManagePhysicalBrushes",
        "LoadStrokes", "ColoringPageDataManager", "SaveImage", "LoadImage", "LayerSelection",
        "DinamicInterval", "DisplayParticles", "ChangePatternTileScale", "GalleryMenu",
        "GalleryIcon", "GalleryPack", "MenuController", "SceneInformation", "DataManager",
        "SavableValue", "PackAnimation", "ItemsAnimation", "ColoringMainMenuManager",
        "IntroSceneColoring", "SoundPlayer", "AudioController", "PopupView",
    }
    curated = {k: v for k, v in graph.items() if k in core or k.split(".")[-1] in core}
    (OUT / "app-type-methods.json").write_text(json.dumps({
        "evidence_id": "APK-REV-IL2CPP-002",
        "source_member": "assets/bin/Data/Managed/Metadata/global-metadata.dat",
        "note": ("Signatures and declaration order from metadata. Parameter and field TYPE "
                 "indices are not resolved (Il2CppMetadataRegistration lives in libil2cpp.so)."),
        "types": curated,
    }, indent=2) + "\n")

    print(f"types in graph: {len(graph)}")
    for key in ("ColoringPage", "Brush", "ManageTools", "ManagePhysicalBrushes",
                "PaletteController", "PaletteContent", "PaintablesController", "ColoringPageDataManager"):
        v = graph.get(key)
        if not v:
            print("missing", key)
            continue
        print(f"\n== {key} parent={v['parent']} fields={v['field_count']}")
        print("   fields:", ", ".join(v["fields"]))
        print("   methods:", ", ".join(f"{x['name']}/{x['params']}" for x in v["methods"]))


if __name__ == "__main__":
    main()
