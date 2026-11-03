# 137.4 — Perspective-correct camera drag preview

## Objective

Replace the approximate pixel translation in the Modern Scene/Compare drag preview
with a **projective remapping of the raster already present on each Canvas**.
There must be no RK4/optics call, geometry rebuild, `getImageData`, or additional
Canvas drawing on `pointermove`. The authoritative physical renderer still
produces the final result on release.

## Geometric contract

- A camera drag changes **Pan and Nick** (the existing 137.1 gesture), keeping
  observer position, Roll, field of view, objects, surfaces and refractive profiles
  unchanged. Thus all cached pixel *arrival directions* remain valid.
- For a fixed observer centre and a pinhole perspective camera, a 3×3 homography
  maps each old screen direction onto the new camera's raster. Per-pixel depths
  and the complexity of atmospheric refraction do **not** enter this mapping.
- A local pixel `(x,y)` defines a ray in the old camera basis:

  `r = forward_old + right_old * ((x-cx)/fx) - up_old * ((y-cy)/fy)`

  The same ray projects to the new camera at

  `x' = cx + fx * (r·right_new)/(r·forward_new)`

  `y' = cy - fy * (r·up_new)/(r·forward_new)`.

- `fx` and `fy` use the *diagonal* camera FOV, `deviceRatio`, and the visible CSS
  dimensions of **each** Canvas, not the backing-store resolution. The basis
  matches `CurvaturePhysicalCamera.create`, including Roll. Scene accounts for
  its actual `aimDip`; both Compare cameras remain fixed at eye level. The
  initiating viewport controls the single shared target Pan/Nick for both A/B.
- `ModernCameraPerspectiveWarp.transform()` constructs the homography directly
  from the three old ray columns and new camera basis, then formats it as a CSS
  `matrix3d` with `transform-origin: 0 0`. The homogeneous plane division is
  performed by the browser compositor. Geometry and ray tracing are untouched.

## Interaction and fallback

- The existing drag controller coalesces updates into at most **one RAF** for
  Scene or **one RAF containing both A/B transforms** in Compare. While the
  pointer is down, `CurveAppClass` and the physical Canvas backend remain idle.
- On `pointerup`, the final projected raster is held until the regular precise
  redraw finishes. A cancelled drag/blur/mode change restores the old transform,
  origin and cursor. The existing pending-redraw pointer guard is retained.
- If the new view would put any original raster corner behind the target camera,
  the homography is unsuitable as a single textured plane; preview falls back
  to the inexpensive 137.2 translation until release. Older minimal harnesses
  without camera calibration also retain translation. No undefined/NaN CSS
  matrices are emitted.
- Out-of-frame pixels **cannot be reconstructed** by a camera-only warp.
  Blank exposed regions and occasional resampling artifacts are expected until
  final redraw. Labels drawn *inside* the old Canvas are temporarily warped
  with the image; the authoritative renderer restores crisp text on release.
- CSS 3D transforms are broadly hardware-composited, but the browser/driver
  determines whether GPU acceleration and 60 FPS are achieved. No new WebGL
  dependencies or physical engine paths were added.

## Verification

- `node --test tests/ModernCameraPerspectiveWarp1374.test.js` validates the
  identity, direction signs, pixel-level projective agreement (including Roll),
  Scene aim, A/B normalized projection, extreme rotations, queued RAF, hold,
  cancellation, and Canvas transform restoration.
- `node --test tests/ModernCameraDrag1371.test.js` exercises the actual ModernApp
  Scene/Compare wiring with the perspective module enabled, including *zero*
  physical redraw during pointermove and *two* final redraws in Compare.
- `node --test tests/*.test.js` covers the broader optical and UI regressions.

### Browser acceptance

1. Use a very narrow Pontchartrain FOV: drag Scene horizontally, vertically,
   diagonally, and after setting nonzero Roll. Check that preview is smooth and
   the exact final image does not snap dramatically from a wrong warp.
2. Test Camera aim = Horizon in Scene; then Compare A and B with different
   refractive profiles. Drag either view, confirming the other follows in
   camera angle, not surface-dependent image contents.
3. Drag far enough to expose empty pixels. No synthetic geometry or horizon
   should appear. Release to see the full exact raster. Cancel with Esc/blur
   or a mode switch and verify the original pixel position is restored.
4. Compare camera Pan/Nick values to manual field edits and check that the
   optically determined horizon, cached rays and saved experiment still match.
5. Compare `getRenderProfile()` render counts during pointermove and the
   completed redraw against the 137.3 baseline. This patch does **not** claim
   a measured browser GPU speedup without a local Opera test.
