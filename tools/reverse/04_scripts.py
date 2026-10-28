"""Step 4: enumerate scripts present in the build and where they are attached.

Facts: MonoScript identity (assembly, namespace, class), count of MonoBehaviour
instances per script per serialized file. Nothing here proves a method is called.
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
PRIV = ROOT / ".private" / "reverse"


def main() -> None:
    b = Bundle()
    scripts = {}
    for name, sf in b.files.items():
        for pid, obj in sf.objects.items():
            if obj.type.name != "MonoScript":
                continue
            d = obj.read()
            scripts[(name, pid)] = {
                "serialized_file": name,
                "path_id": pid,
                "assembly": d.m_AssemblyName,
                "namespace": d.m_Namespace or "",
                "class": d.m_ClassName,
            }

    usage = collections.Counter()
    per_file = collections.defaultdict(collections.Counter)
    failures = 0
    for name, sf in b.files.items():
        for pid, obj in sf.objects.items():
            if obj.type.name != "MonoBehaviour":
                continue
            info = b.mono_script(sf, obj)
            if not info or "script" not in info:
                failures += 1
                continue
            usage[info["script"]] += 1
            per_file[name][info["script"]] += 1

    assemblies = collections.Counter(s["assembly"] for s in scripts.values())
    app_prefixes = ("Assembly-CSharp", "GameContents", "Coloring", "UnityUtils", "IAPTools")
    app_scripts = sorted(
        (s for s in scripts.values()
         if any((s["assembly"] or "").startswith(p) for p in app_prefixes)
         or s["class"] in {"ColoringPage", "Palettes", "PaletteController", "PaletteContent",
                           "Brush", "ManageTools", "ManagePhysicalBrushes", "PaintablesController",
                           "SaveImage", "LoadImage", "DinamicInterval", "LayerSelection",
                           "IAPToolsPanel", "PurchasePanel", "RestoreButton", "DisplayParticles",
                           "ChangePatternTileScale", "TMProCurve"}),
        key=lambda s: (s["assembly"] or "", s["namespace"], s["class"]))

    (OUT / "script-inventory.json").write_text(json.dumps({
        "evidence_id": "APK-REV-SCRIPTS-001",
        "source_member": "assets/bin/Data/data.unity3d",
        "monoscript_count": len(scripts),
        "monoscript_assemblies": dict(sorted(assemblies.items(), key=lambda kv: -kv[1])),
        "monobehaviour_instances": sum(usage.values()),
        "monobehaviour_unresolved": failures,
        "top_attached_scripts": usage.most_common(60),
        "app_specific_scripts": app_scripts,
    }, indent=2) + "\n")

    (PRIV / "script-usage-by-file.json").write_text(json.dumps(
        {k: dict(v) for k, v in per_file.items()}, indent=1) + "\n")
    (PRIV / "scripts-all.json").write_text(json.dumps(
        sorted(scripts.values(), key=lambda s: (s["assembly"] or "", s["class"])), indent=1) + "\n")
    print(json.dumps({"monoscripts": len(scripts), "assemblies": dict(assemblies),
                      "attached": sum(usage.values()), "unresolved": failures,
                      "app_scripts": len(app_scripts)}, indent=1))
    print("top:", usage.most_common(25))


if __name__ == "__main__":
    main()
