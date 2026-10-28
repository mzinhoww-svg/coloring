# Reverse engineering report — coloring-1-116(2).apk

Evidence id prefix: `APK-REV-*`. Static analysis only. The APK was never executed, no
emulator/device was used, and no network service was contacted.

| Field | Value |
|---|---|
| Artifact | `coloring-1-116(2).apk` |
| SHA-256 | `1bb17ff5d70eae1a4287d67832deccfc5f24ae23948db4667842756f418d9d95` |
| Size | 135,423,615 bytes |
| Package / version (inherited from `docs/APK_FINDINGS.md`) | `com.bimiboo.coloring`, 1.116 (746) |
| Engine | Unity `2021.3.33f1`, IL2CPP metadata version 29 |
| Analysis date | 2026-10-28 |
| Tools | Python 3.9.6 in `.venv`, UnityPy 1.25.4, custom IL2CPP metadata parser (`tools/reverse/05_il2cpp_metadata.py`) |

## 1. Scope and handling

* All work stayed inside `tools/reverse/`, `evidence/reverse/`, `.private/reverse/` and `.venv/`.
  No application/game code and no root continuity document was modified.
* The APK was unpacked into `.private/reverse/apk/` (git-ignored). Every extracted member keeps
  its SHA-256 in `evidence/reverse/apk-identity.json` (23 of 197 members, chosen by prefix).
* **No art, font, audio or text asset payload was published.** Public evidence files contain
  object names, path ids, integer geometry, colour values and symbol names only. Textures were
  read for dimensions, never for pixels.
* Rights remain unconfirmed: the extracted material is private reference, not redistributable.

## 2. Bundle structure (fact)

`assets/bin/Data/data.unity3d` (73,265,690 bytes) is a UnityFS bundle containing 27 files — 20 serialized
files (8 scene levels + 12 shared) and 7 `.resS` streams — with 27,704 objects.

| Serialized file | Objects | Content |
|---|---|---|
| `globalgamemanagers` | 19 | BuildSettings (8 scenes), managers |
| `globalgamemanagers.assets` | 1,697 | 1,694 `MonoScript` objects (all script identities) |
| `resources.assets` | 18,020 | 135 colouring-page prefabs, 2,566 textures, 2,563 sprites, 2,061 `PolygonCollider2D` |
| `sharedassets2.assets` | 2,824 | MainMenu prefabs (9 packs, 213 `ItemsAnimation`) |
| `sharedassets4.assets` | 251 | the `paintable` prefab + `PaletteColor` prefab + brush textures |
| `sharedassets5.assets` | 128 | shelf item prefabs |
| `sharedassets7.assets` | 1,100 | ForParents UI |
| `level0..level7` | 10 / 85 / 380 / 457 / 667 / 225 / 18 / 1,764 | the eight scenes |

`BuildSettings.m_Scenes` order (fact, read from `globalgamemanagers`) maps level index to scene:
`PreloadScene, IntroScene, MainMenu, GalleryMenu, ColoringPage, ShelfScene, EmptyScene, ForParents`.
`docs/design/DESIGN_EVIDENCE.md` listed six catalogued scenes; the build actually contains eight — the two
extra are `ShelfScene` (`Assets/unity-utils/More apps/ShelfScene.unity`) and `ForParents`
(`Assets/BBToolkitAppIntegration/ForParents/Scenes/ForParents.unity`).

**Consequence for parity:** "nine categories" is confirmed (Addressables), "six scenes" is not:
there are eight, and `ColoringPage` is level4.

## 3. ColoringPage scene layout (fact)

667 objects, 151 GameObjects, 128 RectTransforms, 234 MonoBehaviours. Full geometry for every
node is in `evidence/reverse/scenes/level4-ColoringPage.json`; the assembled UI/tool facts are in
`evidence/reverse/coloring-page-facts.json`.

### Canvases

| Canvas | Render mode | Sorting order | CanvasScaler |
|---|---|---|---|
| `Background` | 1 (ScreenSpaceCamera) | -1 | ScaleWithScreenSize, 800×1080, match 1.0 |
| `Draw/DrawCanvas` | 0 (ScreenSpaceOverlay) | 0 | ScaleWithScreenSize, 800×1080, match 1.0 |
| `Draw/Canvas` | 0 | 0 | ConstantPixelSize, 800×600 |
| `Purchase panel` | 0 | 7 | ScaleWithScreenSize, 1600×1000, match 1.0 |
| `LoadingLayerCanvas` | 0 | 9999 | ConstantPixelSize, 800×600 |

