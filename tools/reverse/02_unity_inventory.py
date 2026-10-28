"""Step 2: UnityFS inventory of assets/bin/Data/data.unity3d.

Produces a type histogram and per-object identity map (path_id, class, name).
No texture pixel data is written here; names and sizes only.
"""
import hashlib
import json
import collections
from pathlib import Path

import UnityPy

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / ".private" / "reverse" / "apk" / "assets" / "bin" / "Data" / "data.unity3d"
OUT = ROOT / "evidence" / "reverse"
PRIV = ROOT / ".private" / "reverse"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PRIV.mkdir(parents=True, exist_ok=True)
    env = UnityPy.load(str(BUNDLE))

    hist = collections.Counter()
    by_type = collections.defaultdict(list)
    containers = {}
    for reader in env.files.values():
        try:
            for asset_path in reader.assets_file.container:
                containers[asset_path] = reader.assets_file.container[asset_path].path_id
        except Exception:
            pass

    for obj in env.objects:
        tname = obj.type.name
        hist[tname] += 1
        entry = {"path_id": obj.path_id, "class": tname, "file": obj.assets_file.name}
        try:
            data = obj.read()
            name = getattr(data, "m_Name", None) or getattr(data, "name", None)
            if isinstance(name, str) and name:
                entry["name"] = name
        except Exception as exc:  # keep inventory robust
            entry["read_error"] = type(exc).__name__
        by_type[tname].append(entry)

    summary = {
        "evidence_id": "APK-REV-UNITY-001",
        "source_member": "assets/bin/Data/data.unity3d",
        "sha256": hashlib.sha256(BUNDLE.read_bytes()).hexdigest(),
        "bytes": BUNDLE.stat().st_size,
        "object_count": sum(hist.values()),
        "type_histogram": dict(sorted(hist.items(), key=lambda kv: -kv[1])),
        "containers": containers,
    }
    (OUT / "unity-inventory.json").write_text(json.dumps(summary, indent=2) + "\n")

    # Full per-type dumps are private working data.
    private = {t: v for t, v in by_type.items()}
    (PRIV / "unity-objects-by-type.json").write_text(json.dumps(private, indent=1) + "\n")

    # Public-safe curated slice: only named objects of analytical classes.
    keep = ("GameObject", "MonoBehaviour", "Transform", "RectTransform", "Texture2D",
            "Sprite", "Mesh", "Material", "Shader", "AudioClip", "TextAsset", "AnimationClip",
            "Canvas", "CanvasRenderer", "Camera", "Font", "SceneSettings")
    curated = {t: by_type[t] for t in keep if t in by_type}
    (OUT / "unity-named-objects.json").write_text(json.dumps({
        "evidence_id": "APK-REV-UNITY-002",
        "source_member": "assets/bin/Data/data.unity3d",
        "note": "names and path_ids only; no pixel, mesh-vertex or audio payload",
        "objects": curated,
    }, indent=2) + "\n")
    print(json.dumps({"objects": sum(hist.values()), "types": len(hist),
                      "top": hist.most_common(15)}, indent=1))


if __name__ == "__main__":
    main()
