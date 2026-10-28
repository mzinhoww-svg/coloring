"""Step 8: colouring-page prefabs — region structure, raster sizes, vector colliders.

Facts: prefab hierarchy, per-region sprite/texture identity and pixel size, PolygonCollider2D
path counts and point extents in local units. No pixel payload is written.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_lib import Bundle  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"
FILE = "resources.assets"


def bbox(paths):
    xs = [p[0] for path in paths for p in path]
    ys = [p[1] for path in paths for p in path]
    if not xs:
        return None
    return {"min": [round(min(xs), 3), round(min(ys), 3)],
            "max": [round(max(xs), 3), round(max(ys), 3)]}


def main() -> None:
    b = Bundle()
    sf = b.files[FILE]

    nodes, gos = {}, {}
    for pid, obj in sf.objects.items():
        t = obj.type.name
        if t in ("Transform", "RectTransform"):
            d = obj.read()
            nodes[pid] = {"go": d.m_GameObject.m_PathID,
                          "father": d.m_Father.m_PathID,
                          "kids": [c.m_PathID for c in d.m_Children],
                          "pos": [round(v, 3) for v in (d.m_LocalPosition.x, d.m_LocalPosition.y,
                                                        d.m_LocalPosition.z)]}
        elif t == "GameObject":
            d = obj.read()
            gos[pid] = {"name": d.m_Name,
                        "comps": [(c.component.m_FileID, c.component.m_PathID) for c in d.m_Component]}

    sprite_cache: dict[int, dict] = {}

    def sprite_info(pid: int) -> dict:
        if pid in sprite_cache:
            return sprite_cache[pid]
        obj = sf.objects.get(pid)
        if obj is None or obj.type.name != "Sprite":
            info = {"sprite_path_id": pid, "resolved": False}
        else:
            d = obj.read()
            tex = d.m_RD.texture
            tex_obj = b.resolve(sf, tex.m_FileID, tex.m_PathID)
            tex_info = {}
            if tex_obj is not None:
                td = tex_obj.read()
                tex_info = {"texture_path_id": tex.m_PathID, "texture_name": td.m_Name,
                            "texture_size": [int(td.m_Width), int(td.m_Height)],
                            "format": int(td.m_TextureFormat) if hasattr(td, "m_TextureFormat") else None}
            info = {
                "sprite_path_id": pid,
                "resolved": True,
                "name": d.m_Name,
                "rect": [round(d.m_Rect.width, 1), round(d.m_Rect.height, 1)],
                "pixels_per_unit": round(d.m_PixelsToUnits, 4) if hasattr(d, "m_PixelsToUnits") else None,
                "packed": bool(d.m_RD.settingsRaw & 1) if hasattr(d.m_RD, "settingsRaw") else None,
                "physics_shape_paths": len(d.m_PhysicsShape) if hasattr(d, "m_PhysicsShape") else 0,
                **tex_info,
            }
        sprite_cache[pid] = info
        return info

    roots = [tid for tid, n in nodes.items() if n["father"] == 0]
    pages = []
    for tid in sorted(roots):
        go = gos.get(nodes[tid]["go"], {})
        if not go or not go["name"].isdigit():
            continue
        regions = []
        root_sprite = None
        for fid, cpid in go["comps"]:
            obj = sf.objects.get(cpid) if fid == 0 else None
            if obj is None:
                continue
            if obj.type.name == "SpriteRenderer":
                root_sprite = sprite_info(obj.read().m_Sprite.m_PathID)
        for kid in nodes[tid]["kids"]:
            kgo = gos.get(nodes[kid]["go"], {})
            entry = {"name": kgo.get("name"), "local_position": nodes[kid]["pos"],
                     "components": []}
            for fid, cpid in kgo.get("comps", []):
                obj = sf.objects.get(cpid) if fid == 0 else None
                if obj is None:
                    continue
                t = obj.type.name
                if t == "SpriteRenderer":
                    entry["sprite"] = sprite_info(obj.read().m_Sprite.m_PathID)
                    entry["components"].append("SpriteRenderer")
                elif t == "PolygonCollider2D":
                    d = obj.read()
                    paths = [[(round(p.x, 3), round(p.y, 3)) for p in path]
                             for path in d.m_Points.m_Paths]
                    entry["collider"] = {
                        "path_count": len(paths),
                        "point_counts": [len(p) for p in paths],
                        "total_points": sum(len(p) for p in paths),
                        "bbox": bbox(paths),
                        "new_size": [round(d.m_SpriteTilingProperty.newSize.x, 3),
                                     round(d.m_SpriteTilingProperty.newSize.y, 3)],
                    }
                    entry["components"].append("PolygonCollider2D")
                else:
                    entry["components"].append(t)
            regions.append(entry)
        # Region/sprite naming encodes pack and page: new-image-<pack>-<page>[-<n>][-outline]
        pack, page_no = None, None
        root_name = (root_sprite or {}).get("name") or ""
        parts = root_name.split("-")
        if len(parts) >= 5 and parts[0] == "new" and parts[1] == "image":
            try:
                pack, page_no = int(parts[2]), int(parts[3])
            except ValueError:
                pack, page_no = None, None
        consistent = (pack is not None and str(int(go["name"]) + 1) == str(page_no))
        pages.append({
            "prefab_root_name": go["name"],
            "transform_path_id": tid,
            "root_sprite": root_sprite,
            "pack_number_from_art_names": pack,
            "page_number_from_art_names": page_no,
            "pack_page_matches_root_name": consistent,
            "region_count": len(regions),
            "regions": regions,
        })

    pages.sort(key=lambda p: (len(p["regions"]), p["transform_path_id"]))
    region_counts = [p["region_count"] for p in pages]
    points = [r["collider"]["total_points"] for p in pages for r in p["regions"]
              if "collider" in r]
    det = [r["collider"]["path_count"] for p in pages for r in p["regions"] if "collider" in r]
    tex_sizes = [tuple(r["sprite"]["texture_size"]) for p in pages for r in p["regions"]
                 if r.get("sprite", {}).get("texture_size")]

    summary = {
        "evidence_id": "APK-REV-PAGES-001",
        "source_member": "assets/bin/Data/data.unity3d::resources.assets",
        "page_prefab_count": len(pages),
        "regions_total": sum(region_counts),
        "regions_per_page": {"min": min(region_counts), "max": max(region_counts),
                             "mean": round(sum(region_counts) / len(region_counts), 2)},
        "collider_paths_per_region": {"min": min(det), "max": max(det)},
        "collider_points_per_region": {"min": min(points), "max": max(points),
                                       "mean": round(sum(points) / len(points), 1)},
        "texture_sizes_observed": sorted({f"{w}x{h}" for w, h in tex_sizes}),
        "method": ("prefab roots whose GameObject name is a decimal index; each child is a region "
                   "with SpriteRenderer + PolygonCollider2D"),
        "pack_numbers_observed": sorted({p["pack_number_from_art_names"] for p in pages
                                         if p["pack_number_from_art_names"]}),
        "pack_page_pairs": len({(p["pack_number_from_art_names"], p["page_number_from_art_names"])
                                for p in pages if p["pack_number_from_art_names"]}),
        "pages_whose_root_name_equals_page_index_minus_1":
            sum(1 for p in pages if p["pack_page_matches_root_name"]),
        "limitation": ("category/pack association is not present on the prefab objects; it is only "
                       "expressible through Addressables addresses"),
    }
    (OUT / "pages-inventory.json").write_text(json.dumps(
        {"summary": summary, "pages": pages}, indent=1) + "\n")
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