`Main Camera` is the only camera in the scene and carries `Physics2DRaycaster`, i.e. painting
input reaches 2D colliders through UI/physics raycasting. Camera serialized fields: **orthographic
= true, orthographic size 5.0**, near 0.3, far 1000, depth −1, clear flags 1, HDR on.

### Tool strip (`Draw/DrawCanvas/ToolsPanel`, 291×1536, anchor right-centre, pos (−145.5, −1))

Seven visible tool entries, each `260×140`, anchored centre, x = 43.3, stacked 130 units apart:

| y | Tool node | Extra components |
|---|---|---|
| +400 | `marker` | `Image`, `Brush` |
| +260 | `pencil` | `Image`, `Brush` |
| +130 | `brush` | `Image`, `Brush` |
| 0 | `spray` | `Image`, `Brush` |
| −130 | `fill` | `Image`, `Brush` |
| −260 | `shine` | `Image`, `Brush` |
| −400 | `pattern` | `Image`, `Brush` |

Each entry has three children `outline` (252×130), `color` (236×108), `main` (243×121). A disabled
duplicate `ToolsPanelTabet` holds an untagged tablet variant (269.4×140 entries, y 368.8 → −369.9).
`ManageTools` owns `colors / shines / patterns / brushes / palettes`; `Brush` (12 fields, incl.
`brushType`, `outline`, `color`, `_currentBrush`, `_idColor`) drives selection.

### Side buttons (`ButtonsPanel`, 228.06×1080, bottom-left anchored)

| Button | Anchors | Position | Size | Scripts |
|---|---|---|---|---|
| `Save` | (0.5, 1.0) | (0, −115) | 150×150 | `Image`, `Button` |
| `Trash` | (0.5, 0.0) | (0, 291) | 150×150 | `Image`, `Button` |
| `Undo` | (0.5, 0.0) | (0, 115) | 150×150 | `Image`, `Button`, `PaintIn3D.P3dButtonUndoAll` |

A disabled `ButtonsPanelTablet` mirrors the trio with `P3dButtonUndoAll` on `Undo` as well.
**There is no redo button in the scene.** `P3dButtonRedoAll` exists as a compiled type and a
`MonoScript`, but no scene object references it (fact: zero attachments in any serialized file).

`clear all` (`P3dButtonClearAll`) sits at the canvas root, 100×100 at the centre.

### Palettes (`Palettes` → three scroll panels, each 156×1080 at x = 706.19)

`ColorsScrollPalette`, `PatternsScrollPalette`, `ShinesScrollPalette`, each with
`Image + ScrollRect + PaletteController` and a `Content` node (`PaletteContent`) plus a
`triangle` marker (62×105). `PaletteContent` serialized fields confirm three instances
(`_typePalette` = 0/1/2, `_paletteColorPrefab` = prefab path 251 in `sharedassets4.assets`,
`_managePhysicalBrushes` = path 602). `PanelLockButtons` (disabled) holds `top`/`bottom` lock
buttons of 152×152. The 40 palette colours are in §5.

## 4. Painting mechanics (fact, with the inference boundary marked)

The eight physical brush objects live under `Draw/all-brushes` (`ManagePhysicalBrushes`):

| Node | Attached paint components (serialized) | Active at start |
|---|---|---|
| `marker` | `P3dHitScreenFill`, `P3dPaintSphere`, `DinamicInterval` | yes |
| `pencil` | `P3dHitScreenFill`, `P3dPaintSphere`, `DinamicInterval` | no |
| `brush` | `P3dHitScreenFill`, `P3dPaintDecal`, `DinamicInterval` | no |
| `spray` | `P3dHitScreenFill`, `P3dPaintDecal`, `DinamicInterval` | no |
| `fill` | `P3dHitScreen`, `P3dPaintSphere` | no |
| `shine-brush` | `P3dHitScreenFill`, `P3dPaintSphere`, `DinamicInterval` | no |
| `pattern-brush` | `P3dHitScreenFill`, `P3dPaintSphere`, `DinamicInterval` | no |
| `otherLayerFill` | `P3dHitScreen`, `P3dPaintFill` | no |

Reading of that table:

