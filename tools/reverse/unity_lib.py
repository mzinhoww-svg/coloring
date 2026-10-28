"""Shared helpers for static Unity bundle inspection (UnityPy).

Only reads the private working copy of the APK. No asset payload is exported here.
"""
from __future__ import annotations

import struct
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import UnityPy

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / ".private" / "reverse" / "apk" / "assets" / "bin" / "Data" / "data.unity3d"

SCENE_ORDER = [
    "PreloadScene",
    "IntroScene",
    "MainMenu",
    "GalleryMenu",
    "ColoringPage",
    "ShelfScene",
    "EmptyScene",
    "ForParents",
]


class Bundle:
    def __init__(self) -> None:
        self.env = UnityPy.load(str(BUNDLE))
        self.bf = list(self.env.files.values())[0]
        self.files: Dict[str, Any] = {}
        for name, sf in self.bf.files.items():
            if hasattr(sf, "objects"):
                self.files[name] = sf

    def serialized(self, name: str):
        return self.files[name]

    # ---- PPtr / raw MonoBehaviour helpers -----------------------------------
    @staticmethod
    def read_pptr(raw: bytes, offset: int) -> Tuple[int, int]:
        file_id = struct.unpack_from("<i", raw, offset)[0]
        path_id = struct.unpack_from("<q", raw, offset + 4)[0]
        return file_id, path_id

    def resolve(self, sf, file_id: int, path_id: int):
        if path_id == 0:
            return None
        if file_id == 0:
            return sf.objects.get(path_id)
        ext = sf.externals[file_id - 1]
        target = getattr(ext, "path", None) or str(ext)
        target_sf = self.files.get(target)
        if target_sf is None:
            # externals drop the folder for built-ins
            for name, cand in self.files.items():
                if name.split("/")[-1] == target.split("/")[-1]:
                    target_sf = cand
                    break
        if target_sf is None:
            return None
        return target_sf.objects.get(path_id)

    # ---- MonoBehaviour introspection ---------------------------------------
    @staticmethod
    def mono_header(raw: bytes) -> Dict[str, Any]:
        """m_GameObject PPtr, m_Enabled, m_Script PPtr, m_Name (12-byte PPtrs)."""
        go_file, go_path = Bundle.read_pptr(raw, 0)
        enabled = struct.unpack_from("<I", raw, 12)[0]
        sc_file, sc_path = Bundle.read_pptr(raw, 16)
        name = ""
        str_start = 28
        slen = struct.unpack_from("<i", raw, str_start)[0]
        if 0 < slen < 256:
            try:
                name = raw[str_start + 4:str_start + 4 + slen].decode("utf-8")
            except UnicodeDecodeError:
                name = ""
            field_offset = str_start + 4 + slen
            field_offset += (-field_offset) % 4
        else:
            field_offset = str_start + 4
        return {
            "game_object": go_path,
            "enabled": bool(enabled),
            "script_file_id": sc_file,
            "script_path_id": sc_path,
            "name": name,
            "field_offset": field_offset,
        }

    def script_name(self, sf, file_id: int, path_id: int) -> Optional[str]:
        obj = self.resolve(sf, file_id, path_id)
        if obj is None or obj.type.name != "MonoScript":
            return None
        d = obj.read()
        ns = d.m_Namespace or ""
        cls = d.m_ClassName
        return f"{ns}.{cls}" if ns else cls

    def mono_script(self, sf, obj) -> Optional[Dict[str, Any]]:
        raw = obj.get_raw_data()
        hdr = self.mono_header(raw)
        obj_path = self.resolve(sf, hdr["script_file_id"], hdr["script_path_id"])
        info = {"path_id": obj.path_id, **hdr}
        if obj_path is not None and obj_path.type.name == "MonoScript":
            d = obj_path.read()
            info["script"] = f"{d.m_Namespace}.{d.m_ClassName}" if d.m_Namespace else d.m_ClassName
            info["assembly"] = d.m_AssemblyName
        return info


def rect_to_dict(rt) -> Dict[str, Any]:
    return {
        "anchor_min": [round(rt.m_AnchorMin.x, 4), round(rt.m_AnchorMin.y, 4)],
        "anchor_max": [round(rt.m_AnchorMax.x, 4), round(rt.m_AnchorMax.y, 4)],
        "anchored_position": [round(rt.m_AnchoredPosition.x, 3), round(rt.m_AnchoredPosition.y, 3)],
        "size_delta": [round(rt.m_SizeDelta.x, 3), round(rt.m_SizeDelta.y, 3)],
        "pivot": [round(rt.m_Pivot.x, 4), round(rt.m_Pivot.y, 4)],
        "local_position": [round(v, 3) for v in (rt.m_LocalPosition.x, rt.m_LocalPosition.y, rt.m_LocalPosition.z)],
        "local_scale": [round(v, 4) for v in (rt.m_LocalScale.x, rt.m_LocalScale.y, rt.m_LocalScale.z)],
        "local_rotation": [round(v, 5) for v in (rt.m_LocalRotation.x, rt.m_LocalRotation.y,
                                                 rt.m_LocalRotation.z, rt.m_LocalRotation.w)],
    }
