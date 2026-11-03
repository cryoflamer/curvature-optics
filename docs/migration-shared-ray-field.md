# 104 — Shared optical projection field (standalone qualification)

`src/optics/OpticalSharedRayField.js` provides `CurvatureSharedRayField.create({distances, heights, geometry, radius, observerHeight, atmosphere, profileOptions, angleTolerance, ...shootingOptions})`.

- Axes are strictly increasing, in metres. On Flat, distance is horizontal x. On Globe, distance is *surface arc length* from the observer's local radial foot; the target is converted to the independent 103 solver's tangent Cartesian frame by `x=(R+h)sin(d/R)`, `z=(R+h)cos(d/R)-R`.
- `sample(d,h)` returns `{status,angle,method,...}`. `exact(d,h)` always returns a cached standalone 103 solver result, not interpolation. `warm()` prequalifies cells; `stats()` shows exact solver calls, cache hits, interpolations and fallbacks. Cell construction is also lazy.
- Four corners and five interior/edge midpoint samples are solved exactly. A cell is interpolated only when all sampled points are `visible` and the maximum **measured** angle interpolation error is within `angleTolerance` radians. Mixed-status cells, solver failures, and out-of-domain samples fall back to exact shooting. The new field never synthesizes a `blocked` or `indeterminate` status by interpolation.
- The chosen grid and tolerance are caller responsibilities. The five probes **do not prove a global maximum error bound**, nor rule out sub-cell occlusion events. Patches 105/106 must supply stronger horizon guards and randomized comparisons before interpolating near silhouettes. Pixel-based tolerance needs the camera projection scale and is deferred to 105.
- Caches belong to a single `create` instance; recreate the field after changes to geometry, camera, atmosphere, occlusion R or numerical settings. No mutable global cache or automatic invalidation. Do not mutate callback-based custom profiles after construction.
- This is a 2D point projection acceleration, not a fully volumetric mesh or 3D first-hit renderer. Only ground occlusion covered by solver 103 is inherited. It is not wired into the Canvas or legacy drawing pipeline.

`node --test tests/OpticalSharedRayField104.test.js` exercises interpolation, cache reuse, horizon fallback, Globe coordinate conversion, flat/profile-radius separation and validation. Full suite validates no regression. Next: 105 measured accuracy/performance, 106 visible geometry and occlusion.
