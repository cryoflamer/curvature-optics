# Curvature optics migration — project state

Updated at compatpatch **112** (2026-10-27), after the first explicit event/visibility contract. Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

## Objective

An independently computed physical comparison of Globe and Flat observations: world geometry + atmospheric refractive index `n(h)` + ray equations + first-hit visibility produce the image, **without hardcoding a horizon law or using the legacy horizon occlusion mask**.

## Current baseline

- **109 atmospheric reliability**: fixed expensive RK4 target shooting (bracketed regula falsi + safeguarded Newton endpoint), qualified long smooth-profile steps against fine-step oracles, removed the default 3.5-second truncation (explicit diagnostic budget still supported), and introduced separate boundary/solver/budget counters and contextual Physical-mode controls. A full 85+2 Standard scene test retains both banks with 3560 visible pieces, 130 narrow boundary leaves and **no** solver/sample-budget failures. True polygon fills, refracted guides, asynchronous work and global error guarantees are not yet provided. See `docs/MIGRATION_ATMOSPHERIC_SCENE_RELIABILITY_109.md`.

- **108 architecture correction**: the main Physical path no longer uses a separate Canvas painter; its backend `CurvaturePhysicalSceneOptics` transforms the same independent `CurvatureGeometryEngine` scene contract into ray-arrival line primitives and hands it to the existing `CurvatureFrameRenderer` painter, with the existing camera, style and decorations. `composeOpticalMain` preserves both object groups and reference surface/horizon guides **without inserting the legacy horizon occlusion mask**; physical Globe reference guides use `rEarth`, not `legacy-k`. Analytic vacuum fast path prevents old 3.5-second numerical starvation of 85+2 towers. Atmospheric modes still may have unresolved fringes and budgets. Geometric horizon guides are NOT refracted surfaces; object fills and mutual occlusion remain pending. See `docs/MIGRATION_SHARED_PHYSICAL_SCENE_108.md`.

- Latest migration milestone: **107**, opt-in **Physical tower outlines (preview)** Canvas engine (`docs/MIGRATION_PHYSICAL_CANVAS_107.md`). Uses physical angular tower lines from 106, actual camera perspective, separate profile/R controls, cold-result cache across camera redraws, and deliberate budget-limited omissions. **No Legacy mask is used on this path.** The physical Canvas still has **no ground/surface drawing, filled polygons, or mutual tower occlusion**. Real 85-tower sample reached the 3.5-second preview budget with unresolved edges: it is not yet a complete real-time renderer. `CurvatureTargetProjection.solve` remains the one-branch physical target oracle; `solver_failed` is never proof of blockage.
- Recent sequence: 95 runtime extraction, 96 render-frame/renderer contract, 97 main Canvas preview, 97.1 two active object groups, 97.2 horizon tessellation and stroke styles, 98 independent vacuum/geometry regression, 99 core audit, 100 RK4 tests and ground-impact accuracy, 101 bounded ground events and 2D vacuum target visibility, 102 engineered atmospheric profiles and analytic tangent/trajectory validation, 103 atmospheric target-angle shooting and ground-only visibility, 104 lazy/eager shared projection cells with conservative exact fallbacks.
- Legacy DrawModel remains selectable/default; Independent painter preview handles Globe and Flat separately, both supported object groups, with some overlays/annotations absent. `Both` uses Legacy fallback.
- Independent geometric composition uses an ordered horizon disk/mask for presentation; this is **not** physical ray-derived occlusion.
- Numerical `CurvatureRayTracer` already exists (2D fixed-step RK4, vacuum/standard/custom `n(h)`), now tested for analytic vacuum impacts, numerical refinement, invariants and reciprocity; a signed one-step `advanceState()` API and bounded first-ground-event search are available for diagnostics. `vacuumTargetVisibility()` gives restricted 2D ground-only `visible`/`blocked`/`indeterminate` semantics. It is **not** the physical primary-Canvas renderer. Optical P4 diagnostics/overlays and effective-radius `legacy-k` are separate mechanisms.
- Patch 99 retained the 270-test baseline. Patch 100 added 12 numerical tests; patch 101 added 11 ground-event/visibility tests; patch 102 added 8 independent analytic profile tests (301 total); patch 103 adds 14 independent shooting/visibility tests (315 expected).

