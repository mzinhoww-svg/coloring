"""Step 3: exact scene graph + RectTransform geometry per scene.

Facts: GameObject names, hierarchy, RectTransform anchors/positions/sizes, scale,
native component classes, MonoBehaviour script class names.
Inference: none produced here (labels only, no UI semantics asserted).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_lib import Bundle, SCENE_ORDER, rect_to_dict  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse" / "scenes"


def build_scene(b: Bundle, level: str, scene_name: str) -> dict:
    sf = b.serialized(level)
    objects = sf.objects

    gos = {}
    transforms = {}
    rect = {}
    monos = {}
    for pid, obj in objects.items():
        t = obj.type.name
        if t == "GameObject":
            d = obj.read()
            comps = []
            for c in d.m_Component:
                ptr = c.component if hasattr(c, "component") else c[1] if isinstance(c, tuple) else c
                comps.append((ptr.m_FileID, ptr.m_PathID))
            gos[pid] = {"name": d.m_Name, "active": bool(d.m_IsActive),
                        "layer": d.m_Layer, "tag": d.m_Tag, "components": comps}
        elif t in ("Transform", "RectTransform"):
            d = obj.read()
            entry = {
                "game_object": d.m_GameObject.m_PathID,
                "father": d.m_Father.m_PathID,
                "children": [c.m_PathID for c in d.m_Children],
                "local_rotation": [round(v, 5) for v in (d.m_LocalRotation.x, d.m_LocalRotation.y,
                                                         d.m_LocalRotation.z, d.m_LocalRotation.w)],
                "local_position": [round(v, 3) for v in (d.m_LocalPosition.x, d.m_LocalPosition.y,
                                                         d.m_LocalPosition.z)],
                "local_scale": [round(v, 4) for v in (d.m_LocalScale.x, d.m_LocalScale.y,
                                                      d.m_LocalScale.z)],
            }
            transforms[pid] = entry
            if t == "RectTransform":
                rect[pid] = rect_to_dict(d)
                rect[pid]["father"] = d.m_Father.m_PathID
                rect[pid]["children"] = [c.m_PathID for c in d.m_Children]

    # component detail for native UI classes and MonoBehaviour script names
    detail = {}
    for pid, obj in objects.items():
        t = obj.type.name
        if t == "MonoBehaviour":
            info = b.mono_script(sf, obj)
            monos[pid] = info
            if info:
                detail[pid] = {"class": "MonoBehaviour", "script": info.get("script"),
                               "assembly": info.get("assembly"), "enabled": info.get("enabled")}
        elif t in ("Canvas", "CanvasScaler", "Camera", "Animator", "SpriteRenderer"):
            try:
                d = obj.read()
                entry = {"class": t}
                if t == "Canvas":
                    entry.update({"render_mode": int(d.m_RenderMode),
                                  "sorting_order": int(d.m_SortingOrder),
                                  "pixel_perfect": bool(d.m_PixelPerfect)})
                elif t == "Camera":
                    entry.update({"orthographic": bool(d.m_Orthographic),
                                  "ortho_size": round(d.m_OrthographicSize, 4),
                                  "depth": round(d.m_Depth, 3),
                                  "culling_mask": d.m_CullingMask})
                detail[pid] = entry
            except Exception:
                pass

    # assemble hierarchy rooted at transforms whose father is 0
    def node(tid: int, depth: int) -> dict:
        tr = transforms.get(tid, {})
        go_id = tr.get("game_object")
        go = gos.get(go_id, {})
        comp_classes = []
        comp_detail = []
        for fid, cpid in go.get("components", []):
            cobj = objects.get(cpid) if fid == 0 else None
            if cobj is None:
                continue
            comp_classes.append(cobj.type.name)
            if cpid in detail:
                comp_detail.append(detail[cpid])
        n = {
            "transform_id": tid,
            "game_object_id": go_id,
            "name": go.get("name"),
            "active": go.get("active"),
            "components": comp_classes,
            "component_detail": comp_detail,
            "depth": depth,
        }
        if tid in rect:
            n["rect"] = rect[tid]
        if tr:
            n["local_position"] = tr["local_position"]
            n["local_scale"] = tr["local_scale"]
            n["local_rotation"] = tr["local_rotation"]
        kids = [c for c in transforms.get(tid, {}).get("children", []) if c in transforms]
        n["children"] = [node(c, depth + 1) for c in kids]
        return n

    roots = [tid for tid, tr in transforms.items() if tr["father"] == 0]
    roots.sort()
    return {
        "level": level,
        "scene": scene_name,
        "serialized_file": level,
        "externals": [getattr(e, "path", str(e)) for e in sf.externals],
        "object_count": len(objects),
        "gameobject_count": len(gos),
        "recttransform_count": len(rect),
        "roots": [node(r, 0) for r in roots],
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    b = Bundle()
    summary = []
    for idx, name in enumerate(SCENE_ORDER):
        level = f"level{idx}"
        if level not in b.files:
            continue
        scene = build_scene(b, level, name)
        (OUT / f"{level}-{name}.json").write_text(json.dumps(scene, indent=1) + "\n")
        summary.append({
            "level": level, "scene": name,
            "objects": scene["object_count"],
            "gameobjects": scene["gameobject_count"],
            "recttransforms": scene["recttransform_count"],
            "roots": [r["name"] for r in scene["roots"]],
        })
        print(f"{level:7s} {name:13s} objects={scene['object_count']:5d} "
              f"rects={scene['recttransform_count']:4d} roots={len(scene['roots'])}")
    (OUT / "summary.json").write_text(json.dumps({
        "evidence_id": "APK-REV-SCENE-SUMMARY",
        "source_member": "assets/bin/Data/data.unity3d",
        "scene_order_from_buildsettings": SCENE_ORDER,
        "scenes": summary,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
