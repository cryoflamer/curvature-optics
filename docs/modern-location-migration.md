# Modern geographic location migration — active checklist

**Status (2026-11-16):** catalog and source inventory established; **no new
geographic Scene/Compare preset has been enabled**. This is a living delivery
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
- The existing `pontchartrain` Modern preset is one native transmission-tower
  arrangement, not all eight `TransLine` checkpoints or seven transitions.
  `single` and `rows` are demonstration samples, **not locations**.
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
- [ ] Select and lock representative first/middle/final **source states for
  each remaining scenario**, with explicit source indices and provenance.
- [ ] Establish per-scenario numeric geometry/camera checks and native
  Scene/Compare visual baselines, with tolerances chosen **before** comparison.

### Stage B — low-dependency scenes (proposed #34)

- [ ] Document `Curve` globe/flat/`showModel=3` teaching semantics and decide
  on native educational presentation; do not treat Compare A/B as identical.
- [ ] Validate TransLine camera/object placement against several archived
  states (including optional tower-21 diagnostics); quantify optics mismatch.
- [ ] Define Bedford negative-range semantics (`ObjDist=-8600 m` in initial
  state), `showModel=3` and model-specific geometry. Do not clamp silently.
- [ ] Enable eligible native static scenarios only after the scenario
  acceptance gates below pass. Preserve existing presets and saved URLs.

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
