# Curvature optics migration — project state

Updated at compatpatch **128** (2026-10-28), after the first explicit event/visibility contract. Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

## Patch 128 — physical continuous-surface verification (2026-10-28)

**Latest verified baseline:** 512 Node tests including 13 new end-to-end tests;
headless Chromium checked Earth, large, near-flat and exact flat with 85+2
towers (0 JS errors, 0 unresolved outlines/fills). Physical object placement
uses one azimuth and metre-based world frame at all curvatures, even when
`showModel = 2` at the slider endpoint; historical Legacy FlatEarth orientation
is unchanged. Physical metric guides now have curvature-independent sampling,
fixed 100 km presentation extent, and only certify a finite optical ground
horizon from a narrow visible/blocked bracket. Solver failures must not be
presented as physically blocked. Original non-metric SHA-256 golden references
remain intact. Local 5-repeat Node benchmark: near-flat `R=10^16 m` changed
from ~154 to ~71 ms median optics and from ~218k to ~40k RK4 calls, but this
is not a frame-rate guarantee. Details and limitations:
`docs/CONTINUOUS_PHYSICAL_VERIFICATION_128.md`.

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

## Compatpatch 114.1 — individual tower painter depth ordering

The previous all-fills-then-all-strokes arrangement per bank was replaced by
placed-object batches. `CurvatureGeometryEngine.createObjectSequenceScene`
retains `placedObjectIndex`/`objectBank` metadata on authored primitives;
`CurvaturePhysicalSceneOptics` orders the two banks' objects together far to
near by observer-relative radial distance, emitting each object's clipped
foundation fills and then its outlines. The common painter stays unchanged.
`stats.perGroup` remains a bank aggregate, while `stats.perObject` exposes the
individual object order. Camera-only Pan/Nick/Roll changes do not invalidate
optical rays. No arbitrary intersecting-mesh Z buffer was added. See
`docs/MIGRATION_TOWER_PAINTER_DEPTH_114_1.md` and
`tests/PhysicalTowerPainterOrder1141.test.js`.

## Compatpatch 115 — physical and shared-painter validation harness

`tools/validate-physical-scene-115.js` adds reproducible numerical and
painter-contract checks, including a `--full --json` suite for 202 authored
objects. It validates independent Globe-vacuum and engineered Flat grazing
limits at two radii and multiple heights; Standard RK4 2000 m versus 200 m
shooting; off-cell adaptive prism errors versus direct fine-step shooting;
vacuum world/camera angle consistency; and per-object far-to-near fill/stroke
batches through the existing shared painter. It also verifies that rebuilding
the source after Pan/Nick camera changes retains the optical composition and
that fully occluded authored towers need not emit Canvas commands. No physics
or renderer code has been replaced. A sampled 1920px/60-degree angular metric
found ~0.015 px maximum in selected cases (not a global pixel guarantee).
Globe Standard at 87 and 202 towers still reports respectively ~130 and ~276
**boundary** leaves. Full browser raster correctness and arbitrary intersecting
mesh occlusion remain unverified. See `docs/MIGRATION_PHYSICAL_VALIDATION_115.md`
and `tests/PhysicalValidation115.test.js`. Next: review any real-browser issues
and focus on horizon boundary closure before claiming full image completeness.

## Compatpatch 116 — bounded near-horizon outline closure and valid fill-painter camera checks

`OpticalTowerSilhouette` now closes sampled single-transition visible/blocked
horizon leaves by bracketing the transition with the existing physical point
oracle. It emits **only confirmed-visible strokes** and leaves the remaining
spatial bracket unpainted; `boundaryClipped`, `maxBoundaryGapMetres`,
`boundaryGapMetres` and `boundaryGrazingStops` explicitly quantify this
conservative approximation. The ordinary 85+2 Globe Standard scene's former
130 `visibility-boundary` unresolved leaves are now 130 bounded clips with
zero unresolved, the maximum measured world gap being ~0.0062 m. The 200+2
scene's former 276 leaves are bounded to ~0.0102 m maximum, with two grazing
samples retained as unpainted intervals. Real `solver_failed`, unbounded,
nonmonotone and sample-budget leaves are **not** claimed as bounded closures.
The numerical integrator, shared ray field and Canvas renderer are unchanged.

