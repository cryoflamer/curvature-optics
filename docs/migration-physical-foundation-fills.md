# Patch 114 — physically projected authored foundation fills

## What changed and why

Patch 113 already rendered the full optics-neutral scene via the **same**
`CurvatureFrameRenderer` as Independent. However,
`CurvaturePhysicalSceneOptics` converted **all** polygon edges to stroke lines,
including source foundation polygons that expressly had `mode & 2` (fill).
Consequently Physical showed foundations as wireframes despite the existing
painter supporting filled world-frame polygons.

This patch adds `src/optics/CurvaturePhysicalPolygonFills.js`, an independent
**polygon-to-polygon optics adapter**, not another Canvas renderer. It:

1. Reads the original authored `mode & 2` polygons from both object banks,
   including concave/repeated-endpoint foundation contours. `mode & 1`
   contours keep using `OpticalTowerSilhouette` and retain their prior strokes.
2. Triangulates the source polygon in its own world-space plane, independent of
   the viewing camera (`CurvatureEarClip`). This avoids a convex-fan shortcut
   that could fill a concave indentation.
3. Projects the triangulated area through the **same** optical point field
   `F(d,h)` used for the tower outlines and ground. For every visible output
   triangle, samples the vertices, edge midpoints and centroid; the projected
   edge/centroid deviation must pass the angular tolerance. Gentle curvature
   needs no additional subdivision.
4. For triangles crossing the visible/blocked boundary, brackets the crossing
   along each world-space edge, retaining the **last confirmed visible** point.
   Interior probes must also be confirmed visible; otherwise the triangle is
   subdivided. Wholly blocked triangles are omitted. Near the boundary,
   uncertain or budget-limited pieces are **not** filled by guessing.
5. Emits ordinary `type:'polygon', mode:2` triangles with original fill styles
   and optical source IDs, alongside the existing independently clipped
   `type:'line', mode:1` outlines. The existing `CurvatureFrameRenderer`
   handles fill order, camera projection and Canvas painting unchanged.

The source geometry contains stroke-only lattice parts and filled foundations.
**This patch restores only fills that the source actually authored**; it does
not turn wireframe lattice edges into artificial solid plates. Fill primitives
are drawn before the associated group's strokes to retain visible contours.

## Safety and known limits

- This is **sample-qualified** visibility, not a proof over the entire curved
  polygon. The boundary is approximated by small straight visible-side
  segments; a global subpixel guarantee needs further verification. Known
  `solver_failed` / `indeterminate` samples are never considered visible.
- Triangles at irreducibly uncertain horizons are conservatively omitted and
  counted separately as `fillUnresolved` and `fillUnresolvedReasons`.
- Separate polygons still use legacy-authored painter order, **not** mutual
  ray-object mesh intersection or a z-buffer. Front/back polygon crossings
  between towers are not physically resolved in this patch.
- Atmospheric or camera changes remain distinct: atmosphere and scene changes
  invalidate the optical composition; camera-only changes reuse the cached
  physics but reproject through the existing common painter.
- This is **not** a ground surface fill. Physical ground grids and their finite
  horizons are still drawn by `CurvaturePhysicalGroundGuides`.
- The existing Globe horizon-sensitive **outline** uncertainty is unchanged.
  It must not be confused with the fill-specific counters.

## Benchmarks from one local Node run (not full Canvas time)

87 towers (85 + 2), observer 15 m, RK4 step 2000 m:

| Mode | Optical scene cold time | Fill triangles | Fill uncertain | Exact tower rays |
|---|---:|---:|---:|---:|
| Flat / Vacuum | ~115 ms | 900 | 0 | 0 |
| Flat / Standard | ~229 ms | 900 | 0 | 2846 |
| Globe / Vacuum | ~67 ms | 822 | 0 | 0 |
| Globe / Standard | ~764 ms | 896 | 0 | 5690 |

Times vary with machine and JIT. The additional physically verified fill
samples incur extra exact rays compared with the outline-only patch 113.
The near-horizon clipped polygon approach avoids the explosive 25,000+
world-sample subdivision encountered by a naive uniform four-way refinement.

## Automated tests

```
node --test tests/PhysicalPolygonFills114.test.js
node --test tests/CurvaturePhysicalSceneOptics108.test.js
node --test --test-concurrency=2 tests/*.test.js
```

Tests cover concave triangulation, authored style/mode preservation, a mock
half-visible polygon, wholly blocked and failed polygons, real shared Canvas
fill commands, 87-tower Flat/Globe Standard cases and browser load order.

## Browser verification

1. Open **TrnsmLine → Physical optics → Flat → Vacuum**, `NObjects=85`.
   Foundations should now be filled in their original beige style, while
   lattice bars retain their black stroke-only character. The UI should show
   `physical fill triangles` above zero and `uncertain fill triangles omitted`
   at zero.
2. Select **Flat → Standard**. All 87 towers should remain, foundations remain
   filled, and build time should be measured separately from total Canvas
   frame time. Check `0 unresolved` outlines and `0 uncertain fills`.
3. Select **Globe → Vacuum**, then **Globe → Standard**. Verify that the bases of
   partly hidden distant towers do **not** fill through the physical ground.
   The older `unresolved` outline counter may still be nonzero near grazing,
   while the new fill counter should report its own status independently.
4. Adjust **Pan** in Views: expect `optical geometry cached`, a correctly
   changing perspective and continued filled foundations. Replacing a source
   polygon or changing atmosphere must invalidate the cached physical result.
5. Check Independent/Legacy still show their original polygon fills and that
   the physical mode has no added horizon-mask polygon or separate Canvas.

Next: patch 115 should validate physical/mathematical and pixel-level behavior
on representative Globe/Flat horizon cases, including mesh ordering and the
remaining boundary uncertainty, rather than interpreting the fill's sampled
certification as a global proof.
