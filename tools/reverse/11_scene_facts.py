"""Step 11: ColoringPage scene facts assembled from native serialized data.

Combines RectTransform geometry, Canvas/CanvasScaler settings and the paint-component
wiring that is directly readable, into one report-ready artifact.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unity_lib import Bundle, rect_to_dict  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "evidence" / "reverse"
LEVEL = "level4"


def main() -> None:
    b = Bundle()
    sf = b.files[LEVEL]

    gos, nodes, rects, owner = {}, {}, {}, {}
    for pid, obj in sf.objects.items():
        t = obj.type.name
        if t == "GameObject":
            d = obj.read()
            gos[pid] = {"name": d.m_Name, "active": bool(d.m_IsActive),
                        "comps": [(c.component.m_FileID, c.component.m_PathID) for c in d.m_Component]}
        elif t in ("Transform", "RectTransform"):
            d = obj.read()
            nodes[pid] = {"go": d.m_GameObject.m_PathID, "father": d.m_Father.m_PathID}
            if t == "RectTransform":
                rects[pid] = rect_to_dict(d)
        # remember which transform owns which GameObject
        if t in ("Transform", "RectTransform"):
            owner[d.m_GameObject.m_PathID] = pid

    def path_of(go_id: int) -> list[str]:
        tid = owner.get(go_id)
        chain = []
        while tid:
            chain.append(gos.get(nodes[tid]["go"], {}).get("name", "?"))
            tid = nodes[tid]["father"]
        return list(reversed(chain))

    canvases = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "Canvas":
            continue
        d = obj.read()
        go = d.m_GameObject.m_PathID
        entry = {"canvas_path_id": pid, "path": "/".join(path_of(go)),
                 "render_mode": int(d.m_RenderMode), "sorting_order": int(d.m_SortingOrder)}
        for fid, cpid in gos.get(go, {}).get("comps", []):
            comp = sf.objects.get(cpid) if fid == 0 else None
            if comp is None:
                continue
            info = b.mono_script(sf, comp)
            if info and info.get("script") == "UnityEngine.UI.CanvasScaler":
                raw = comp.get_raw_data()
                body = raw[b.mono_header(raw)["field_offset"]:]
                mode, ppu, fsf, rx, ry, smode, match = struct.unpack_from("<iffffif", body, 0)
                entry["canvas_scaler"] = {
                    "ui_scale_mode": int(mode), "reference_pixels_per_unit": round(ppu, 3),
                    "reference_resolution": [round(rx, 1), round(ry, 1)],
                    "screen_match_mode": int(smode), "match_width_or_height": round(match, 3),
                }
        canvases.append(entry)

    def comps_of(name: str) -> list[dict]:
        out = []
        for go_id, go in gos.items():
            if go["name"] != name:
                continue
            for fid, cpid in go["comps"]:
                obj = sf.objects.get(cpid) if fid == 0 else None
                if obj is None:
                    continue
                t = obj.type.name
                rec = {"class": t}
                if t == "MonoBehaviour":
                    info = b.mono_script(sf, obj)
                    rec["script"] = (info or {}).get("script")
                out.append(rec)
            out.append({"path": "/".join(path_of(go_id)),
                        "rect": rects.get(owner.get(go_id))})
        return out

    tools = {}
    for tool in ("marker", "pencil", "brush", "spray", "fill", "shine", "pattern"):
        for go_id, go in gos.items():
            if go["name"] != tool:
                continue
            p = path_of(go_id)
            if "Tools" not in p:
                continue
            entry = {"path": "/".join(p), "active": go["active"],
                     "rect": rects.get(owner.get(go_id)), "components": []}
            for fid, cpid in go["comps"]:
                obj = sf.objects.get(cpid) if fid == 0 else None
                if obj is None:
                    continue
                if obj.type.name == "MonoBehaviour":
                    info = b.mono_script(sf, obj)
                    entry["components"].append((info or {}).get("script"))
                else:
                    entry["components"].append(obj.type.name)
            tools[tool] = entry

    buttons = {}
    for btn in ("Save", "Trash", "Undo"):
        for go_id, go in gos.items():
            if go["name"] != btn:
                continue
            p = path_of(go_id)
            if not p or not p[-2].startswith("ButtonsPanel"):
                continue
            entry = {"path": "/".join(p), "rect": rects.get(owner.get(go_id)), "scripts": []}
            for fid, cpid in go["comps"]:
                obj = sf.objects.get(cpid) if fid == 0 else None
                if obj is not None and obj.type.name == "MonoBehaviour":
                    info = b.mono_script(sf, obj)
                    entry["scripts"].append((info or {}).get("script"))
            buttons.setdefault(p[-2], {})[btn] = entry

    palettes = []
    for go_id, go in gos.items():
        if go["name"] in ("ColorsScrollPalette", "PatternsScrollPalette", "ShinesScrollPalette"):
            palettes.append({"name": go["name"], "path": "/".join(path_of(go_id)),
                             "rect": rects.get(owner.get(go_id)),
                             "scripts": [((b.mono_script(sf, sf.objects[c]) or {}).get("script"))
                                         for fid, c in gos[go_id]["comps"]
                                         if fid == 0 and c in sf.objects
                                         and sf.objects[c].type.name == "MonoBehaviour"]})

    paintables = {}
    for pid, obj in sf.objects.items():
        if obj.type.name != "MonoBehaviour":
            continue
        info = b.mono_script(sf, obj)
        if not info or info.get("script") != "PaintablesController":
            continue
        raw = obj.get_raw_data()
        body = raw[info["field_offset"]:]
        fid, pid2 = struct.unpack_from("<iq", body, 0)
        target = b.resolve(sf, fid, pid2)
        try:
            target_name = getattr(target.read(), "m_Name", None) if target is not None else None
        except Exception:
            target_name = None
        paintables = {
            "path": "/".join(path_of(info["game_object"])),
            "_paintablePrefab": {"file_id": fid, "path_id": pid2,
                                 "class": target.type.name if target is not None else None,
                                 "name": target_name},
            "body_bytes": len(body),
        }

    masks = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "MonoBehaviour":
            continue
        info = b.mono_script(sf, obj)
        if not info or info.get("script") != "PaintIn3D.P3dMask":
            continue
        raw = obj.get_raw_data()
        body = raw[info["field_offset"]:]
        tf, tp = struct.unpack_from("<iq", body, 0)
        tex = b.resolve(sf, tf, tp)
        entry = {"path": "/".join(path_of(info["game_object"])), "body_bytes": len(body)}
        if tex is not None:
            try:
                d = tex.read()
            except Exception:
                tex = None
            if tex is not None:
                entry["texture"] = {"class": tex.type.name, "name": getattr(d, "m_Name", None)}
                if tex.type.name == "Texture2D":
                    entry["texture"]["size"] = [int(d.m_Width), int(d.m_Height)]
        if len(body) >= 12:
            entry["channel_byte"] = body[12]
        masks.append(entry)

    back = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "SpriteRenderer":
            continue
        d = obj.read()
        sp = b.resolve(sf, d.m_Sprite.m_FileID, d.m_Sprite.m_PathID)
        nm, rect = None, None
        try:
            if sp is not None:
                sd = sp.read()
                nm = getattr(sd, "m_Name", None)
                rect = [round(sd.m_Rect.width, 1), round(sd.m_Rect.height, 1)]
        except Exception:
            pass
        back.append({"path": "/".join(path_of(d.m_GameObject.m_PathID)), "sprite": nm,
                     "sprite_size": rect})

    cameras = []
    for pid, obj in sf.objects.items():
        if obj.type.name != "Camera":
            continue
        d = obj.read()
        attrs = {k: v for k, v in d.__dict__.items()
                 if k.startswith("m_") and isinstance(v, (int, float, bool))}
        for extra in ("orthographic", "orthographic_size", "near_clip_plane",
                      "far_clip_plane", "field_of_view"):
            value = getattr(d, extra, None)
            if isinstance(value, (int, float, bool)):
                attrs[extra] = value
        cameras.append({"path": "/".join(path_of(d.m_GameObject.m_PathID)), **attrs})

    data = {
        "evidence_id": "APK-REV-COLORINGPAGE-FACTS",
        "source_member": "assets/bin/Data/data.unity3d::level4",
        "scene": "ColoringPage",
        "canvases": canvases,
        "tools": tools,
        "buttons_by_panel": buttons,
        "scroll_palettes": palettes,
        "paintables_controller": paintables,
        "masks": masks,
        "sprite_renderers": back,
        "cameras": cameras,
        "note": ("Geometry values are the serialized RectTransform fields of the scene "
                 "(anchors, anchoredPosition, sizeDelta, pivot) — not measured on a device."),
    }
    (OUT / "coloring-page-facts.json").write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({k: (len(v) if isinstance(v, list) else "obj")
                      for k, v in data.items()}, indent=1))
    print("tools:", {k: (v["rect"] or {}).get("size_delta") for k, v in tools.items()})
    print("buttons:", json.dumps(buttons, indent=1)[:800])


if __name__ == "__main__":
    main()
