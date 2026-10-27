# 107 — Opt-in physical tower-outline Canvas preview

## Purpose

The physical pipeline now reaches the **real main Canvas** without calling `DrawModel`, applying the Legacy effective-radius horizon mask, or repainting an artificial white occluding disk. This is a *wireframe experimental preview*, not a finished filled terrestrial scene. Its input is the same independent tower geometry used by `OpticalTowerSilhouette` (106); visibility comes exclusively from optical shooting + first-ground-hit checks and their bounded shared projection field (103–105).

## How to try it

In `CurvatureApp.html`, use **Canvas engine → Physical tower outlines (preview)**. Choose a **Physical atmosphere** (`vacuum`, `standard`, `exponential-occlusion`, `inverse-spherical`). The **Occlusion R (m)** control applies only to the engineered profiles; it is **not** the physical radius of Globe, which is always `rEarth` for this preview, even if the model's `legacy-k` mode uses an effective `geometryRadius`. `Both` and non-tower object banks explicitly fall back to the Legacy path with an explanatory status message. The existing `Independent (preview)` and `Optical P4` selectors remain distinct and unchanged.

The renderer intentionally draws black tower outlines against a white Canvas, with **no ground mesh, filled foundations, shadows, surface guides, or inter-tower depth occlusion**. No claim is made about a complete ground image. Camera pan/nick/roll/zoom and viewport dimensions affect projection but do not invalidate the precomputed physical ray field.

### Architecture

- `CurvaturePhysicalTowerCanvas.create()` owns a single-instance cache keyed to tower geometry, observer height, surface geometry, optical profile, `occlusionRadius`, and the finite quality settings.
- `GeometryEngine.towerSequence` assembles actual tower banks, including their existing variations and side placements. `model.rEarth` is used for physical Globe placement; optical `occlusionRadius` is independent.
- The tower bounding prism is sampled with a **logarithmic 13-node distance axis** and a linear 4-node height axis, rather than one per-tower RK4 integrator.
- `OpticalSharedRayField.create()` checks and interpolates smooth visibility cells; uncertain/failed cells fall back to exact `OpticalTargetProjection` shooting.
- `OpticalTowerSilhouette.projectPrimitives()` subdivides and omits ground-hidden or indeterminate outline portions. Its output is physical `[azimuth,elevation]` in radians.
- `CurvaturePhysicalTowerCanvas.pixelSegments()` turns those arrival angles into the actual camera's 3D direction vectors, applies its normalized right/up/forward basis and perspective focal length (same convention as `CurvaturePerspectivePreview`), and clips to the near plane and Canvas viewport. Its `paint()` clears to white and draws **only visible line pieces**; it never masks anything after painting.
- `CurvatureMainCanvasRenderer.renderPhysical` configures the existing GraphX3DX Canvas owner and restores HiDPI context transforms with `try/finally`. The browser runtime guards one-shot Legacy frame audits and has a separate fallback when physical rendering fails.

**Camera origin restriction:** physically traced angular rays emerge from the observer at `[0,0,0]` and are projected only when the graphics camera is coincident with that origin. The renderer explicitly rejects offset cameras instead of silently introducing parallax errors. No ray-angle-to-pixel shortcut that ignores camera yaw/pitch/roll is used.

### Bounded previews / unfinished scene

Cold shooting can be expensive for many edges, especially where the coarse physical field rejects cells near the horizon. Default projection is intentionally limited to 10,000 point evaluations or approximately **3.5 seconds** of shooting time on the running machine (whichever becomes limiting); these are *resource budgets*, not correctness thresholds. When exhausted, the remaining regions are recorded as `unresolved`, not falsely marked visible. The status explicitly reports incomplete results. The cache reuses the bounded outline result on camera-only redraws, but this does **not** recover previously omitted fragments.

The underlying 103 shooter supports only one forward-x branch and the ground surface is the only occluder. A numeric `indeterminate` / `solver_failed` is not proof of physical blockage. The new preview does not promise topology completeness for arbitrary fast-varying/multipath profiles. No mirage functionality is added.

## Tests and reproducible workload

`node --test tests/CurvaturePhysicalTowerCanvas107.test.js` checks:

- vacuum angular perspective vs independently projected camera geometry, including a tilted/rotated camera;
- optical elevation and horizontal pan effects, near and viewport clipping;
- visible-only Canvas operations, and refusal to paint non-visible segments;
- explicit support/fallback rules and refusal to accept offset camera origins;
- cache reuse/invalidation with model height, atmosphere and comparison radius;
- actual independent tower shapes for two different banks and Legacy effective-radius isolation;
- classic `<script>` dependency ordering and browser runtime routing/audit guards.

`node tools/benchmark-physical-tower-canvas.js vacuum` runs real GeometryEngine tower primitives at **2, 10, and 85 towers**. This is deliberately not the former 85-point proxy and not a browser FPS claim. Sample local Node run (times are machine-dependent):

| Towers | Real primitives | Visible outline pieces | Unresolved leaves | Bounded cold build | Cache-hit preparation |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 8 | 298 | 0 | 36 ms | 0.03 ms |
| 10 | 40 | 874 | 0 | 127 ms | 0.04 ms |
| 85 | 340 | 4224 | 1648 | 3515 ms | 0.04 ms |

For 85 towers, the build reached its configured **time budget** and the outline is **incomplete**. `cache-hit preparation` is not total pixel rasterization or end-to-end Canvas redraw time. This is an important bottleneck to address before calling the physical mode a ready interactive renderer.

## Next work

108: independent Globe-vacuum vs Flat/inverse-spherical boundary and camera-angle validation across heights and `occlusionRadius` values, plus browser screenshot checks. Resolve partial 85-tower rendering, budget strategy, and physical background surface rendering separately before replacing Legacy as the default. Keep `PROJECT_STATE.md` refreshed when architecture materially changes.
