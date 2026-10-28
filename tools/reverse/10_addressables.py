"""Step 10: Addressables catalog reading (internal ids, providers, resource types).

The catalog stores addresses in binary KeyData; this step reports the plain internal-id
table and the provider/resource-type configuration only, and states that gap explicitly.
"""
from __future__ import annotations

import base64
import json
import collections
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / ".private" / "reverse" / "apk" / "assets" / "aa" / "catalog.json"
OUT = ROOT / "evidence" / "reverse"

CATEGORIES = ("alien", "animals", "christmas", "dinosaurs", "fairytale",
              "princess", "robots", "transport", "underwater")


def decode_keydata(blob: str) -> dict:
    """Bounded structural probe of the catalog KeyData blob.

    Addressables writes: int32 count, then per key: int32 keyType, then type-specific
    payload. Only integer-coded types are decoded; UTF8 string payloads are read with
    explicit length bounds. Result is reported as a probe, not as a full decoder.
    """
    try:
        raw = base64.b64decode(blob)
    except Exception:
        return {"error": "not base64"}
    count = int.from_bytes(raw[:4], "little")
    return {"declared_key_count": count, "decoded_bytes": len(raw)}


def main() -> None:
    cat = json.loads(CATALOG.read_text())
    ids = cat["m_InternalIds"]
    by_group = collections.Counter()
    pages = collections.defaultdict(list)
    for entry in ids:
        m = re.match(r"^Prefabs/([a-z]+)/(\d+)$", entry)
        if m:
            pages[m.group(1)].append(int(m.group(2)))
            by_group["page_prefab"] += 1
            continue
        m = re.match(r"^Prefabs/([a-z]+)/(\w+)$", entry)
        if m:
            by_group[f"prefab_other:{m.group(2)}"] += 1
            continue
        stem = entry.split("/")[0]
        by_group[stem if "/" in entry else "(flat)"] += 1

    data = {
        "evidence_id": "APK-REV-ADDR-001",
        "source_member": "assets/aa/catalog.json",
        "locator_id": cat.get("m_LocatorId"),
        "addressables_version_from_settings": "1.19.19",
        "provider_ids": cat.get("m_ProviderIds"),
        "resource_providers": [
            {"id": p.get("m_Id"), "object_type": p.get("m_ObjectType", {}).get("m_ClassName")}
            for p in cat.get("m_ResourceProviderData", [])
        ],
        "internal_id_count": len(ids),
        "entry_group_counts": dict(by_group.most_common()),
        "page_prefabs_by_category": {k: sorted(v) for k, v in sorted(pages.items())},
        "page_prefab_total": sum(len(v) for v in pages.values()),
        "scenes": [i for i in ids if i.lower().endswith(".unity") or i.startswith("Assets/Scenes")],
        "key_data_probe": decode_keydata(cat.get("m_KeyDataString", "")),
        "bucket_data_present": bool(cat.get("m_BucketDataString")),
        "entry_data_present": bool(cat.get("m_EntryDataString")),
        "gap": ("The address->bundle/location mapping of Addressables 1.19 lives in m_BucketDataString "
                "and m_EntryDataString. Those blobs were not decoded here, so no per-address "
                "location, dependency or bundle assignment is claimed. m_KeyDataString is only probed."),
        "internal_ids": ids,
    }
    (OUT / "addressables.json").write_text(json.dumps(data, indent=1) + "\n")
    print(json.dumps({k: v for k, v in data.items() if k != "internal_ids"}, indent=1)[:2000])


if __name__ == "__main__":
    main()