The original #115 synthetic painter camera aimed away from all Globe fill
facets: its zero `fill()` count was a viewport-test false negative, not a
missing fill feature. Its validation now checks a third camera pose aimed at
a nondegenerate emitted foundation triangle and independently requires an
actual `fill()` operation. Original camera counts are separately available
in JSON. On Globe/Flat scenes a targeted camera yields nonzero fill calls.
The UI distinguishes genuine solver failures from grazing samples and shows
measured conservative boundary-gap sizes. See
`docs/MIGRATION_BOUNDARY_CLOSURE_116.md` and
`tests/PhysicalBoundaryClosure116.test.js`. No general pixel-exact guarantee,
multiray completeness, or arbitrary 3D mesh z-buffer was introduced.

## Patch 117 — Physical interactive redraw / Canvas painter profiling

`CurvatureCanvasFrameScheduler` coalesces Physical-only redraw requests on
`requestAnimationFrame`; Legacy/Independent remain synchronous. Adjacent
stroke-only commands of identical Canvas style now share a **bounded** Canvas
stroke batch, keeping fills as painter-order barriers. Slider changes get a
camera-independent, *presentation-only* reduction of dense auxiliary ground
curves; 180 ms after the last model update the full guides are redrawn. Towers,
physical horizon, fills, visibility and the underlying cached RK4 field are
unchanged. Per-stage frame/Canvas metrics are now visible in Physical status.
Stress tool: `tools/benchmark-physical-redraw-117.js` (synthetic 78k line
primitives; no browser FPS claim). Details: `docs/MIGRATION_INTERACTIVE_CANVAS_117.md`.


## #118 — Opt-in Physical performance profile in existing geometry ZIP
The existing Export geometry diagnostics ZIP now runs Physical cold/warm/grid-off/preview/Pan profiling with per-stage raw measurements, median and p95. The normal geometry audit is retained; the profiler does not modify the live model. Details: `docs/MIGRATION_PERFORMANCE_PROFILE_118.md`. No optics, occlusion or painting rules changed.

## Patch 119 — camera-aware screen-space ground guide LOD

The browser ZIP profile from #118 isolated ground guides as the primary
redraw cost (~434 ms cached full scene versus ~31 ms without guides; user
hardware). `CurvatureScreenSpaceGuides` now indexes continuous, already
optically projected ground curves and reduces them under 0.5 **backing-store**
pixel sampled-polyline error *before* frame snapshot cloning/validation and
Canvas projection. Whole viewport-outside/near-plane-behind portions are
safely culled, but near-plane crossings and physical horizon remain exact;
missing visibility spans are never connected. Every tower outline/fill and
physical optics cache is unchanged. Original full physical composition is
retained for camera changes. The existing #117 slider preview stays in force;
settled frames use the new LOD path. Timing diagnostics separate LOD and
snapshot; #118 ZIP profiling carries raw `screenLodMs` and selection counters.
A reproducible synthetic 77,600-line benchmark and regression tests accompany
the change. **Browser performance must be measured on real user hardware**;
0.5 px is a bound on sampled vertices relative to the prior polyline, not a
proof against the original continuous optical curve. See
`docs/MIGRATION_SCREEN_GUIDE_LOD_119.md`.

## Compatpatch 120 — height-change RK4 efficiency, exact final scheduling, and profiling

The user confirmed that Height changes, unlike cached Pan, remain slow in
Physical/Globe/Standard. An 85+2 tower cold scene requires ~6,258 independent
exact target solves and ~216k RK4 step calls in shooting. #120 reduces
per-step allocation/callback overhead using the algebraically identical RK4
recurrence and prepares the unchanging optical setup/profile once per solve/
shared field. The Physical Height slider now debounces repeated intermediate
updates by 150 ms while displaying an explicit stale-frame warning, then
rebuilds the **last height precisely**; no fake cross-height ray reuse occurs.
The existing ZIP profiler adds a detached height sweep and solver/stage
counters. Full numerical scene hashes and 54 baseline projection points are
regression-checked against #119 at two heights. A Node-only benchmark showed
~29% median cold-build improvement across three warmed height samples,
**not** a browser FPS/latency guarantee. Details:
`docs/MIGRATION_PHYSICAL_HEIGHT_CHANGE_120.md`,
`tools/benchmark-height-change-120.js`,
`tests/PhysicalHeightChange120.test.js`.