* **Fact.** Two hit-sampling strategies exist: `P3dHitScreenFill` (continuous strokes, screen path
  interpolated) for marker/pencil/brush/spray/shine/pattern, and plain `P3dHitScreen` (single tap)
  for `fill` and `otherLayerFill`.
* **Fact.** Two decal families exist: sphere stamps (`P3dPaintSphere`) and texture decals
  (`P3dPaintDecal` for `brush` and `spray`).
* **Fact.** `DinamicInterval` (`_hitScreenFill`, `_minInterval`, `_maxInterval`; `Start`, `Update`)
  is attached only to the continuous brushes: it is the app-side stamp-interval driver.
* **Fact.** `Draw/mask` carries `P3dMask` with `channel` byte = 3 and **no serialized texture**
  (texture assigned at runtime → inference).
* **Fact (negative).** `P3dPaintableTexture`, `P3dPaintable`, `P3dModel` are **not serialized
  anywhere** in the bundle; `PaintablesController._paintablePrefab` points to path 249 of
  `sharedassets4.assets`, the `paintable` prefab, whose `Paintable` MonoBehaviour body is 12 bytes.
  The app class `Paintable` has exactly `_texture`, `_paintableTexture`, `_p3DPaintable` and the
  methods `Initialize`, `Undo`, `SetActivePainting`.
  → **Inference:** each paintable layer and its `P3dPaintableTexture` are created/attached at
  runtime by `Paintable.Initialize`. Static data cannot show the render-target size, the layer
  count or the undo depth.
* **Fact.** `Draw/board` = `PaintablesController` with `_paintablePrefab` (above) and
  `_backTexture`, which resolves to the transform of the child named `back texture` (that child
  carries a `SpriteRenderer` whose sprite pointer is null, i.e. assigned per page at runtime).
  `_paintables` and `_quantityPaitables` are serialized as 0.
* **Fact.** `DinamicInterval` serializes exactly `_hitScreenFill`, `_minInterval`, `_maxInterval`
  and runs only `Start`/`Update`: it drives a randomised interval between successive
  `P3dHitScreenFill` stamps (spray/marker density), per its own field names and method set.
* **Fact.** All serialized paint parameters on the brush components are library defaults
  (`layers = 0x7FFFFFFF`, opacity/angle/scale = 1, colour = 0,0,0,0). Radius, hardness, colour and
  interval are therefore **not** stored in the scene; they come from `ManagePhysicalBrushes`
  (`ChangeColor`, `ActivateBrush`, `GetAverageColor`) at runtime.
* **Inference (not verified).** `fill` + `P3dPaintSphere` on a single hit, combined with the
  2,061 region `PolygonCollider2D`s and `Physics2DRaycaster`, is consistent with "tap a region,
  the region's collider is hit, the active paintable texture receives a fill". The static data
  does not contain the code path that maps a hit collider to a mask, so this stays a hypothesis.
* Persistence: `[Save&Load]` root with `SaveImage` + `LoadImage`; class `LoadStrokes` (field `strokeTextures`) is
  a prefab in every category; `ColoringPageDataManager` (16 methods, events
  `OnActiveBrushChanged/OnActiveColorIDChanged/OnActivePaletteChanged`,
  `GetLastActiveColorID`, `ResetActiveColors`) holds session state. The on-disk format is unknown
  and was not reconstructed (PlayerPrefs vs. file vs. PNG dump — undetermined).

## 5. Palette, shines and patterns (fact)

`ManageTools.colors` and `ManagePhysicalBrushes.drawColors` both serialize the **same 40 RGBA
colours** (byte-identical arrays, alpha = 1.0). The array in `ManagePhysicalBrushes` starts at body
offset 12 (after two unidentified leading scalars); the array in `ManageTools` starts at offset 0.

```
0 #A62E27  1 #E84E46  2 #E07673  3 #F1B1B0   4 #EB8745  5 #EFAA77  6 #F2C6A5   7 #F9DA49
8 #FDFB60  9 #F9EEA2 10 #878E2B 11 #ADB63A  12 #CBF04D 13 #3F8B26 14 #5CC63A  15 #80F95C
16 #409074 17 #5DCBA3 18 #77F6CC 19 #4499AA 20 #5DCAE2 21 #9ED3DC 22 #27529F 23 #3E77DB
24 #9FC2F6 25 #6A31A7 26 #A056F1 27 #D3B3F6 28 #9932A8 29 #DB4FF0 30 #E8A4F4 31 #AB3D71
32 #E7579A 33 #EEA1C7 34 #5C4535 35 #837062 36 #686D71 37 #A5ABB2 38 #313335 39 #FFFFFF
```

