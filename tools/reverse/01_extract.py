"""Step 1: verify APK identity and extract only analysis inputs into .private/reverse.

Writes:
  .private/reverse/apk/<member>            (private working copies, never published)
  evidence/reverse/apk-identity.json       (public-safe facts: hashes, sizes, counts)
No original art, font or audio bytes leave .private/reverse.
"""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APK = ROOT / "coloring-1-116(2).apk"
PRIV = ROOT / ".private" / "reverse"
APK_DIR = PRIV / "apk"
OUT = ROOT / "evidence" / "reverse"
EXPECTED_SHA = "1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95"

WANTED_PREFIXES = (
    "assets/bin/Data/",
    "assets/aa/",
    "lib/arm64-v8a/",
    "AndroidManifest.xml",
)
WANTED_EXACT = {"classes.dex", "resources.arsc"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    APK_DIR.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    sha = digest(APK.read_bytes())
    assert sha == EXPECTED_SHA, f"APK digest changed: {sha}"

    members = []
    extracted = []
    with zipfile.ZipFile(APK) as zf:
        for info in zf.infolist():
            rec = {"path": info.filename, "bytes": info.file_size,
                   "crc32": format(info.CRC, "08x"), "sha256": None}
            wanted = info.filename.startswith(WANTED_PREFIXES) or info.filename in WANTED_EXACT
            if wanted and not info.is_dir() and info.file_size < 400 * 1024 * 1024:
                data = zf.read(info.filename)
                rec["sha256"] = digest(data)
                target = APK_DIR / info.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                extracted.append(info.filename)
            members.append(rec)

    identity = {
        "evidence_id": "APK-REV-IDENTITY",
        "source": APK.name,
        "sha256": sha,
        "bytes": APK.stat().st_size,
        "member_count": len(members),
        "extracted_member_count": len(extracted),
        "extraction_root": ".private/reverse/apk (git-ignored, not published)",
        "analysis_inputs": sorted(extracted),
        "members_with_sha256": [m for m in members if m["sha256"]],
        "members_metadata_only": [m for m in members if not m["sha256"]],
        "limitations": [
            "Static bytes only; the APK was not executed.",
            "Art, fonts and audio remain private reference with unconfirmed rights.",
        ],
    }
    (OUT / "apk-identity.json").write_text(json.dumps(identity, indent=2, sort_keys=False) + "\n")
    print(json.dumps({"sha256": sha, "members": len(members), "extracted": len(extracted)}))


if __name__ == "__main__":
    main()
