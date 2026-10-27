# Curvature optics migration — project state

Updated at compatpatch **109** (2026-10-27), after the first explicit event/visibility contract. Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

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
