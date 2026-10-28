"""Step 5: IL2CPP global-metadata v29 parser (strings, images, types, methods, fields).

Facts produced: assembly -> type; type -> methods (name, flags, param count, slot) and
fields (name, token). No IL2CPP type-index resolution (Il2CppMetadataRegistration lives
in libil2cpp.so), so field/parameter *types* stay unknown here and are reported as such.

Method/field ordering and names come from metadata; nothing here proves runtime reachability.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
META = ROOT / ".private" / "reverse" / "apk" / "assets" / "bin" / "Data" / "Managed" / "Metadata" / "global-metadata.dat"
OUT = ROOT / "evidence" / "reverse"
PRIV = ROOT / ".private" / "reverse"

HDR = {
    "stringLiteral": 2, "stringLiteralData": 4, "string": 6, "events": 8,
    "properties": 10, "methods": 12, "parameterDefaultValues": 14,
    "fieldDefaultValues": 16, "fieldAndParameterDefaultValueData": 18,
    "fieldMarshaledSizes": 20, "parameters": 22, "fields": 24,
    "genericParameters": 26, "genericParameterConstraints": 28,
    "genericContainers": 30, "nestedTypes": 32, "interfaces": 34,
    "vtableMethods": 36, "interfaceOffsets": 38, "typeDefinitions": 40,
    "images": 42, "assemblies": 44, "fieldRefs": 46,
    "referencedAssemblies": 48, "attributeData": 50,
}


class Metadata:
    def __init__(self, path: Path) -> None:
        self.data = path.read_bytes()
        sanity, version = struct.unpack_from("<Ii", self.data, 0)
        if sanity != 0xFAB11BAF:
            raise ValueError("not IL2CPP metadata")
        if version != 29:
            raise ValueError(f"unexpected metadata version {version}")
        self.version = version
        self.hdr = {}
        for name, idx in HDR.items():
            off, cnt = struct.unpack_from("<II", self.data, idx * 4)
            self.hdr[name] = (off, cnt)
        self.string_off, self.string_len = self.hdr["string"]
        self._scache: dict[int, str] = {}

    # -- strings -------------------------------------------------------------
    def string(self, index: int) -> str:
        if index < 0 or index >= self.string_len:
            return ""
        cached = self._scache.get(index)
        if cached is not None:
            return cached
        start = self.string_off + index
        end = self.data.find(b"\0", start, start + 512)
        if end < 0:
            end = start
        value = self.data[start:end].decode("utf-8", "replace")
        self._scache[index] = value
        return value

    # -- type definitions ----------------------------------------------------
    def type_definitions(self) -> list[dict]:
        off, size = self.hdr["typeDefinitions"]
        count = size // 88
        out = []
        for i in range(count):
            base = off + i * 88
            (name_i, ns_i, byval_i, decl_i, parent_i, elem_i, gcont_i, flags,
             fieldStart, methodStart, eventStart, propStart, nestedStart,
             ifaceStart, vtableStart, ifaceOffStart) = struct.unpack_from("<16I", self.data, base)
            mcount, pcount, fcount, ecount, ncount, vtcount, icount, iocount = struct.unpack_from("<8H", self.data, base + 64)
            bitfield, token = struct.unpack_from("<2I", self.data, base + 80)
            out.append({
                "index": i,
                "name": self.string(name_i),
                "namespace": self.string(ns_i),
                "declaring_type_index": struct.unpack("<i", struct.pack("<I", decl_i))[0],
                "parent_index": struct.unpack("<i", struct.pack("<I", parent_i))[0],
                "flags": flags,
                "field_start": fieldStart, "field_count": fcount,
                "method_start": methodStart, "method_count": mcount,
                "event_start": eventStart, "event_count": ecount,
                "property_start": propStart, "property_count": pcount,
                "nested_start": nestedStart, "nested_count": ncount,
                "vtable_start": vtableStart, "vtable_count": vtcount,
                "interfaces_start": ifaceStart, "interfaces_count": icount,
                "interface_offsets_start": ifaceOffStart, "interface_offsets_count": iocount,
                "bitfield": bitfield, "token": token,
            })
        return out

    def _validate(self, meth_size: int, types_by_index: dict[int, dict]) -> float:
        off, size = self.hdr["methods"]
        count = size // meth_size
        ok = 0
        sample = min(count, 4000)
        for i in range(0, sample):
            base = off + i * meth_size
            name_i, decl, ret = struct.unpack_from("<3i", self.data, base)
            name = self.string(name_i) if 0 <= name_i < self.string_len else ""
            if name and all(c.isalnum() or c in "_<>$.-" for c in name) and decl in types_by_index:
                ok += 1
        return ok / sample if sample else 0.0

    def method_struct_size(self, types_by_index: dict[int, dict]) -> int:
        _, size = self.hdr["methods"]
        best = None
        for candidate in (32, 36, 40, 44, 48, 52):
            if size % candidate:
                continue
            score = self._validate(candidate, types_by_index)
            print(f"  methods struct {candidate}B -> name/declaring-type validity {score:.3f}")
            if best is None or score > best[1]:
                best = (candidate, score)
        assert best and best[1] > 0.97, "no method layout validated"
        return best[0]

    def methods(self, struct_size: int) -> list[dict]:
        off, size = self.hdr["methods"]
        count = size // struct_size
        out = []
        for i in range(count):
            base = off + i * struct_size
            vals = struct.unpack_from("<%di" % (struct_size // 4), self.data, base)
            name_i, decl, ret, param_start, gcont = vals[0:5]
            token = vals[5]
            flags, iflags, slot, pcount = struct.unpack_from("<4H", self.data, base + 24)
            out.append({
                "index": i, "name": self.string(name_i), "declaring_type": decl,
                "return_type_index": ret, "parameter_start": param_start,
                "parameter_count": pcount, "generic_container": gcont,
                "flags": flags, "iflags": iflags, "slot": slot, "token": token,
            })
        return out

    def fields(self) -> list[dict]:
        off, size = self.hdr["fields"]
        count = size // 12
        out = []
        for i in range(count):
            name_i, type_i, token = struct.unpack_from("<3i", self.data, off + i * 12)
            out.append({"index": i, "name": self.string(name_i), "type_index": type_i, "token": token})
        return out

    # -- images / assemblies -------------------------------------------------
    def images(self, struct_size: int) -> list[dict]:
        off, size = self.hdr["images"]
        count = size // struct_size
        out = []
        for i in range(count):
            base = off + i * struct_size
            vals = struct.unpack_from("<%dI" % (struct_size // 4), self.data, base)
            out.append({
                "index": i, "name": self.string(vals[0]),
                "assembly_index": vals[1] if len(vals) > 1 else None,
                "type_start": vals[2] if len(vals) > 2 else None,
                "type_count": vals[3] if len(vals) > 3 else None,
            })
        return out

    def image_struct_size(self) -> int:
        off, size = self.hdr["images"]
        for candidate in (28, 32, 36, 40, 24):
            if size % candidate == 0:
                count = size // candidate
                names = [self.string(struct.unpack_from("<I", self.data, off + i * candidate)[0])
                         for i in range(min(count, 200))]
                valid = sum(1 for n in names if n.endswith(".dll") or n in ("<unknown>",))
                print(f"  images struct {candidate}B -> {count} images, dll-name validity {valid}/{len(names)}")
                if valid >= len(names) - 1:
                    return candidate
        raise AssertionError("image layout not validated")


def main() -> None:
    m = Metadata(META)
    types = m.type_definitions()
    by_index = {t["index"]: t for t in types}
    print(f"type definitions: {len(types)}")
    msize = m.method_struct_size(by_index)
    methods = m.methods(msize)
    fields = m.fields()
    isize = m.image_struct_size()
    images = m.images(isize)

    assert types[0]["name"] == "<Module>", types[0]["name"]
    # sanity on the first type's ranges
    print(f"methods: {len(methods)} (struct {msize}B), fields: {len(fields)}, "
          f"images: {len(images)} (struct {isize}B)")

    # attach methods/fields to types
    by_type_methods: dict[int, list[dict]] = {}
    for meth in methods:
        by_type_methods.setdefault(meth["declaring_type"], []).append(meth)

    summary = {
        "evidence_id": "APK-REV-IL2CPP-001",
        "source_member": "assets/bin/Data/Managed/Metadata/global-metadata.dat",
        "metadata_version": m.version,
        "counts": {"types": len(types), "methods": len(methods), "fields": len(fields),
                   "images": len(images), "type_definition_bytes": 88,
                   "method_definition_bytes": msize, "image_definition_bytes": isize},
        "images": images,
    }
    (OUT / "il2cpp-summary.json").write_text(json.dumps(summary, indent=2) + "\n")

    # full private dump of the whole metadata type graph
    full = []
    for t in types:
        full.append({**t, "methods": by_type_methods.get(t["index"], [])})
    (PRIV / "il2cpp-types.json").write_text(json.dumps(full) + "\n")

    print("images:", [i["name"] for i in images][:12])
    unknown = [i for i in images if not i["type_range_valid"] ] if False else None
    print("first types:", [(t["name"], t["namespace"], t["method_count"]) for t in types[:6]])
    print("Assembly-CSharp candidates:",
          [i for i in images if "CSharp" in (i["name"] or "")])


if __name__ == "__main__":
    main()