## Compatpatch 121 — guarded Standard shooting and ground-event reduction

On the #120 85+2 Globe Standard cold scene, 6,258 exact target points required
23,611 trial shooting integrations. #121 adds a local, residual-verified
shooting predictor (three attempts max, original bracketed fallback) for
built-in Standard only. Standard ground verification now avoids most costly
substep event probes when an explicit upper bound on ray curvature proves a
step's chord safely above the physical surface, keeping full old ground-event
search for near-contact, grazing and uncertain spans. The RK4 recurrence,
shooting tolerance, atmosphere, physical horizon, tower fills and renderer
are unchanged. A test-only `settings.shootingOptimization:false` retains the
original #120 exact pixel-source scene hashes. Paired Node cold-builds on
85+2 towers reduced 23,611 -> 16,779 shooting evaluations and 36,833 ->
2,878 full ground-event step searches at Height 15 m; wall time varied from
~792 -> ~461 ms in one Node comparison (not a browser latency guarantee).
For standard rays numerical arrival angles may differ by <1e-8 rad; exact
bitwise equality is not claimed on the accelerated path. The ZIP profiler
reports predictor and ground step statistics. See
`docs/MIGRATION_SHOOTING_REDUCTION_121.md`,
`tests/OpticalShootingReduction121.test.js` and
`tools/benchmark-shooting-reduction-121.js`.

## Compatpatch 122 — owned physical assembly and exact-work attribution

Browser diagnostics #121 isolated ~97 ms `assemblyMs` per cold scene with
~82k ground+object primitives; the scene contract's deep defensive clone
accounted for most of it. Physical-only newly projected ground guides,
strokes and fills now transfer exclusive ownership through the new validated
`CurvatureSceneContract.adoptScene` API instead of cloning. External callers'
`createScene` preserves its deep-copy semantics. Reference hashes of all
physical output primitives/ranges match #121 **byte for byte** on four
Globe/Flat and Standard/vacuum scenes; physical equations are unchanged.
The ZIP profiler now also records per-ground/outline/fill increments of exact
target solves, cache hits, shooting trials and RK4 steps. A Node benchmark
observed assembly decrease from ~107–160 to ~13–19 ms on repeated warm
runs; browser timing needs confirmation. See
`docs/MIGRATION_PHYSICAL_SCENE_ASSEMBLY_122.md`,
`tests/PhysicalAssemblyAndSolverAudit122.test.js` and
`tools/benchmark-scene-assembly-122.js`.

## Compatpatch 123 — verified warm starts across nearby target heights

`geometry-diagnostics (45).zip` after #122 measured ~327.3 ms median for a
cold Height change in the user's browser. #123 examined **where** the 6,258
Standard target solves spend their 16,779 shooting angle evaluations. For
faraway targets with almost equal surface distance and different heights, the
field now keeps two previous **validated** target angles and tries their
height/angle secant as the next initial angle. Every candidate runs the same
RK4 and target-residual check, then the same ground-event classification;
failed guesses continue through the unchanged #121 solver. Custom/nonstandard
profiles and near targets retain previous behavior. Test-only
`settings.shootingWarmStart:false` reproduces exact #122 scene hashes.
In the 85+2 Globe/Standard/15 m Node scene this changes 16,779 -> 13,066
shooting angle trials and 159,685 -> 112,076 RK4 shooting calls, while
keeping all 6,258 unique exact target solves. Fully projected scene statuses,
primitive ordering and horizon stay equal across the tested 15 m/15.3 m
scenes; tiny (<1.3e-7 m on the 1,000 m presentation sphere) residual-bounded
coordinate differences mean accelerated scene hashes are not identical.
Wall-clock Node runs have noticeable scheduling/JIT/GC variance; the browser
ZIP is required to confirm end-to-end latency improvement. See
`docs/MIGRATION_OPTICAL_WARM_START_123.md`,
`tests/OpticalWarmStarts123.test.js` and
`tools/benchmark-optical-warm-start-123.js`.