## Source of truth / workflow

Only use the user-supplied `chatgpt-pack-*` archive (choose the explicitly named pack, otherwise newest timestamp). Unpack it into a temporary Git workspace and apply outstanding compatpatches **in sequence** before making further changes. Never mix packs or reconstruct missing files by guessing. Make one focused commit and distribute as Git `format-patch` (prefer ZIP containing `.patch`); use the repository Git author and English passive-voice commit subject. Test on a clean reapplication. Include in chat: commit subject, validation, browser-check instructions if needed, and next patch preview.

## Invariants / guardrails

- Do not conflate `Canvas engine`, `Optical comparison` and optical physics/profile selection.
- Vacuum means straight optical rays, regardless of surface geometry.
- Solver `no solution` is not proof of physical occlusion; distinguish numerical failure from blocked geometry.
- `legacy-k` effective radius is a proxy, **not** a numerical `n(h)` ray solution.
- Keep camera/units explicit: metres, radians, tangent-plane reference.
- Geometry tests and physical ray-intersection oracles take priority over pixel equality.

## Open limitations

2D/3D coupling, global completeness of ground-event isolation for rapidly varying profiles, lack of adaptive error control, global/multipath completeness of atmospheric target shooting (103 covers one forward-x branch), physical mesh intersections, and ray-driven main Canvas visibility for surfaces/fills (physical tower outlines only in 107). Details and proposed interface contracts: `docs/MIGRATION_OPTICS_AUDIT_99.md`.

## Architectural decision after patch 101

The intended optics scope is standard exponential atmospheric refractivity and an analytically engineered positive-gradient profile for Flat horizon occlusion, not mirages or arbitrary multipath rendering. The inverse-spherical profile from Maslovsky (2026), Eq. (73), reproduces the exact spherical *grazing visibility boundary* at equal endpoint heights for configurable R. The simpler exponential-occlusion profile has an exact non-paraxial ray family and is useful as an independent RK4 oracle. Neither is claimed to reproduce all Globe image geometry. The user proposes to accelerate the rendering of all towers by caching a shared optical field covering their common bounding rectangular prism, **not** running an integrator per tower edge.

## Next steps

100–103: complete (fixed-step numerical core, bounded ground events, atmospheric analytical validation, and single-branch target-angle/visibility API). 104: complete (bounded shared-grid projection cache). 105: completed proxy workload with 2/10/85 target points, grid-density comparisons and explicit warm-up vs redraw timings; not a full tower/Canvas FPS benchmark. 106: completed tower **outline** clipping by physical *ground* first-hit visibility; polygon fills and inter-object occlusion remain separate work. 107: completed experimental physical tower Canvas path plus camera projection and real-scene **bounded** workload checks; 85 towers remain incomplete under budget. 108: shared scene/painter optics architecture completed; **109: Standard atmospheric shooting/scene reliability completed with manual browser acceptance still pending**. Next: verify Standard against browser screenshots, then physical polygon interiors, refraction-correct surface horizon, and performance/Globe-versus-Flat validation. Update this file after about 5–10 patches or significant architectural decisions. Recommended effort: High for numerical physics, and potentially Extra High for 103 shooting solver.

## Patch 110 — Physical ground guides and horizon

Physical optics now projects ground guide lines through a radial optical field and supplies a ray-derived finite visible-ground horizon (Globe or engineered Flat atmosphere) to the **existing** shared `CurvatureFrameRenderer`. The previous geometric horizon is no longer copied in the Physical scene. Numerically, observer 15 m / radius 6,371 km gives Globe vacuum ~13.825 km, Globe standard ~16.004 km, and inverse-spherical Flat ~13.825 km. Flat standard/vacuum report no resolved finite horizon in this implementation. The Latin-1 page's UTF-8 middle dot has been replaced with `&middot;`; runtime status uses ASCII separators. See `docs/MIGRATION_PHYSICAL_GROUND_HORIZON_110.md`. Surface guides are approximate sampled curves, not physically filled ground, and tower polygon fills and boundary uncertainty remain future work.

## Patch 111 — Flat ground-guide drawing extent

