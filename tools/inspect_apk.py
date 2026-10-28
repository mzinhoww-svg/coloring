"""Bounded, offline inventory. Never executes APK or exports redistributable art."""
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APK = ROOT / 'coloring-1-116(2).apk'
OUT = ROOT / 'evidence' / 'static'
OUT.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(APK) as archive:
    entries = archive.infolist()
    metadata_path = 'assets/bin/Data/Managed/Metadata/global-metadata.dat'
    metadata = archive.read(metadata_path)
    magic, version = struct.unpack_from('<II', metadata)
    assert magic == 0xFAB11BAF, 'Not IL2CPP metadata'
    offset, length = struct.unpack_from('<II', metadata, 24)
    assert offset + length <= len(metadata)
    pattern = re.compile(r'Brush|Paint|Eraser|Stroke|Palette|Gallery|Coloring|Undo|Redo|Glitter|Sticker|Pencil|Crayon|Zoom|SaveDrawing|LoadDrawing|Bucket')
    symbols = []
    cursor = offset
    for raw in metadata[offset:offset + length].split(b'\0'):
        name = raw.decode('utf-8', 'replace')
        if pattern.search(name) and len(name) < 120:
            symbols.append({'name': name, 'file_offset': cursor})
        cursor += len(raw) + 1
    catalog = json.loads(archive.read('assets/aa/catalog.json'))
    inventory = {
        'evidence_id': 'APK-STATIC-001',
        'source': APK.name,
        'sha256': hashlib.sha256(APK.read_bytes()).hexdigest(),
        'bytes': APK.stat().st_size,
        'entry_count': len(entries),
        'abi_libraries': [e.filename for e in entries if e.filename.endswith('/libil2cpp.so')],
        'metadata': {'path': metadata_path, 'version': version,
                     'sha256': hashlib.sha256(metadata).hexdigest(),
                     'symbol_table_offset': offset, 'symbol_table_length': length},
        'members': [{'path': e.filename, 'bytes': e.file_size} for e in entries],
        'catalog_internal_id_count': len(catalog.get('m_InternalIds', [])),
        'limitations': ['Static inventory only.', 'Symbols do not establish reachable behavior.',
                        'No game art exported for redistribution.', 'No runtime/UI equivalence established.'],
    }
    (OUT / 'apk-inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    (OUT / 'candidate-symbols.json').write_text(json.dumps({
        'evidence_id': 'APK-STATIC-002', 'source_sha256': inventory['sha256'],
        'source_member': metadata_path, 'symbols': symbols,
        'classification': 'static symbols; behavior unverified'
    }, indent=2) + '\n')
    print(json.dumps({'sha256': inventory['sha256'], 'members': len(entries),
                      'metadata_version': version, 'candidate_symbols': len(symbols)}))