## Compatpatch 124 — standalone continuous-curvature surface geometry

A new independent module `src/geometry/CurvatureSurfaceGeometry.js` defines
stable local surface coordinates, altitude, unit normal, and *geometric*
horizon for a non-negative curvature `k=1/R`, including an **exact** planar
case `k=0`. Both 2D ray-plane and 3D geodesic-placement APIs are supplied,
with no giant-number radius substitution. Sagitta and altitude evaluations
avoid catastrophic `R*cos(d/R)-R` and `hypot(x,z+R)-R` cancellation in the
observer-facing domain; an analytic tangent horizon avoids large-radius
`acos` cancellation. Tests cover spherical analytic references, 3D round
trips, exact plane, flat-limit convergence, altitude normals, centre
singularity, extreme radii and UMD export. **This patch deliberately does
not change any existing renderer, model, Optical Solver, ground grid, or UI.**
Physical integration is reserved for #125–128. See
`docs/MIGRATION_CONTINUOUS_SURFACE_GEOMETRY_124.md` and
`tests/CurvatureSurfaceGeometry124.test.js`.

## Compatpatch 125 — continuous-curvature optical solver integration

The #124 stable surface kernel is now connected to the physical RK4 tracer,
point-to-point shooting solver and shared-field target coordinate generation.
`curvature: k>=0` is an authoritative optional input; `k=0` is an exact
plane, and legacy `geometry/radius` calls remain compatible. The radial
height/normal metric is evaluated together in each RK4 derivative stage;
contact, grazing and fast-clear-ground checks use the same surface.
Near-flat ground endpoint classification avoids infinite-radius tolerance
overflow. Existing predictor, shooting residual, event verification and
field-local cache semantics are retained. The surface kernel is now loaded
before the tracer in the browser HTML.

A diagnostic-only `surfaceArithmetic:'legacy'` comparison option retains
byte-exact #119/#121/#122 reference hashes; the default stable path
intentionally need not reproduce old floating-point rounding. Two full
85+2 tower scenes retain topology and shooting work with measured, finite
near-grazing coordinate/horizon differences (see migration document).
Atmospheric `occlusionRadius` is not linked to the physical surface
curvature. The UI/model, common source grid and camera will be unified in
#126–128, not in this patch.

See `docs/MIGRATION_CONTINUOUS_OPTICAL_SOLVER_125.md` and
`tests/OpticalContinuousCurvature125.test.js`.

## Compatpatch 126 — shared physical surface world and metric grid

Main Physical Canvas now opts into `CurvaturePhysicalWorldGeometry`, which
uses the shared #124 continuous-curvature surface for placed object anchors,
local tangent/normal bases and bounded metric reference guides. The grid's
ring radii (100 m to 100 km) do not depend on `aDip`, `nLines`, height,
planet radius or a finite horizon. Its spokes share the same metre
landmarks. Surface-arc distances are projected through exact, memoized
radial ground oracles, not the old sparse near-eye angle interpolation.
Contours/fills use stable physical inverse altitude and arc-distance
coordinates; a stable vacuum analytic path is provided for the physical
adapter. Ground-guide culling at 100 km is presentation-only and does not
set the physical optical horizon. Legacy geometry, diagnostics fixtures,
existing model controls and old compatibility hashes stay intact, with
`LineSpacing` clarified as **Legacy LineSpacing**.

The UI still selects `Globe`/`Flat`; continuous curvature slider, infinity
boundary and camera decoupling are reserved for #127. See
`docs/MIGRATION_PHYSICAL_METRIC_WORLD_126.md` and
`tests/PhysicalMetricWorld126.test.js`. Real browser grid appearance and
end-to-end profiling require a fresh user Diagnostics ZIP after application.