Before patch 111, Flat + Standard performed ~29,745 ground guide point shoots from world-radius grid segments up to 20,015 km, far beyond a 100 km radial lookup. Ground reference strokes now clip to a finite **rendering** disk before projection; this disk is not a new physical horizon and does not change tower visibility or the physical ground horizon result. It correctly keeps chords crossing the disk. Flat guide subdivision is bounded by retained segment length, and UI diagnostics include skipped/clipped guide edge counts. Tests: `PhysicalGroundGuideExtent111.test.js`. See `docs/MIGRATION_FLAT_GROUND_GUIDE_EXTENT_111.md`. Future: viewport-specific culling and screen-error based guide tessellation, plus the shared-prism field.

## Patch 112 — lazy adaptive tower-prism optical field

The physically projected tower scene now refines `OpticalSharedRayField` cells
**on demand** rather than rejecting the entire 13 × 4 root prism grid and
shooting every vertex/edge sample individually. New opt-in API controls are
`adaptiveDepth` (public default 0, scene default 3) and `maxAdaptiveCells`
(scene default 4096). Only checked all-visible cells are interpolated; mixed,
uncertain, out-of-prism, depth-limited and budget-limited samples still use the
exact numerical solver. Independent off-grid tests and real scene comparisons
cover Flat/Globe with Standard and Flat engineered horizons. Measured full
85+2 Flat Standard case reduced 5659 to 1628 exact shooting solves with 3333
unchanged visible strokes, and the same ground-guide calculations. This is a
sampled, **not globally guaranteed**, interpolation error qualification.
Current UI reports adaptive interpolations/fallbacks, qualified cells and the
prism distance/height bounds. Benchmark: `tools/benchmark-adaptive-prism-112.js`.
Full details and acceptance checks: `docs/MIGRATION_ADAPTIVE_TOWER_PRISM_112.md`.
Next priority: instrument shared optical-field reuse across ground guides and
other geometry, assess boundary completeness, then polygon fills. No new
Canvas renderer, legacy mask or atmospheric model was introduced.

## Patch 113 — shared scene optics cache and performance

The physical ground-guide radial table now uses the tower prism's shared
`OpticalSharedRayField.exact(d,0)` RK4 memoization, with standalone ground-guide
callers retaining their original oracle. Ground and tower exact solve counts
are displayed separately while preserving their combined total. The scene
cache key now incorporates exact physically contributing authored geometry,
styles and metadata, excluding discarded camera-dependent legacy tangent and
horizon guides, preventing stale frames when input geometry changes without model
controls changing. For camera-only redraws, the complete optical composition
is reused without rebuilding thousands of painter-ready strokes; the shared
renderer continues to project and validate the camera frame independently.
An independent real-mesh benchmark covers 2/10/85/200 towers and Globe/Flat
profiles. Flat Standard with 202 towers measured ~0.24 s cold and ~12 ms
cached optics adapter on one Node run; Globe Standard with 202 towers remained
~4.7 s cold, with 276 explicitly unresolved near-horizon leaves. No new
Canvas renderer, atmospheric model or clipping approximation was introduced.
See `docs/MIGRATION_SHARED_SCENE_CACHE_113.md` and
`tests/SharedSceneCache113.test.js`.

## Patch 114 — physical foundation polygon fills in the shared painter

The independent geometry's actual authored fill polygons (`mode & 2`) now pass
through `CurvaturePhysicalPolygonFills` to the same shared `CurvatureFrameRenderer`
used since patch 108, preserving source fill styles and both tower banks.
Source-plane ear clipping handles concave foundation rings; each emitted fill
triangle is checked at corners, edge midpoints and centroid with the same
adaptive `F(d,h)` optic oracle as tower outlines. Near the physical ground
boundary, intersections are bracketed along original world edges and retained
on the **confirmed visible** side. Mixed/uncertain pieces are never filled
blindly; fill-specific triangle/uncertainty counters are shown separately from
outline uncertainty. All previously stroke-only lattice features remain
stroke-only; the patch does not create bogus solid plates. Mutual 3D object
occlusion, formal global/pixel error guarantees and physical ground **surface**
fills are still out of scope. See
`docs/MIGRATION_PHYSICAL_FOUNDATION_FILLS_114.md` and
`tests/PhysicalPolygonFills114.test.js`. Next: independent optical/visual
validation and remaining horizon boundary cases (115).
