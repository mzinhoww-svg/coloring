"""Step 13: curated master inventory of the reverse-engineering evidence set."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"
APK_SHA = "1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    files = []
    for path in sorted(OUT.rglob("*")):
        if path.is_file() and path.name not in ("inventory.json",):
            files.append({
                "path": str(path.relative_to(ROOT)),
                "bytes": path.stat().st_size,
                "sha256": digest(path),
            })

    key = {}
    palette = json.loads((OUT / "palette-and-brushes.json").read_text())
    pages = json.loads((OUT / "pages-inventory.json").read_text())["summary"]
    facts = json.loads((OUT / "coloring-page-facts.json").read_text())
    il2 = json.loads((OUT / "il2cpp-summary.json").read_text())
    addr = json.loads((OUT / "addressables.json").read_text())

    key["coloring_page"] = {
        "canvas_scalers": facts["canvases"],
        "tools": {name: {"rect": t["rect"], "components": t["components"]}
                  for name, t in facts["tools"].items()},
        "buttons": {panel: {btn: e["rect"] for btn, e in items.items()}
                    for panel, items in facts["buttons_by_panel"].items()},
        "palettes": [{"name": p["name"], "rect": p["rect"]} for p in facts["scroll_palettes"]],
    }
    key["palette"] = {"count": palette["palette_color_count"],
                      "colors": [c["rgb_hex"] for c in palette["palette_colors"]]}
    key["brushes"] = {"shines": palette["shine_count"], "patterns": palette["pattern_count"]}
    key["pages"] = {k: pages[k] for k in ("page_prefab_count", "regions_total",
                                          "regions_per_page", "collider_points_per_region",
                                          "texture_sizes_observed")}
    key["metadata"] = il2["counts"]
    key["addressables"] = {"internal_ids": addr["internal_id_count"],
                           "page_prefabs": addr["page_prefab_total"],
                           "providers": addr["provider_ids"]}

    inventory = {
        "evidence_set": "APK-REV",
        "artifact": {"name": "coloring-1-116(2).apk", "sha256": APK_SHA,
                     "bytes": 135423615},
        "classification": {
            "facts": "names, path ids, geometry, colours and symbols read from serialized data",
            "inferences": "runtime creation of paint layers, fill routing, brush parameterisation",
            "unknowns": "undo depth, save format, address->bundle mapping, on-device pixels",
        },
        "key_numbers": key,
        "files": files,
        "private_working_data": [
            ".private/reverse/apk/ (extracted APK members, git-ignored)",
            ".private/reverse/il2cpp-types.json",
            ".private/reverse/il2cpp-type-graph.json",
            ".private/reverse/unity-objects-by-type.json",
            ".private/reverse/script-usage-by-file.json",
            ".private/reverse/scripts-all.json",
        ],
        "rights": "Art, fonts, audio and text remain private reference with unconfirmed rights.",
        "reproduce": "tools/reverse/01_extract.py .. 13_inventory.py (see REPORT.md section 12)",
    }
    (OUT / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    print(json.dumps({"files": len(files), "bytes": sum(f["bytes"] for f in files)}, indent=1))


if __name__ == "__main__":
    main()
