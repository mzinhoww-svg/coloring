"""Step 12: complete Assembly-CSharp type/method index (names and signatures only)."""
from __future__ import annotations

import json
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"
PRIV = ROOT / ".private" / "reverse"
META = PRIV / "apk" / "assets" / "bin" / "Data" / "Managed" / "Metadata" / "global-metadata.dat"

spec = importlib.util.spec_from_file_location("md", Path(__file__).with_name("05_il2cpp_metadata.py"))
md = importlib.util.module_from_spec(spec)
spec.loader.exec_module(md)


def main() -> None:
    m = md.Metadata(META)
    types = m.type_definitions()
    by_index = {t["index"]: t for t in types}
    methods = m.methods(32)
    fields = m.fields()
    images = m.images(40)

    per_type: dict[int, list[dict]] = {}
    for meth in methods:
        per_type.setdefault(meth["declaring_type"], []).append(meth)

    def fq(i: int) -> str:
        t = by_index.get(i)
        if not t:
            return f"<{i}>"
        return f"{t['namespace']}.{t['name']}" if t["namespace"] else t["name"]

    index = {}
    total_methods = 0
    for img in images:
        if img["name"] != "Assembly-CSharp.dll":
            continue
        for idx in range(img["type_start"], img["type_start"] + img["type_count"]):
            t = by_index.get(idx)
            if not t or not t["name"] or t["name"].startswith("<"):
                continue
            ms = per_type.get(idx, [])
            total_methods += len(ms)
            fs = fields[t["field_start"]:t["field_start"] + t["field_count"]]
            index[fq(idx)] = {
                "parent": fq(t["parent_index"]),
                "fields": [f["name"] for f in fs],
                "methods": [f"{x['name']}/{x['parameter_count']}" for x in ms],
            }
    (OUT / "app-types-index.json").write_text(json.dumps({
        "evidence_id": "APK-REV-IL2CPP-003",
        "source_member": "assets/bin/Data/Managed/Metadata/global-metadata.dat",
        "assembly": "Assembly-CSharp.dll",
        "type_count": len(index),
        "method_count": total_methods,
        "encoding": "methods as name/parameterCount",
        "note": "Names and arity from IL2CPP metadata; bodies, callers and runtime use are unverified.",
        "types": index,
    }, indent=1) + "\n")
    print(json.dumps({"types": len(index), "methods": total_methods,
                      "bytes": (OUT / "app-types-index.json").stat().st_size}))


if __name__ == "__main__":
    main()