## Patch 127 — Physical observer-fixed camera and curvature slider (2026-10-28)

`src/app/CurvaturePhysicalCamera.js` supplies a finite observer-fixed
camera for the **Physical** main Canvas: fixed 1000 m view reference, direct
FOV, pan/nick/roll and aspect ratio, stable geometric dip in Horizon mode.
`Eye-Lvl` is independent of the surface curvature. The legacy and Independent
camera are unchanged. The Physical toolbar now contains a logarithmic radius
slider (100 km to 10^13 km), exact flat endpoint (`showModel=2`, k=0), and
`Earth R` reset. The existing `rEarth`/`showModel` state retains Save/Restore
compatibility; only the radius slider adds a visual control. Drag changes
coalesce before a new optical solve; no per-pointer heavy RK4 work.

The huge-radius model reference dip is stabilized above 1e12 m; legacy
ordinary-radius computations and diagnostics remain unchanged. See
`docs/MIGRATION_PHYSICAL_CAMERA_CURVATURE_127.md` and
`tests/PhysicalCurvatureCamera127.test.js`. Full regression and browser smoke
verification cover Earth, 6000370000 m, 1e16 m and exact Flat with Standard
atmosphere and 85+2 towers. Next: #128 end-to-end convergence, numerical,
visual and performance verification.

## Patch 130 — Modern UI bootstrap and long-term UI split

The new **Modern visualization UI** is developed in parallel with the existing **Legacy engineering interface**; no Legacy controls are removed. The canonical request `CurvatureApp.html?ui=modern` routes to an isolated Modern document using the same `CurveAppClass`, physical scene, ray tracer and painter, while the default and `?ui=legacy` retain the original application. The Modern shell provides Scene (initial Transmission Line Physical view and basic camera/surface/atmosphere/display controls) plus an explicitly unimplemented Compare tab. Detailed RK4, shooting, audits, Physical sanity check and ZIP exports remain Legacy-only. The complete agreed architecture, risks, compatibility contract and patch 130–134 roadmap are preserved in **`docs/modern-ui-plan.md`**. Before the next patch, obtain a manual browser check of both routes; do not treat URL parsing tests alone as a browser acceptance test.

### Compatibility patch 131 — Modern Scene controls

Modern-only Scene control expansion was added without altering Legacy startup,
optical geometry, solver, or painting. The isolated Modern document loads
`src/ui/modern/ModernSceneState.js` (validated shared-model adapter) before
its Modern bootstrap. The Scene sidebar adds camera roll/FOV, direct radius and
exact-flat controls, two editable physical object groups, preset selection,
and automatic debounced rendering. Lake Pontchartrain is the primary preset;
single-tower and two-row samples are explicitly illustrative. Modern edits do
not overwrite Legacy saved state; full experiment persistence stays in patch
134. The architecture/delivery plan is updated in `docs/modern-ui-plan.md`.

### Compatibility patch 131.1 — Modern settings ergonomics

Modern Scene groups were reorganized into five tab panels (Camera / Surface /
Atmosphere / Objects / Display), with the existing presets moved above the
viewport and field help available by hover or keyboard focus. The model, optics,
Legacy interface and 131 field IDs/handlers were not changed. FOV is formatted
for display with four decimals only. See `docs/modern-ui-plan.md` for acceptance
and the continued 132–134 roadmap.

### Compatibility patch 132 — twin Physical Compare viewports

Modern Compare now paints two **independent real Physical Canvas scenes**
side by side with one shared observer, object configuration, FOV and Eye-level
camera. A retains the Scene curvature; B is exact flat (κ=0) using the same
atmospheric model. Their model snapshots are independent and do not mutate
Scene. Both invoke the existing `CurvatureMainCanvasRenderer.renderPhysical`,
not legacy `Globe+FE` or copied raster output. Each comparison graph has its
own equal-sized Canvas and clipping, created at HTML parse time; at mode
changes, dimensions and redraws are synchronized. The reduced half-panel
width changes pixel density relative to single Scene, but A and B retain
identical angular scale within Compare. User-selectable independent A/B
surface and atmosphere parameters are postponed to #133.