Structure is visible in the data: ten families of three tints plus ten neutrals
(red, orange, yellow, yellow-green, green, teal, blue, violet, purple, pink, then browns/greys).
Order in the scroll list is **not** proven to follow array order (inference).

`ManageTools.shines` = 15 sprite references named `shine-tool-colors_1..15`;
`ManageTools.patterns` = 20 sprite references named `pattern-tool-colors_1..20`. All 35 PPtrs
resolve inside the bundle (0 unresolved). Corresponding textures ship as 234×234 (171 textures)
and 244×244 (36), i.e. tile-shaped art.

## 6. Drawing representation (fact)

A page is a prefab in `resources.assets` whose root GameObject is named `0` … `14`.

```
<page>                       SpriteRenderer  (outline sprite, 1346×1346 px)
├── new-image-<pack>-<page>-1   SpriteRenderer (512² or 1024² region art) + PolygonCollider2D
├── …
└── new-image-<pack>-<page>-N
```

| Measure | Value |
|---|---|
| Page prefabs | 135 |
| Regions total | 2,061 (min 6, max 35, mean 15.27 per page) |
| Region art size | 512×512 (most), 1024×1024, outline layer 1346×1346 |
| Collider paths per region | 1 … 11 |
| Collider points per region | 4 … 1,498 (mean 79.6) |
| Collider local size | e.g. 13.46 × 13.46 units for a 512² region (≈38.04 px per unit) |

So the representation is **hybrid**:

1. **Raster**: each region is its own RGBA sprite/texture; the line art is a separate 1346² sprite.
   Regions are never a single flattened image — the paint result must be composited from layers.
2. **Vector**: each region carries a `PolygonCollider2D` with the actual polygon(s) in local units,
   plus the sprite's own `m_PhysicsShape`. These polygons are the hit-test/fill geometry.
3. **No serialized paint buffers.** No `RenderTexture` and no `P3dPaintableTexture` exists in the
   bundle, so the painted surface is created at runtime (inference, §4).

Sprite naming (`new-image-<pack>-<page>[-<region>][-outline]`) encodes pack 1–9 and page 1–15;
observed pack numbers are exactly 1…9, 133 distinct (pack, page) pairs among 135 prefabs, and
129/135 prefabs have `root name == page − 1`. Six prefabs deviate, so the encoding is a strong
naming convention, **not** a verified address key.

## 7. Content catalogue and Addressables (fact)

`assets/aa/catalog.json` is an Addressables 1.19.19 `ContentCatalogData` with **578 internal ids**,
provider `UnityEngine.ResourceManagement.ResourceProviders.LegacyResourcesProvider` (Resources
based, no asset bundles ship in the APK).

* 135 ids of the form `Prefabs/<category>/<0..14>`, 15 for each of
  `alien, animals, christmas, dinosaurs, fairytale, princess, robots, transport, underwater`.
* 9 × `Prefabs/<cat>/Gallery` and 9 × `Prefabs/<cat>/LoadStrokes`.
* 218 `localization/...` ids, 46 `images/...`, 16 `intro-animation/...`, 11 `font/...`,
  11 `Shaders/...`, 8 `sounds/...`, plus 10 misc prefabs.
* **Gap:** the address→location mapping of Addressables 1.19 lives in `m_BucketDataString` /
  `m_EntryDataString`; those blobs were only probed (declared key count 1,166), not decoded.
  No per-address bundle/dependency claim is made.

## 8. Media inventory (fact, names and sizes only)

| Class | Count | Notes |
|---|---|---|
| `Texture2D` | 3,039 | 512² ×2,039; 1346² ×148; 234² ×171; 1157×309 ×48; 1024² ×16; 244² ×36 |
| `Sprite` | 3,031 | 2,563 in `resources.assets` |
| `AudioClip` | 245 | names/sample metadata recorded; no audio extracted |
| `Font` | 19 | TMP asset objects; font binaries untouched |
| `Shader` | 69 | includes the Paint in 3D shader family |
| `Material` | 66 | |

Full lists: `evidence/reverse/media-inventory.json`.

## 9. Application code surface (fact)

