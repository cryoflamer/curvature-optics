# Modern geographic location migration — active checklist

**Status (2026-11-16, #35):** one **partial** geographic native preset
(`bedford`) is available alongside `pontchartrain`; **no full Legacy scenario
parity is certified**. This is a living delivery
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
- [ ] **#37 — Chicago Skyline:** implement the shared type-4 city geometry,
  editor/serialization support and partial source-backed Modern preset; verify
  Scene, Compare and History without claiming Legacy visual parity.
- [ ] **#38+ — Canigou, Grace, Tensas, Causeway, Soundly:** prioritize shared
  geometry types and source checks rather than special physics per location.
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
  The new `bedford` preset is a single **positive-range** partial adaptation of
  source state 3, not all seven Bedford states. `single` and `rows` remain
  demonstration samples, **not locations**.
- Object IDs are source-specific. Modern Scene geometry/validation currently
  supports `0–3`; Legacy `4` city, `5` mountain, `6` bridge/platform,
  `7` Tensas bridge and `8` Soundly Causeway require explicit ports. Legacy
  type `9` exists but is **unused** in the nine authored demos.

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
| `Causeway` | 0, 2, 5 | 1, 3, 6 | Type 6 bridge unavailable |
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

### Stage C — geometry families (proposed #35+)

- [ ] Implement object type **4**: Chicago skyline and indexed variation.
- [ ] Implement object type **5**: mountain/terrain silhouettes and variants.
- [ ] Implement object type **6**: Causeway bridge / Grace platform.
- [ ] Implement object type **7**: Tensas-specific bridge geometry.
- [ ] Implement object type **8**: Soundly Causeway geometry.
- [ ] Review type **9** only for full Legacy object-catalog parity; it is
  not a blocker for the nine authored demonstrations.
- [ ] Extend native validators and Objects editor for each supported type
  **only together with its physical Scene and Compare rendering tests**.
- [ ] Define the atmosphere mapping per scenario: Legacy `refractionCoeff`,
  `refractionSync` and `tempGradient` are not interchangeable with Modern
  physical ray profiles. Document approximations; never silently clamp.

### Stage D — static scenario acceptance (one check per authored demo)

A checkbox here means **native static-scene completion**, not merely a
catalog entry. Do not tick it until the acceptance gates below are met.

- [ ] `earth-curvature-lesson` — `Curve` (12 states); educational, not a
  geographic location; explicitly address globe/flat comparisons.
- [ ] `pontchartrain-causeway` — `Causeway` (6 states); requires type 6.
- [ ] `pontchartrain-transmission-line` — `TransLine` (8 states); the current
  `pontchartrain` preset is **partial**, not validated across Legacy states.
- [ ] `anacapa-grace-platform` — `Grace` (9 states); requires types 5 and 6,
  and interpretation of a zero Legacy object interval.
- [ ] `bedford-level-experiment` — `Bedford` (7 states); type 0 exists, but
  negative starting distance and combined globe/flat view need decisions.
- [ ] `tensas-bayou-bridge` — `Tensas` (6 states); requires type 7.
- [ ] `pontchartrain-soundly` — `Soundly` (18 states); requires type 8; preserve
  its embedded escaped apostrophe during source extraction.
- [ ] `chicago-skyline` — `Chicago` (6 states); requires type 4.
- [ ] `canigou-mountain` — `Canigou` (8 states); requires type 5 and explicit
  refractive model comparison.

### Stage E — choreography and end-to-end verification (later)

- [ ] Record a separate mapping plan for Legacy `Tval`, `Tpan`, `Ttxt`, `Tpse`
  timing, concurrent actions, captions and easing versus Modern keyframes.
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