Patch 132 also removes redundant native browser tooltips from custom Modern
help buttons, clarifies physical-object help, and drops an unused Modern-only
`SceneFrame` script that previously raised a missing legacy-adapter exception.
`docs/modern-ui-plan.md` is the canonical roadmap; Legacy/physics remain
unchanged. The JS/Physical test suite and inlined Chromium browser smoke
(including 85+2 towers in Standard atmosphere) exercise both panels.

### Compatibility patch 133 — independent physical Compare models

Modern Compare now offers validated independent A/B surface curvatures,
exact-flat endpoints, atmospheres and engineered profile comparison radii,
including four explicit physics-pair presets. The authored Scene camera,
observer, physical objects and grid remain common and are not overwritten by
Compare edits. The 132 `CurveAppClass` cloning and Physical renderer are reused.
The original single-scene optics cache is retained; A and B now receive their
own instances of the existing keyed optical transform cache, preventing
alternating viewports from invalidating each other. The selected Compare pair
persists while switching Scene/Compare in the same page session. No experiments
are saved across reloads: versioned shareable experiments remain planned for
#134. See `docs/modern-ui-plan.md` and
`tests/ModernIndependentCompare.test.js`.


### Compatibility patch 133.2 — forward-traced horizon diagnostic

A separate `OpticalRayHorizon` module scans launch angles through the
existing RK4 ray tracer and accepts a finite first-contact tangent boundary
only after a hit/confirmed interior-clear-minimum angular bracket converges.
Its result is shown numerically under each Compare viewport and optionally
as an orange dashed angle guide alongside the independent green Eye-level
reference. Diagnostic results are cached per model and do not change
renderer/Scene/Legacy physics. If not resolved within finite range, the
readout explicitly says so; no horizon is inferred from clipping, failed
shooting or exhausted integration distance. Camera Roll currently suppresses
the horizontal horizon overlay. See `docs/modern-ui-plan.md` and
`tests/OpticalRayHorizon.test.js`.


### Compatibility patch 133.2.1 — angular guide projection corrected

Corrected the signed-angle-to-Canvas-y mapping in Modern Compare. Negative
optical horizon elevation is now drawn below the 0° Eye-level line, and the
marker matches the actual Physical perspective projection across camera
Nick values (and shared off-axis Pan). No optical or numerical horizon
algorithm was changed. Regression tests include
`tests/ModernAngularGuide.test.js`; the limitations stated for
patch 133.2 remain in effect.

### Source naming convention (compatpatch 133.3)

Source filenames, module exports, browser globals, classes, and functions are named for their responsibilities, not the patch that introduced them. Patch identifiers remain in Git history, patch artifacts, and historical documentation. Historical test case labels and numbered fixtures may retain their identifiers where they describe a specific regression or oracle version. This cleanup does not change physical calculations or rendering behavior.

### Patch 134 — Modern experiment URL/state

Versioned `ModernExperimentState.js` serializes validated *inputs* from the
shared Scene and independent Compare A/B into a reproducible, UTF-8 base64url
`experiment` query parameter. URL configuration supersedes Modern localStorage
and default presets. Debounced autosave and URL copy/reset controls have been
added without modifying Legacy `state`/DataX behavior, physical optics, or
render caches. Explicit incoming share links are not auto-rewritten after
user edits; Copy experiment URL serializes current state. Named experiment
library and JSON import/export remain next in 134.1. Source module names must
continue to follow their purpose, never the compatibility patch number.

### Patch 134.1 — Named Modern experiment library and JSON exchange

Modern `ModernExperimentLibrary.js` stores up to 50 named, validated experiments
under a dedicated localStorage key. Names are unique case-insensitively and
replacements and deletions require confirmation in the browser UI. A separate
library panel supports save/load/delete and import/export of JSON. The JSON
format is exactly the versioned input-only `ModernExperimentState` schema used
by Modern URLs; imports are validated before applying and do not silently
overwrite named entries. Library persistence is separate from the automatic
last-session state. Legacy URL/state and the physical optical engine remain
unchanged. Source names continue to be responsibility-based.