IL2CPP metadata v29 parsed directly (no typetrees exist for MonoBehaviours in this build, so
MonoBehaviour payloads were walked with Unity's `int32 count + payload, 4-byte aligned` rules and
validated as described below).

| Measure | Value |
|---|---|
| Metadata images (assemblies) | 87 |
| Type definitions | 9,580 |
| Method definitions | 67,529 (32-byte records, validated 100 % on name/declaring-type) |
| Field definitions | 38,744 |
| `Assembly-CSharp.dll` | 441 types, 3,012 methods (index: `app-types-index.json`) |
| `PaintIn3D.dll` | 161 types (full library compiled in, `CW.Common` too) |
| `MonoScript` objects in build | 1,694; 350 belong to `Assembly-CSharp` |

Key app types (names, serialized fields, method names and arity in
`evidence/reverse/app-type-methods.json`):

| Type | Fields (serialized order) | Methods |
|---|---|---|
| `ColoringPage` | `_buttonsTablet, _buttonsStandart, _tools, layersSelection, loadImage, paintable, paintableSecondary, texture, btnTrash, btnTrashTablet, btnUndo, btnUndoTablet, layerSelection, audioManager, _back, _frontground, _p3DButtonClearAll, _seq, layersPrefab, selectedBoardName, theTime` | `Awake, Start, SetupSecondaryPaintable, LoadPrefab, OnButtonSave, OnButtonUndo, OnButtonTrash, Update, OnDestroy` |
| `Paintable` | `_texture, _paintableTexture, _p3DPaintable` | `Initialize, Undo, SetActivePainting` |
| `PaintablesController` | `_paintablePrefab, _backTexture, _paintables, _quantityPaitables` | `Start, Clear, SetActivePainting` |
| `Brush` | `brushType, outline, color, manageTools, _audioManager, _managePhysicalBrushes, _palettes, _audioSource, _currentBrush, _seq, _idColor, isEnabledBrush` | `Start, Starter, GetBrushType, EnableOutline, DisableOutline, SetColor, ChangeColor, ChangeSprite, OnPointerDown, OnDestroy` |
| `ManageTools` | `colors, shines, patterns, brushes, palettes, _audioManager, _colorChanging` | `GetPattern, GetShine, OnEnable, Start, UpdateBrushPresets, InitialBrushesSetup, ChangeBrushColorOrSprite, EnableCorrespondingPalette, ChangeCurrentPaletteItem, OnDestroy` |
| `ManagePhysicalBrushes` | `tileScale, drawColors, drawColorsShines, drawColorsPatterns, drawPatterns, typePatterns, pixelsPerMultiplierPatterns, drawShines, physicalBrushes, CurrentCollor` | `get_CurrentCollor, get_GetColors, get_GetPatterns, get_GetTypePatterns, get_PixelsPerMultiplierPatterns, get_GetShines, OnEnable, Start, OnDestroy, ActivateBrush, DisableBrushes, ChangeColor, GetAverageColor` |
| `PaletteController` | `_paletteContent, _contentRect, _seq, _isDrag` | `get_GetContent, Create, OnPointerClick, OnBeginDrag, OnEndDrag, MoveScroll, CheckBrush, SetPosition` |
| `PaletteContent` | `_paletteColorPrefab, _managePhysicalBrushes, _typePalette, _rectTransform, _paletteColors, _lastPaletteColor, _maxPosition, _minPosition, _positionY, _activeId, _currentId` | `OnEnable, Create, Update, CheckCurrentColor, IsOpenedColor, CheckPosition` |
| `ColoringPageDataManager` | `OnActiveBrushChanged, OnActiveColorIDChanged, OnActivePaletteChanged, _activePalette, _lastActiveColorID, _activeBrush` | `GetLastActiveColorID, SetLastActiveColorID, ResetActiveColors, ResetActiveBrush, …` |
| `LoadStrokes` | `strokeTextures` | only `.ctor` (plain data holder for saved stroke textures) |
| `SaveImage` / `LoadImage` | 13 / 9 fields | 6 / 10 methods |
| `LayerSelection` | 5 fields | 9 methods |
| `DinamicInterval` | `_hitScreenFill, _minInterval, _maxInterval` | `Start, Update` |

Reading caution: `ColoringPage`'s payload is 204 bytes and only the first 17 declared fields are
serialized (`_seq`, `layersPrefab`, `selectedBoardName`, `theTime` are not present in the scene
instance). Field order matches declaration order, which is why the PPtr mapping above resolves
cleanly; this is a method-level inference, not a typetree-backed fact.

