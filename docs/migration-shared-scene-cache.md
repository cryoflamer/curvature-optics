# Patch 113 — shared ground/tower optical oracle and safe redraw caching

## Goal and scope

Patch 112 gave the real 85+2 tower mesh an adaptive two-dimensional ray field,
while physical ground guides still owned separate calls to
`OpticalTargetProjection.solve()`. Patch 113 connects their **exact ground ray
requests** to the same field's `exact(d,0)` memoization. The ground continues
to use its own 33-point radial **drawing** approximation and independently
resolved optical horizon, so a tower bounding prism **never** becomes a ground
cutoff or fabricated Flat horizon. For vacuum the existing analytic paths are
unchanged.

`CurvaturePhysicalGroundGuides.create()` now accepts optional `sampleGround(d)`.
When supplied by the scene adapter, the callback is the field's exact RK4
point cache, **not** the adaptively interpolated `sample()` result. This keeps
horizon and ground-table probes independently exact; it also allows reuse if
the same ground point has already been computed for a tower. For standalone
ground-guide callers, the original independent physical solver is retained.

The field's `solves` statistic now counts **all exact rays** used by the
combined tower+ground scene. Additional scene statistics report
`sharedGroundSolves`, `sharedGroundCacheHits`, and `towerSolves`. Their sum
is the total (`fieldStats.solves`); `guideSolves` is retained for compatibility
but means ground *ray requests*, which may be fulfilled by cache. Because
most sampled ground radii differ from tower vertex distances, this change is
primarily an architectural consistency improvement, **not** a claim of large
additional cold-scene speedups.

## Correct scene-level cache invalidation

Prior to patch 113, the scene cache key relied only on selected legacy model
fields, atmosphere and settings. Supplying a changed `optics-neutral-main`
scene with the same model could silently reuse stale optical geometry, tower
styles, or ground-guide styles.

The key now additionally serializes the exact geometry, styles, metadata
and command indices of **physically contributing** authored primitives.
Geometric legacy tangent/horizon guides and plane-reference aids are explicitly
dropped by the Physical ground adapter, so they are excluded from the cache
key too: their camera-dependent representation must not trigger a ray rebuild.
There is no lossy 32-bit hash. Camera/pan are intentionally **not** in the key, so camera-only
redraws reuse optical computations. Changing authored tower vertices, guides
or styles invalidates the cache even when the legacy model key is unchanged.
The serialization costs some CPU per redraw (particularly for 200 objects),
but prevents stale rendered shapes and is much cheaper than rerunning RK4.

The optically projected composition itself is also cached. The shared
`CurvatureRenderFrame` and `CurvatureFrameRenderer` retain their existing
snapshot/copy/validation and camera projection on each redraw, but the optics
adapter no longer rebuilds thousands of line primitives through
`CurvatureSceneContract` on an unchanged frame.

Only complete scenes (no preview time-budget expiry or sample-budget leaves)
are retained. Other unresolved boundary/grazing cases remain explicitly
classified rather than silently filled.

## Reproducible real-mesh benchmarks

Benchmark tool (time is **Node optical scene preparation only**, NOT complete
browser or Canvas paint time):

```sh
node tools/benchmark-shared-scene-113.js
node tools/benchmark-shared-scene-113.js --globe
node tools/benchmark-shared-scene-113.js --towers=200 --atmosphere=inverse-spherical
```

One measured local run, 2026-10-27, observer height 15 m, RK4 step 2000 m,
shared adaptive field depth 3, real objects plus 2 focus towers:

| Geometry / atmosphere | Towers | Cold optical frame | Reused optics adapter | Exact rays | Visible pieces | Unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flat / Standard | 4 | 211 ms | 10 ms | 678 | — | 0 |
| Flat / Standard | 12 | 335 ms | 6 ms | 1225 | — | 0 |
| Flat / Standard | 87 | 206 ms | 6 ms | 1661 | 3333 | 0 |
| Flat / Standard | 202 | 238 ms | 12 ms | 1845 | 7473 | 0 |
| Globe / Standard | 87 | 996 ms | 2 ms | 3605 | 3560 | 130 |
| Globe / Standard | 202 | 4724 ms | 6 ms | 11797 | — | 276 |
| Flat / inverse-spherical | 202 | 1879 ms | 8 ms | 12165 | — | 236 |

The 33 Flat ground requests are included in field totals, so 87 Flat Standard
reports about 1628 tower RK4 solves + 33 ground exact solves = 1661 total.
Cold timings are JIT/load-sensitive and are not monotonic for small scenes;
there is **no** guarantee of the exact millisecond results on other computers.
The Globe 200 and engineered horizon cases remain significantly more
expensive due to boundary-sensitive exact work. No optimization removed that
work or treated solver failures as hidden objects.

## Regression and browser acceptance

```sh
node --test tests/SharedSceneCache113.test.js
node --test --test-concurrency=2 tests/*.test.js
```

1. Open TrnsmLine / Flat / Standard / Physical / eye 15m, 85 towers. Both
   groups, the physical guide lines and horizon status should be preserved.
   UI now separates `shared exact ray solves (tower, ground)` and counts
   ground ray *queries*.
2. Change only camera pan/zoom/rotation. The status should report cached
   optical geometry and no repeat RK4 integration, while the view moves.
3. Change Standard to Vacuum, then Globe + Standard and Flat + inverse-spherical;
   geometry must rebuild, and the finite horizon appears **only** when physical
   conditions call for it. The scene cache is not shared across atmospheres.
4. Increase the first group to 200 towers. Flat + Standard should remain
   complete; Globe + Standard may still have **explicitly** unresolved
   horizon-boundary pieces. Record complete browser frame time independently
   from the optical scene `buildMs` shown in the status.
5. Change the scene's guide style or geometry while retaining the other model
   settings. The new authored scene must be projected, not served stale from
   a cache entry; an automated test exercises this API behavior.

## Remaining work

This patch does **not** add polygon fills, mutual mesh occlusion or true
pixel-exact camera-aware adaptive error certification. The ground grid still
has a 100-km **drawing** extent on Flat, which is NOT an optical horizon.
The main future optimization target is near-horizon exact work for Globe /
engineered profiles at large tower counts; maintain direct RK4 as the oracle.