### Patch 134.2 — shared settings tabs in Compare

Scene and Compare now use one five-tab settings sidebar. Camera, Objects and
Display are the same actual input nodes bound to the shared `CurveAppClass`;
Compare-specific Surface and Atmosphere tabs edit only the selected A/B physics
descriptor. Model selection and pair presets remain above the tab list. Compare
Camera aim is explicitly fixed to eye level while retaining Scene's saved aim.
Compare guide toggles were moved to Display. Changing tabs updates ARIA and
panel visibility without recomputing optics; model or shared parameter changes
continue to redraw through the existing Physical renderer and use unchanged
version-1 experiment URL/localStorage/JSON serialization. Legacy is untouched.
Node regression: 558/558 tests, including three new shared-controls checks.

### Patch 134.3 — Atmospheric model help and legacy option cleanup

Modern Scene and Compare Atmosphere panels show a concise description and the
actual refractive-index law from `OpticalRayTracer.atmosphere`: vacuum `n=1`,
standard `n=1+0.000293 exp(-h/7350 m)`, and the hypothetical engineered
exponential `n=n0 exp(h/R)`. The UI calls the latter **Exponential refractive
profile** rather than occlusion, while keeping the stable internal key
`exponential-occlusion` for saved links and tests. The inverse-spherical law
is described when loading a historical experiment; it and the two inverse
pair presets are hidden from the default picker but retained, restorable and
editable when selected by URL, JSON, or named library. No physics formulas,
experiment schema version, Legacy behavior, or cache keys were changed.

### Patch 135 — Refraction scale radius in Modern UI

The existing `occlusionRadius` (metres) is exposed as **Refraction scale radius
(km)** for engineered atmospheric profiles in both Scene and independent A/B
Compare settings. UI values are converted to metres before reaching the optical
solver. The experiment URL/JSON/localStorage schema and cache key remain
unchanged, as does the separate geometry/reference radius.

### Patch 135.1 — Safe radius editing and reference-radius guidance

Radius fields in Scene and Compare now treat `input` as an uncommitted draft.
Only Enter or the native `change` event (including loss of focus) validates
and redraws physical optics; the previous 420 ms typing timer no longer
triggers expensive renders at intermediate values such as `1` or `10` km.
Committed values are idempotent across Enter + change and retain the independent
Compare A/B physics and unchanged metre-based optical state. A visible draft
hint explains how to apply values. For exact flat geometry, the Compare Surface
tab explicitly notes that the reference radius does not bend rays; the
separate atmospheric Refraction scale radius controls engineered refraction.
The optical cache already keys `occlusionRadius`, so no cache or physics changes
were necessary. No numerical time-to-completion guarantee is made for a
purposefully committed extreme profile. Node regression: 566/566 passed.

### 135.2 — Surface radius controls for flat geometry

- Modern Scene hides curvature slider, surface-radius input and Earth-radius reset when Exact flat is enabled; the flat selector remains available.
- Modern Compare hides the surface-radius field for the selected flat model and labels it `Surface radius (km)` on spherical models.
- Underlying surface radii remain stored, including when switching between flat and spherical surfaces, with no changes to experiment serialization or optical physics.
- Tests include switching both modes and preserving a manually entered sphere radius.

### 135.3 — Legacy-style surface curvature slider

- Compare Surface now uses the existing `CurvaturePhysicalCurvature` logarithmic
  step-to-radius mapping (0–999, from 100 km to 1e13 km), with step 1000
  representing exact flat geometry. The former geometry dropdown is removed.
- `Flat` and `Earth R` actions are provided; a precise radius field is available
  for spherical geometry. Slider input changes only the selected A/B configuration,
  and the expensive optical redraw is deferred until slider change/release.
- The Scene curvature slider stays visible at exact flat so that the user can
  leave the exact-zero endpoint without first using a separate geometry toggle.
- The existing compare schema (`surface`, `radiusKm`) and the physical solver are
  unchanged. Flat models retain their previous finite reference radius.
- Node regression: 568/568 passed.
