# Modern geographic location migration — active checklist

**Status (2026-11-17, #46):** eight **partial** geographic native scenarios
(`pontchartrain`, `bedford`, `chicago`, `canigou`, `grace`, `causeway`, `tensas`, `soundly`) are available, with
additional `chicago-near` and `canigou-low` source-view references; **no full
Legacy scenario parity is certified**. This is a living delivery
plan for incrementally adapting authored Legacy demonstrations to **native
Modern Scene, Compare, History and Animation Studio**. Update checkboxes and
attach test/visual evidence **in the same commit that completes an item**.

**Scope:** retain the full original Legacy Demos runtime in its independent
iframe. Do not replace its fast narrated sequences with expensive per-frame
Modern RK4, rewrite old `?demo=`/`?state=` links, or remove Legacy as a side
effect. This plan supersedes the earlier *archive-only product preference* in
[the historical feature migration matrix](legacy-migration-plan.md), but **not**
its Legacy-preservation and scientific-evidence gates. Migrated Modern scenes
are adaptations, not claims of pixel-for-pixel or optical equivalence.

## Delivery sequence after Bedford

- [x] **#36 — Preset/experiment navigation:** preserve the outgoing full
  experiment in protected History before a preset switch or Reset; expose
  **Previous**, correctly round-trip the `custom` label, prevent stale
  asynchronous changes and retain existing History/working-session storage.
  Evidence: `tests/ModernSceneControls.test.js` and
  `docs/modern-experiment-history.md`. No new Legacy scenario was ported.
- [x] **#37 — Chicago Skyline:** implement the shared type-4 city geometry,
  editor/serialization support and partial source-backed Modern preset; verify
  Scene, Compare and History without claiming Legacy visual parity.
- [x] **#38 — Chicago distance and mountain geometry:** start the main Chicago
  preset from a 2 m observer and ~63 km line of sight with Standard atmosphere;
  retain source state 0 as `chicago-near`; port shared type-5 terrain silhouettes
  with source shape/color/mirror tests, without enabling Canigou or Grace.
- [x] **#39 — Mount Canigou:** add high-altitude vacuum (`canigou`) and
  lower-altitude Modern standard atmosphere (`canigou-low`) source-backed
  partial views at 257 km, preserving type-5 geometry and explicitly
  distinguishing Modern ray optics from the Legacy constant-k model.
- [x] **#40 — Flat/Globe distance guide readability and Chicago CI:**
  restore the Chromium Chicago smoke expectation to Standard atmosphere;
  overlay camera-oriented, lightly styled ground spokes and km labels at
  verified optically projected metric rings. No new ray calculations, altered
  surface extent, horizon guesses or physical-scene geometry. Verify narrow
  Canigou FOV on both Globe and Flat, and the absent-grid state.
- [x] **#41 — Adaptive metric ground-grid extent:** use the farthest authored
  object position (relative to observer and camera translation) to choose a
  bounded 10–500 km drawing extent, with a manual Display selection. Canigou
  selects 300 km, distant Chicago 75 km, and no-object scenes keep the earlier
  100 km default. Expand real optically projected rings/spokes rather than
  creating decorative synthetic ground or changing object visibility; occluded
  Globe points remain hidden. Existing experiments lacking this field restore
  to Auto. Evidence: `tests/PhysicalAdaptiveGridExtent.test.js`.
- [x] **#42 — Platform Grace and long-distance display:** native partial
  `grace` from Legacy state index 7 (the 28 km platform + 50.1 km island
  vacuum/globe geometry), shared type-6 pillars, parapet and connected deck,
  source-backed fields and independent modern camera. Extend metric ground-grid
  Auto/Manual rendering to a bounded 1000 km, with manual 750/1000 km choices;
  thin overlapping far rings by screen separation *after* optical shooting.
  Evidence: `tests/ModernGracePreset.test.js`,
  `tests/PhysicalLongRangeGrid.test.js`,
  `tests/PhysicalScreenSpaceGuideLod119.test.js`. This is not full Grace parity.
- [x] **#43 — Lake Pontchartrain Causeway:** partial native source-state 5 bridge
  with 41 supports in each of two rows, 967.5 m intervals, 100 m observer,
  vacuum, and independently rendered Globe/Flat. See `tests/ModernCausewayPreset.test.js`.
- [x] **#44 — Little Tensas Bayou:** partial source-state 4 native `tensas`
  preset with 87 type-7 supports, variable-height twin roads, eight short
  shore segments and the single centre crossover. The shared physical ray
  solver remains unchanged. Local polygons were verified against the original
  Legacy DrawShape for source sequence indices, palettes and height variation;
  independently rendered Globe/Flat are not narrated Legacy parity.
  Evidence: `tests/ModernTensasPreset.test.js`, `tests/ModernSceneControls.test.js`.
- [x] **#45 — Soundly Causeway:** partial source state 13 native `soundly` preset
  with 128 source type-8 supports at 300 m spacing and 10.8 m observer.
  Independent type-8/type-9 local profiles retain authored ship passages,
  ramps, signs, towers, and reversal; world-space decks join both roads
  independently on Globe and Flat. The shared physical optics is unchanged.
  The full 18-state narrated demonstration, atmospheric variants and
  source-camera pixel parity remain unported. Evidence:
  `tests/ModernSoundlyPreset.test.js`.
- [x] **#46 — Source-backed storyboard readiness audit:** freeze and
  automatically check all **80** Legacy states, **71** adjacent transitions,
  **10** native preset references to **9** distinct Legacy states and source
  control/helper inventories. Exactly **28** states are schema-blocked; zero
  state/transition full-parity certifications exist. See
  the **Native Modern storyboard readiness** section below,
  `tools/audit-modern-demo-readiness.js` and
  `tests/ModernDemoReadiness.test.js`. This is a plan, not an animation port.
- [x] **#47 — Modern workspace caption de-duplication:** Scene and Compare
  omit the authored title and description from their physical canvases because
  the Modern header already displays both. Scene metadata, History, JSON/URL,
  animation previews and diagnostic/full-composition captures retain authored
  text; underlying optics, frame, guides and Legacy are unaffected.
  `showCaptions` remains enabled by default for other renderer consumers.
  Evidence: `tests/CurvatureFullSceneDecorations.test.js` and
  `tests/ModernAtmosphericPresentation13822.test.js`.
- [ ] **Final integration:** recheck Scene, Compare, History, Animation Studio,
  working-session recovery, source geometry tolerances and visual baselines
  for every migrated scenario. No full migration parity is certified yet.

## Evidence and source of truth

- Authored source: [`src/animation/CurvatureDemos.js`](../src/animation/CurvatureDemos.js).
- Stable metadata: [`ModernLocationCatalog.js`](../src/ui/modern/ModernLocationCatalog.js),
  six geographic locations and nine Legacy scenarios; `Curve` is educational.
- [Read-only compatibility audit](legacy-modern-compatibility.md) and
  [`tests/fixtures/legacy-modern-boundary.json`](../tests/fixtures/legacy-modern-boundary.json):
  **9 demos, 80 authored states**, schema blockers and supported field names.
  **Not** a converter or a source of physical parity.
- [`tests/fixtures/legacy-reference-scenarios.json`](../tests/fixtures/legacy-reference-scenarios.json):
  source states 0/4/7 for `TransLine` and 0/3/6 for `Bedford` (indices are
  zero-based; legacy URL `pos` is one-based). Six actual original-Canvas
  [Opera reference PNGs](legacy-visual-validation.md) are frozen. They are
  **Legacy** evidence, not native Modern comparison renders.
- The curated [source-state numeric evidence](../tests/fixtures/modern-location-evidence.json)
  pins 27 opening/middle/final samples across all nine scenarios. Recreate or check
  it without evaluating Legacy code using
  `node tools/audit-modern-location-evidence.js --write` / `--check`.
  This is a selected **numeric-source** fixture, not copied runtime scenes.
- The existing `pontchartrain` Modern preset is one native transmission-tower
  arrangement, not all eight `TransLine` checkpoints or seven transitions.
  The `bedford` preset is a single **positive-range** partial adaptation of
  source state 3; `chicago` adapts opening-state geometry with a distant Modern
  camera, and `chicago-near` preserves its original source camera.
  `canigou` maps to source state index 2 at 1000 m / 257 km with vacuum;
  `canigou-low` uses source state index 4 at 244 m / 257 km with an explicitly
  non-equivalent Modern Standard atmosphere. `single` and `rows` remain
  demonstration samples, **not locations**.
- Object IDs are source-specific. Modern Scene geometry/validation now
  supports `0–9`; `8/9` are implemented for Soundly. Type `9` is **not active**
  in the nine authored saved-state demos, though the geometry is tested against
  Legacy. Supporting the integer type is not proof of animation/optical parity.

**Count policy:** eight geographic demos across six geographic subjects,
plus the non-geographic `Curve` lesson; **80 states and 71 transitions** in
all. A migrated static preset does not count as a migrated transition.
Catalog counts and *active* object types are verified against the authored
source by `tests/ModernLocationCatalog.test.js`.

## Delivery stages — check off as evidence is committed

### Stage A — catalog and baselines (#33)

- [x] Account for all nine Legacy demos, 80 saved states and 71 transitions.
  Evidence: existing source-backed preservation and compatibility audit.
- [x] Establish six stable location IDs, nine distinct scenario IDs, separate
  educational grouping and native sample IDs. Evidence:
  `ModernLocationCatalog.js`, `ModernLocationCatalog.test.js`.
- [x] Preserve `pontchartrain`, `single`, `rows`, `custom` serialization and
  current HTML selection: **unsupported scenarios are not selectable**.
- [x] Reuse existing all-state compatibility report and six original-Canvas
  browser fixtures; do not clone 80 states into a second source of truth.
- [x] Select and lock representative first/middle/final **source states for
  each remaining scenario**, with explicit source indices and provenance. Evidence:
  `tools/audit-modern-location-evidence.js`, `tests/fixtures/modern-location-evidence.json`,
  `tests/ModernLocationEvidence.test.js` (27 source-backed summaries).
- [ ] Establish per-scenario numeric geometry/camera checks and native
  Scene/Compare visual baselines, with tolerances chosen **before** comparison.

### Stage B — low-dependency scenes (#34–35)

- [x] Document `Curve` globe/flat/`showModel=3` teaching semantics and decide
  on native educational presentation; do not treat Compare A/B as identical.
  Decision and limitations below; this does **not** deliver a Curve preset.
- [ ] Validate TransLine camera/object placement against several archived
  states (including optional tower-21 diagnostics); quantify optics mismatch.
- [x] Define Bedford negative-range semantics (`ObjDist=-8600 m` in initial
  state), `showModel=3` and model-specific geometry. Do not clamp silently.
  Decision and limitations below; the **signed-range prelude and combined
  Legacy projection** remain blocked.
- [x] Enable a **clearly marked partial** Bedford native study from original
  state index 3, with positive ranges, independently validated type-0 geometry,
  reset/Scene/Compare checks and snapshot/URL roundtrip. Evidence:
  `tests/ModernBedfordPreset.test.js`, `tests/ModernSceneControls.test.js`.
  **This does not satisfy the full scenario acceptance gate in Stage D.**
- [ ] Finish scenario acceptance gates before marking complete. Preserve
  existing presets and saved URLs.

## Source-state evidence and Stage B decisions (#34)

The selected evidence includes exactly **three zero-based indices per demo**,
opening/middle/final. They are parsed from authored `Demos.AddState` strings;
Legacy URL `pos` is one-based. The summaries pin numeric camera fields,
active group type/count/position/size/variation, surface and explicitly authored
refraction controls. They **do not** copy the 80 complete states, synthesize
missing defaults, or create runnable Modern experiments.

| Authored demo | Source indices (0-based) | Legacy URL `pos` | Important decision |
| --- | --- | --- | --- |
| `Curve` | 0, 7, 11 | 1, 8, 12 | Empty object banks; at 7 the two models share a Legacy view |
| `Causeway` | 0, 2, 5 | 1, 3, 6 | Type 6 bridge now supported; source camera and scenario still require validation |
| `TransLine` | 0, 4, 7 | 1, 5, 8 | State 4 shares both tower banks with Modern `pontchartrain` |
| `Grace` | 0, 5, 8 | 1, 6, 9 | Type 5/6; state 0 has two active mountain objects with zero spacing |
| `Bedford` | 0, 3, 6 | 1, 4, 7 | Signed-distance prelude and combined globe/flat view |
| `Tensas` | 0, 3, 5 | 1, 4, 6 | Type 7 geometry needed |
| `Soundly` | 0, 9, 17 | 1, 10, 18 | Type 8; original escaped apostrophe preserved by parser |
| `Chicago` | 0, 2, 5 | 1, 3, 6 | Type 4 skyline needed |
| `Canigou` | 0, 3, 7 | 1, 4, 8 | Type 5 terrain plus atmosphere review |

### `Curve`: educational presentation, not a fictitious location

The lesson has **12 authored states**, and **no active geometry objects**. Its
central variable is observer height: 2 m initially, 100 km in the middle, up
to 35,786 km at state 10, then a return to 500 m. The original `showModel`
values are **1 = globe, 2 = flat, 3 = both in one Legacy view**; states **2,
7 and 8** use `3`. The author also varies the eye-level/tangent/data overlays,
field of view and tilt. Legacy `showModel=3` is not a request to open the native
A/B Compare: Compare renders **two independent physical scenes**, potentially
with different atmosphere and projection and no shared original overlay.

**Decision:** a future native `Curve` implementation needs a dedicated,
explicitly labeled educational presentation with synchronized globe/flat
surfaces and a common eye-level/horizon reference. An **Overlay-equivalent teaching view**
requires a deliberate renderer/projection and annotation design; two ordinary
Compare panes would be a *non-equivalent adaptation* and must be labeled so.
Until then, leave the full 12-state lesson and its choreography in Legacy Demos.
No placeholder objects or silently substituted images are acceptable.

### `TransLine`: where the existing Modern preset does and does not match

Legacy state **4** (`?demo=TransLine&pos=5`) and Modern `pontchartrain` have
**exactly matching authored numeric object parameters** in both banks:

| Bank | Type | Count | First distance | Spacing | Last distance | Lateral offset | Object size |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 3 | 85 | 50 m | 297.55 m | 25,044.2 m | 35 m | 23 m |
| 1 | 3 | 2 | 25,550 m | 373 m | 25,923 m | 25.4 m | 64 m |

The 21st tower in bank 0 (one-based sequence index) is at **6,001 m**. Both
banks' side/size variation controls are zero. A regression test checks actual
`ModernSceneState.applyPreset` output and independently generated
`CurvatureGeometryEngine.objectSequence` world-space coordinates against the
source sequence, using **absolute tolerance 1e-8 m**. This verifies the
**parametric longitudinal/lateral placement**, not the original Canvas
projection, silhouette/ray visibility or rendered pixels.

Camera **does not match**: source 4 has `Pan = 0`, `Nick = 0`,
`viewcenterHorizon = 0`; current Modern preset has **Pan = 0.0464°**,
**Nick = 0.0121°**, `viewcenterHorizon = 3`. Height **15 m** and focal input
**2,000** match. Treat the small orientation offsets as a deliberate current
Modern framing, **not a silently imported Legacy state**.

Legacy's original-model headless numeric fixture for state 4 reports
`refractionSync = 2`, resolved effective-radius coefficient
**k = 0.1704565179870846**, effective radius **7,680,127.851 m** and
horizon arc **15,179.047 m**. For state 7, explicitly authored **k = 0**,
so its effective radius is **6,371,000 m**. Modern starts with physical
atmosphere `standard` and independent ray tracing rather than a single
Legacy effective-radius geometry. **These numbers quantify Legacy's own
optical approximation, not the difference between Legacy and Modern rays.**
No same-camera/same-atmosphere cross-render ray comparison or Modern pixel
baseline exists yet. Therefore the Stage B TransLine comparison checkbox
and its Stage D acceptance checkbox **stay unchecked**.

### `Bedford`: signed-distance prelude is not a bad positive-range value

Legacy state **0** defines three active type-0 markers at
`ObjDist[0] = -8600 m`, `ObjDeltaDist[0] = 4830 m`. The longitudinal positions
by the authored sequence formula `start + i × spacing` are **−8600, −3770,
+1060 m**. Two positions are **negative along the authored observer-relative
axis**, as part of the initial zoomed-out explanatory prelude. This is not an
8.6 km absolute distance to be replaced by zero, nor three markers in front
of the observer. State 3 moves them to **124, 4954, 9784 m**; final state 6
uses **49** positions beginning at 124 m with 201.25 m spacing, ending at
**9784 m**. The exact Legacy camera-facing and clipped visibility of markers
behind the observer still needs a browser/geometry comparison; sign alone
establishes longitudinal positions, **not** optical visibility.

All seven Bedford states use the single-frame Legacy `showModel=3` composite.
Legacy type 0 has position-dependent shapes (bridge/bar, middle marker,
observer telescope), and Modern's existing type-0 generator is not a proof
that the combined projection is equivalent. Modern validates `ObjDist >= 0`
and accepts only `showModel` 1 or 2; the source initial state must therefore
remain **unsupported** as a native state, **never silently clamped or split**.
A partial native positive-range Bedford adaptation is now scoped to source
state index 3; it explicitly discloses the omitted prelude, combined view
and refraction differences. Native Stage D completion remains blocked.

### Bedford positive-range native study (#35; partial only)

The `bedford` option in Modern Scene is a **runnable native physical scene**, not
an iframe or a reconstructed Legacy animation. Its parameters are copied from
`Demos.AddState` source index **3** (`?demo=Bedford&pos=4`): observer height
**4.04 m**, focal field **5000**, Pan/Nick/Roll **0**, three type-0 markers at
**124, 4954, 9784 m**, lateral center **9.23 m**, deterministic source
`ObjSideVar=18 m` (near/middle/far lateral coordinates **0.23, 9.23, 18.23 m**),
size **4.04 m**, no grid. The second object bank stays disabled. Source
geometry parameters are verified against the authored state with **1e-8 m**
numeric tolerance in `ModernBedfordPreset.test.js`, using the real geometry
generator, not a hardcoded rendered drawing.

The original state has `refractionCoeff=0`. The native adaptation defaults to
**vacuum** for a directly interpretable non-refracting baseline; this is **not**
claimed to reproduce the original Legacy optical/painter implementation.
Modern renders one globe Scene; Compare A and B use their **independent surface
and atmosphere settings** (select the globe/flat vacuum pair manually when
needed), rather than the shared single-Canvas `showModel=3` composite. The
Legacy eye-level overlay and narrative timing are not imported. The negative
`ObjDist=-8600 m` start, states 0–2 and 4–6, the source's original composite
projection and seven-state choreography all remain available only in Demos.

Native `bedford` is explicitly marked **partial** in the selector, catalog and
caption. The actual source initial state remains rejected by Modern's unsigned
distance validator; no value is silently clamped or reflected. Existing
`pontchartrain`, `single`, `rows`, and `custom` IDs retain their semantics.
New regression coverage checks real Scene/Compare paths, deterministic
geometry and the version-1 experiment serializer. Browser pixel comparison
and complete History/Animation Studio acceptance remain separate Stage D/E
work: **do not check Bedford Stage D yet**.

### Gate for #35 and later

1. Define the viewport, DPR, projection and observer/camera match **before**
   recording Modern Scene and both Compare A/B pixel/shape evidence.
2. Compare source 0/4/7 TransLine physical rays with specified *actual*
   Legacy/Modern atmosphere settings. Separate numeric image-space errors
   from differences introduced by intentionally non-equivalent models.
3. For the Bedford signed-range prelude, decide whether to implement signed
   coordinates in both the generic Modern state/URL schema **and** physical
   renderer, or explicitly archive that original step. The positive-range
   `bedford` study does **not** resolve this. Never widen one validator alone.
4. Build and test new geometry types 4–8 individually. Do not enable a native
   scenario until its acceptance gates (including rendering and persistence)
   pass, or mark a *partial* adaptation clearly without calling Stage D done.

### Chicago partial native presets and camera choice (#37–38)

`chicago-near` uses source `Chicago` state index 0 (`?demo=Chicago&pos=1`):
observer 2 m, focal field 34, six silhouettes starting 3,400 m at 200 m
spacing, side-offset random amplitude −30.5 m, size cosine amplitude 0.381,
and 442 m nominal height. The three Legacy type-4 building groups and their
six-step mirror cycle are now independent world-space primitives in the shared
physical Scene/Compare renderer. Horizontal size does **not** follow height
variation; it is fixed as in Legacy `DrawShapeVariants` for type 4.

The source-state reference `chicago-near` deliberately selects **globe + vacuum**
for Legacy's zero `refractionCoeff`. The main `chicago` preset keeps exactly
those object parameters but opens at a user-verified distant position:
**Height 2 m, CameraNorth −60,000 m, CameraEast −2,170.95 m, Pan 3.023°, Nick
−0.164°, focal field 925.60 mm (about 2.7° FOV)** with **Standard atmosphere**.
The objects still start at 3.4 km from the origin; the observer is displaced
south of that origin, so the line of sight is about **63 km**, not a modified
Legacy `ObjDist`. This camera is a Modern demonstration choice, not another
source-authored state; the original position remains available as a selectable
resettable preset and both IDs are allowed in schema-v1 saved experiments. It does not recreate `showModel=3` (both
surfaces in one view), the Legacy 1.5 device ratio, eye-level overlay,
original camera projection, or the five authored animation transitions.
Modern Compare continues to show two **independent** optical renders.
Scene, Compare, History and JSON/URL persistence must handle the new type;
Stage D stays unchecked until static/browser parity and state coverage are
established. Chicago in Modern is a partial physics study, not a claim of
pixel or refraction parity with Legacy.

### Mountain type-5 geometry proof (#38)

The physical geometry engine now reproduces all three mountain silhouettes
from the *actual* Legacy `DrawShape` function, including both object-bank
variant selection (`(drawn + objIx) % 3`), the mirror cycle (`drawn % 6 > 2`),
filled polygons and detail strokes, and both visible/hidden palettes. In the
Legacy `DrawShapeVariants` transform, mountains retain width **1** while the
size variation controls their height; Modern follows the same convention.
`tests/ModernMountainGeometry.test.js` checks direct source parity across the
cycle and world-space Scene/Compare/experiment codec invariants. Physics still
uses common ray visibility; this port is **not** a Canigou scene or a refraction
parity claim. Separate native Canigou/Grace presets require additional source
state, atmosphere, scene and browser evidence.

### Mount Canigou partial views and atmosphere boundary (#39)

Two selectable, resettable Modern Scene presets share the **exact authored
mountain object banks** from `CurvatureDemos.js`: 40 type-5 mountains,
starting at **257,000 m** with **60 m** bank spacing; lateral position type 2
with amplitude **−5,620 m**, nominal mountain height **2,790 m** and cosine
height variation **0.125** (source `ObjSizeType=3`). The original type-5
silhouettes, six-index mirror cycle and world-space height-only transform were
already verified in #38; #39 uses the same physical Scene and Compare renderer.

| Modern preset | Authored Canigou state (0-based / URL pos) | Source camera | Physical atmosphere |
| --- | --- | --- | --- |
| `canigou` | **2 / `pos=3`** | 1000 m eye height, f=1000 mm, source Nick=0 → Modern Nick=−1° | **Vacuum** (`refractionCoeff=0` in Legacy) |
| `canigou-low` | **4 / `pos=5`** | 244 m eye height, f=1000 mm, source Nick=0 → Modern Nick=−0.5° | **Modern Standard**, independent `n(h)` ray trace; **not** an implementation of Legacy `refractionCoeff=0.16761` |

The Modern physical camera uses `viewcenterHorizon=3` (eye-level aim), instead
of the original Legacy `viewcenterHorizon=0` (geometric horizon aim). To keep
the 1000 mm telephoto FOV on the mountain, the Modern Nick is set to **−1°**
at 1000 m and **−0.5°** at 244 m: these are explicit *camera* substitutions
for Legacy's curvature-dependent horizon aim. Compare A/B keeps the same
fixed camera for both surfaces. Source `showModel=1` globe, radius 6,371 km
and visible grid remain. The second view
is intentionally an **atmospheric study**, not an exact copy of the source
constant-k image. In Compare, A and B are independent traced surfaces with the
same selected atmosphere, unlike a Legacy composite overlay. Changes to
surface/atmosphere continue to use general-purpose controls, not hard-coded
Canigou visibility thresholds. The eight authored checkpoints, seven
transitions, low-altitude inversion and documented Legacy horizon claims were
**not** mechanically ported; Stage D stays unchecked pending browser visual
baselines, optics evidence and full static state coverage.

Regression evidence: `tests/ModernCanigouPreset.test.js` (source field parity,
40 mountain objects, real physical renderer, Compare A/B, version-1 saved
experiments / URL / JSON) and `tests/ModernSceneControls.test.js` (selector,
History protected return, Reset, atmosphere propagation).

### Grace partial Modern source view (#42)

`grace` is derived from the authored **Legacy Grace state index 7**
(`?demo=Grace&pos=8`): eye height 72 m, focal field 2000 mm,
2 type-6 platforms (28,000 m start, 20 m spacing, 37.2 m height),
and 11 type-5 Anacapa mountains (50,100 m start, 22.7 m spacing,
75 m height), with all source side/size variations. Source `showModel=1`
and `refractionCoeff=0` make **Modern Globe + Vacuum** a defensible
baseline without fitting a new atmospheric profile. Modern Nick −0.21°
aims the shared Eye-level camera at both far subjects, instead of claiming
the source's curvature-dependent `viewcenterHorizon=0` can be carried over.

Type 6 is now supported by Modern Objects, scene-graph/physical renderer,
Compare, History and schema-v1 JSON/URL. Source-local pillars and parapet
preserve their authored vertices and colors. The deck joining adjacent
platform supports uses world-space placed endpoints and independent columns;
it is a native geometry adaptation of the Legacy `LastRoadP11/P12` continuity,
not a separate optical rule. The original opening Grace states still contain
**zero mountain spacing**: Modern deliberately refuses coincident multi-object
steps, so these particular states remain in Legacy. There is no claim of pixel
parity, source constant-k mapping, nine-state completion, road z-buffer
occlusion, or authored animation parity. Browser visual acceptance remains open.

The physical grid's rendering limit now reaches **1000 km**. Auto still derives
its extent from source object positions (Grace defaults to 75 km, Canigou to
300 km), while manual Display offers 750 and 1000 km. All far-distance sample
points remain physically ray-projected; after projection the screen-space guide
simplifier can omit nearly coincident distant rings (10 backing pixels) to
prevent an opaque band. The farthest available visible ring, physical horizon
and all scene-object primitives are preserved. The rendering limit is not a
physical horizon and does not alter object visibility or field queries.

### Causeway source-backed Modern view (#43)

The `causeway` preset comes from Legacy Causeway **state index 4** (URL
`?demo=Causeway&pos=5`). Geometry, observer height (100 m), focal length
(2000 mm), and zero refraction are original; the two 41-support rows begin
at 0 m and continue at 967.5 m intervals to 38.7 km. The existing type-6
physical geometry constructs 80 deck polygons, 40 for each column, with no
cross-column connections. Modern uses a separate Globe and Flat Compare,
not the original `showModel=3` overlay; Modern eye-level camera aim does not
reproduce source `viewcenterHorizon=2` semantics. Remaining five source
states, original choreography, browser visual/pixel parity and final camera
acceptance are not certified. No new optics or persistence schema was added.

### Stage C — geometry families (#37–45)

- [x] Implement object type **4**: Chicago skyline and indexed variation.
- [x] Implement object type **5**: mountain/terrain silhouettes and variants
  (bank-shifted three palettes, six-step mirroring, fixed width under height variation).
- [x] Implement object type **6**: shared bridge support/road geometry,
  exercised by Grace and the partial Causeway source-state view.
- [x] Implement object type **7**: Tensas-specific bridge geometry.
- [x] Implement object type **8**: Soundly Causeway geometry (partial native #45).
- [x] Review and port object type **9** for the reverse Soundly bridge profile;
  no separate authored scenario preset requires type 9.
- [x] Extend native validators and Objects editor for currently supported types
  **together with their physical Scene and Compare rendering tests**. This is
  type support, not static-scenario acceptance.
- [ ] Define the atmosphere mapping per scenario: Legacy `refractionCoeff`,
  `refractionSync` and `tempGradient` are not interchangeable with Modern
  physical ray profiles. Document approximations; never silently clamp.

### Stage D — static scenario acceptance (one check per authored demo)

A checkbox here means **native static-scene completion**, not merely a
catalog entry. Do not tick it until the acceptance gates below are met.

- [ ] `earth-curvature-lesson` — `Curve` (12 states); educational, not a
  geographic location; explicitly address globe/flat comparisons.
- [ ] `pontchartrain-causeway` — `Causeway` (6 states); partial state-4
  source-backed preset available (#43), but six-state/overlay and animation parity remain open.
- [ ] `pontchartrain-transmission-line` — `TransLine` (8 states); the current
  `pontchartrain` preset is **partial**, not validated across Legacy states.
- [ ] `anacapa-grace-platform` — `Grace` (9 states); partial `grace` state-7
  physical preset with types 5/6, but zero-interval early states and
  nine-state/animation visual parity remain open.
- [ ] `bedford-level-experiment` — `Bedford` (7 states); type 0 exists, but
  negative starting distance and combined globe/flat view need decisions.
- [ ] `tensas-bayou-bridge` — `Tensas` (6 states); partial source state 4
  uses type 7, but six-state and narrated animation parity remain open.
- [ ] `pontchartrain-soundly` — `Soundly` (18 states); partial native source
  state 13 uses type 8 with type 9 also available for reverse-order views.
  Full 18-state visual and narrated acceptance remains open; preserve its
  escaped apostrophe in source extraction.
- [ ] `chicago-skyline` — `Chicago` (6 states); type 4 supported, distant and source-camera partial presets; full six-state/overlay acceptance pending.
- [ ] `canigou-mountain` — `Canigou` (8 states); two source-backed partial
  camera/atmosphere views now exist (#39); visual/ray baselines, remaining
  source states and Legacy refraction parity are still pending.

### Stage E — choreography and end-to-end verification (later)

- [x] Record a **read-only mapping/decision plan** for Legacy `Tval`, `Tpan`,
  `Ttxt`, `Tpse`, timing, concurrent actions, captions and easing versus Modern
  keyframes: `modern-demo-readiness.md`. No timeline translator is enabled.
- [ ] Port and test the **71 authored transitions** where they make sense
  in Modern; record intentionally non-equivalent or archived behaviors. A
  static scene or imported state does not count as an animation port.
- [ ] Verify Scene and both Compare surfaces with representative non-tower
  scenes and atmospheric configurations, including browser pixel/shape
  evidence at fixed viewport/DPR.
- [ ] Verify History, save/reload, experiment JSON/URL import/export,
  Animation Studio Preview, export and multi-workspace switching on every
  newly enabled native scenario.
- [ ] Verify historical Legacy `?demo=`, `?pos=`, `?state=` URLs and isolated
  Demos playback remain unchanged; run GitHub CI and targeted Opera smoke.
- [ ] Review final coverage against all nine demos / 80 original states /
  71 transitions. Document any gaps instead of asserting full parity.

## Acceptance gate for a **single static** scenario

Before checking its Stage D item, attach evidence of **all** of the following:

1. Record `legacyDemo`, source indices, source geometry types/variants,
   camera orientation, object ranges/sizes, and the Modern adaptation ID.
2. Define object shape implementation and observer-relative geometry;
   negative distances/zero spacing must have a **stated** semantic policy.
3. State surface/atmosphere and any non-equivalent Legacy refraction,
   overlays or combined original/flat presentation; no hidden substitution.
4. Pass native **Scene and both Compare A/B** renders at representative
   camera settings, not a fallback to embedded Legacy Demos.
5. Pass snapshot save/restore, persistence, export/import, app reload and
   backward-compatible existing preset/URL tests.
6. Check numeric geometry/ray observables and deterministic reference
   images at declared viewport/DPR/model/tolerances. Include failures and
   limitation notes where physical parity is intentionally not claimed.
7. Add regression tests to a permanent CI gate and perform an actual browser
   smoke run when rendering/DOM behavior is changed.

If an acceptance item is blocked, keep the corresponding Stage D checkbox
unchecked and explain why in the scenario's follow-up documentation/commit.
Do **not** mark a scenario complete just because it is present in the catalog.

## How to maintain this checklist

1. In each Compatсh, update the checkbox **with its evidence** (test name,
   referenced fixture, scene screenshots, commit ID, or limitation).
2. Preserve IDs; add new scenarios with new semantic IDs only when necessary.
   Do not rename old preset IDs or reuse a Legacy demo name as a fake URL.
3. Keep the read-only catalog statuses and `ModernSceneState.PRESETS` in sync
   only after acceptance; separately update the experiment allowlist and UI.
4. Rerun `node --test tests/ModernLocationCatalog.test.js` and
   `node tools/check-refactor-closure.js`, plus relevant Scene/Compare and
   browser checks for real geometry changes.
5. The earlier [historical migration plan](legacy-migration-plan.md) and
   [compatibility audit](legacy-modern-compatibility.md) remain reference
   records. **Legacy retirement is not an objective of this checklist.**

---

## Native Modern storyboard readiness — source-backed audit

**Status (2026-11-17):** #46 inventory and decision plan; **no new scene or
Legacy-to-Modern animation converter was enabled**. The separate Legacy Demos
iframe remains authoritative for its fast, narrated storyboards.

### Reproducible evidence

- Authored source: [`CurvatureDemos.js`](../src/animation/CurvatureDemos.js).
- Deterministic, read-only generator:
  `node tools/audit-modern-demo-readiness.js --check` (or `--write` after an
  intentional source/preset change). Output:
  [`modern-demo-readiness.json`](../tests/fixtures/modern-demo-readiness.json).
- Coverage/anchor tests: [`ModernDemoReadiness.test.js`](../tests/ModernDemoReadiness.test.js).
- Independent existing source-schema check:
  [`legacy-modern-boundary.json`](../tests/fixtures/legacy-modern-boundary.json).
  The new report does **not** turn reviewable fields into convertible states.

The report covers **9 demonstrations, 80 saved states and 71 ordered adjacent
transitions**. Eight geographic demos have **partial** native scene presets;
`Curve` has no native lesson preset. Ten Modern presets map to **nine distinct
Legacy source-state indices** (Chicago has two views of one source state).
**Zero** source states are certified for *complete* native visual/optical parity
and **zero** of the 71 authored transitions are certified as imported into
Animation Studio. **28/80** states are flagged as structurally blocked by the
existing Modern schema audit; the other 52 are *review-only*, not approved
imports. Geometry-matching source anchors are not complete-scene migrations.

### Per-demonstration inventory and source anchors

Source indices below are **zero-based**; the old `?demo=...&pos=` URLs use
**one-based** `pos`. All counts and anchors are checked against the actual
source and `ModernSceneState.PRESETS` by the generator.

| Legacy demo | States | Transitions | Native geometry anchor(s) | Important open boundary |
| --- | ---: | ---: | --- | --- |
| Curve | 12 | 11 | none | Non-geographic lesson, combined Globe/Flat view and narrated overlay |
| Causeway | 6 | 5 | `causeway` ← 4 | Four combined-view states; narrator and shared overlay |
| TransLine | 8 | 7 | `pontchartrain` ← 4 | Legacy refraction synchronization, per-step camera/object changes |
| Grace | 9 | 8 | `grace` ← 7 | Five early states have zero object spacing; nonzero Legacy refraction coefficients |
| Bedford | 7 | 6 | `bedford` ← 3 | Every state uses combined view; state 0 has signed object distance |
| Tensas | 6 | 5 | `tensas` ← 3 | Legacy refraction settings in later states and narrated geometry/camera changes |
| Soundly | 18 | 17 | `soundly` ← 12 | Long mixed camera/object timeline; source type 9 is supported, but not active in saved demo states |
| Chicago | 6 | 5 | `chicago`, `chicago-near` ← 0 | Every state uses combined view; distant Modern camera is intentionally adapted |
| Canigou | 8 | 7 | `canigou` ← 2; `canigou-low` ← 4 | Nonzero Legacy effective-radius refraction in later steps; Modern `standard` is different |

For each of the 80 original states, the fixture records the original URL,
active geometry types, schema status, distinct source-geometry references and
flags for signed distance, zero spacing, combined view and Legacy refraction.
For each of 71 transitions it records **adjacent source indices**, changed
fields *between snapshots*, literal `Tval`/`ValueRef` targets and observable
`Ttxt`, `Tpan`, `Tpse` and parallel-action markers. This is intentionally a
**static index**, not an interpreter for the Legacy task engine: the list of
literal controls may be incomplete if the source uses a new helper or dynamic
action. Review original actions before attempting translation.

### Native Animation Studio capability vs Legacy choreography

| Legacy behavior | Modern capability | Migration decision / gate |
| --- | --- | --- |
| Camera poses and sweeps (`Height`, `Pan`, `Nick`, focal length) | Camera keyframes with linear/spline pose interpolation | **Candidate for explicit adaptation** after selecting a bounded transition and checking easing, duration and intermediate ray images |
| Single curvature or temperature-gradient parameter change | One-channel physical keyframes | **Conditional**: Modern curvature or physical `n(h)` must not be identified with Legacy effective-radius `refractionCoeff` |
| Changes to object banks, overlay toggles, or multiple physical/camera fields | Experimental keyframes store complete experiment snapshots | **Static frame candidates only**. Capturing two snapshots does not prove interpolation or narrated choreography |
| `Ttxt`, `Tpse`, serial/parallel task trees, `Tpan` helper | Animation Studio project/Preview/export infrastructure | **Not a direct mapping**. Captions, holds, overlapping actions and source easing need an explicit storyboard contract and tests |
| `showModel=3`, curvature-dependent horizon-centering, Legacy `?demo=` links | Separate physical Scene and independently rendered Compare A/B | **Not equivalent**. Preserve the original composite view and old routes in Legacy until any independently specified teaching replacement exists |
| Legacy coefficient/sync modes and additional diagnostics | Modern named atmospheric profiles, physical CPU ray tracing | **Not interchangeable**. Specify observable-based acceptance tolerances before deciding any optical equivalence |

The only currently verified output of the new audit is **source inventory and
exact preset object-bank anchoring** (including the four variation fields that
`applyPreset` explicitly clears to zero when absent). It neither constructs
Modern experiments for the remaining states nor replays any transitions.

### Ordered delivery plan (after caption work #47–49)

1. **#50 — One bounded storyboard prototype.** Choose *one* existing source
   transition with a simple camera/physical change and review its real `TaskList`.
   Specify expected intermediate poses, timings, holds, narration and Scene vs
   Compare behavior before choosing Camera/Physical/Experimental project mode.
   Keep original Legacy playback as the reference. Do not bulk-convert.
2. **#51 — Static reference comparisons.** Select an explicit first/middle/final
   subset of already ported scenes; capture native Scene and Compare images at a
   fixed viewport/DPR, compare source geometry and independently computed
   optical observables. Record tolerance, model/profile and provenance; do not
   compare unlike Legacy and Modern refraction as if they were identical.
3. **#52+ — Incremental demonstration sequences.** For each of the eight
   geographic scenarios, decide per transition: camera channel, physical
   channel, complete-frame cut, custom narration/parallel timeline, or
   intentionally Legacy-only. Add only evidence-backed native projects; keep
   unfinished state and progress visible in this inventory.
4. **Educational Curve and final acceptance.** Independently design combined
   Globe/Flat instructional semantics, or explicitly retain that lesson in
   Legacy. Recheck working-session recovery, History, Animation Preview/export,
   the two physics panels and routing at each native release. Leave all
   Stage D/Stage E parity checkboxes **unchecked** until those tests exist.

**Scope guard:** This sequence does not authorize removal or retargeting of
`CurvatureApp.html`, Demos iframe, scientific oracles, original browser PNG
references, `?demo=`/`?pos=`/`?state=` links, or the CPU ray solver. Source
state geometry compatibility and browser-image parity are separate evidence.