## 10. Facts vs. inferences vs. unknowns

| Claim | Status | Basis |
|---|---|---|
| Eight scenes, `ColoringPage` = level4 | Fact | `BuildSettings.m_Scenes`, level object counts |
| Tool strip: 7 tools at 260×140, x = 43.3, y = ±130 steps | Fact | `RectTransform` fields |
| Palette: 40 colours, exact RGB | Fact | two identical serialized `Color[]` arrays |
| 15 shines, 20 patterns | Fact | resolved PPtr arrays `shine-tool-colors_*`, `pattern-tool-colors_*` |
| Undo exists (button + `P3dButtonUndoAll`), redo has no UI | Fact | scene components; zero `P3dButtonRedoAll` attachments |
| Regions are per-sprite rasters + `PolygonCollider2D` vectors | Fact | prefab hierarchy, sprite rects, collider paths |
| Paint layers/`P3dPaintableTexture` created at runtime | Inference | absence in all serialized files + `Paintable.Initialize` |
| Brush radius/hardness/interval are set at runtime | Inference | all serialized paint params are library defaults |
| `fill` paints the tapped region via collider hit | Inference | `P3dHitScreen` + `Physics2DRaycaster` + 2,061 colliders; code path unread |
| Undo depth / snapshot format | Unknown | no serialized state; bodies not decompiled |
| Save format (`SaveImage`/`LoadImage`/`LoadStrokes`) | Unknown | field names only |
| Category↔pack mapping (pack 1–9 → 9 names) | Inference | naming + alphabetical catalog order; 6 naming exceptions |
| Address→bundle mapping | Unknown | catalog bucket/entry blobs not decoded |
| Exact on-device pixel sizes | Unknown | `CanvasScaler` values only; no runtime capture |
| Behaviour of `ForParents`, IAP, Firebase, shelf | Out of scope | not exercised |

## 11. Method and validation notes

* MonoBehaviour payloads have no typetrees (IL2CPP release build). Every parsed structure was
  validated before use:
  * arrays require an `int32` count, a size that stays inside the payload, and value-range checks
    (colours must be 0…1 with alpha 1);
  * PPtrs are `(int32 fileID, int64 pathID)` 12-byte records and must resolve through the file's
    externals table; all 35 shine/pattern PPtrs resolved, 0 unresolved;
  * the 40-colour array had to match **byte-identically** in two unrelated components before being
    accepted;
  * metadata layouts were proven by contiguity of the header regions: type definitions 88 B
    (9580 × 88 = 843,040 B exactly), method definitions 32 B (2160928 B), fields 12 B, images 40 B,
    and 100 % name/declaring-type validity over 4,000 sampled methods.
* UnityPy 1.25.4 read all native classes (`Transform`, `RectTransform`, `Sprite`, `Texture2D`,
  `PolygonCollider2D`, `Canvas`, …) with their real typetrees; only `MonoBehaviour` needed the
  manual reader.

## 12. Reproduction

```bash
python3 -m venv .venv && .venv/bin/pip install UnityPy Pillow numpy
.venv/bin/python tools/reverse/01_extract.py       # identity + private extraction
.venv/bin/python tools/reverse/02_unity_inventory.py
.venv/bin/python tools/reverse/03_scenes.py        # per-scene hierarchy + RectTransforms
.venv/bin/python tools/reverse/04_scripts.py       # MonoScript / attachment inventory
.venv/bin/python tools/reverse/05_il2cpp_metadata.py
.venv/bin/python tools/reverse/06_app_methods.py
.venv/bin/python tools/reverse/07_palette_brush.py
.venv/bin/python tools/reverse/08_pages.py
.venv/bin/python tools/reverse/09_media.py
.venv/bin/python tools/reverse/10_addressables.py
.venv/bin/python tools/reverse/11_scene_facts.py
.venv/bin/python tools/reverse/12_app_index.py
```

`01_extract.py` asserts the APK SHA-256 and aborts if the artifact changed, so every downstream
JSON can be tied to the same bytes.

## 13. Rights and publication

The APK, its art, fonts, localisation strings and audio are private reference with unconfirmed
rights. This report and the JSON inventory publish structural facts (names, ids, numbers, colour
values) only. Nothing here may be shipped in a public build; any web reconstruction needs
substitute or licensed content.
