# 127 — Observer-fixed Physical camera and continuous curvature control

## Why

The old `CurveAppClass.Update()` camera center distance, scene size and
horizon reference were derived from the geometric horizon. Even when
`CameraAim=Eye-Lvl` fixed the direction, the camera bootstrap still depended
on radius and could lose precision near the flat limit.

## What changed

* **Physical only:** `CurvaturePhysicalCamera.create(model)` fixes the
  camera origin at the observer, looks toward a *finite* 1000 m reference
  distance, and sets its angular field from `camViewAngle`, Pan, Nick, Roll
  and aspect ratio. Neither the view-center range nor field of view depends
  on Earth radius or horizon. `Eye-Lvl` is the recommended setting when
  comparing geometries; `Horizon` deliberately follows the physical dip.
* The GraphX3DX main viewport remains the Canvas owner. Its captured window
  transform, painter, observer-origin optical rays and the legacy/independent
  camera path are unchanged.
* **Physical only:** a logarithmic `Surface curvature` control covers finite
  globe radii from 100 km to 10^13 km (1e16 m), followed by an *exact* flat
  endpoint. The endpoint sets `showModel=2`, yielding k=0 throughout the
  physical world and optics. No numeric Infinity is inserted into the old
  model's finite radius field. `Earth R` restores exactly 6371000 m.
* Existing RadiusPlanet input, Globe/Flat radio selection, URL states,
  JSON/stream persistence and demo presets continue to own their historical
  `rEarth` / `showModel` values. The Physical slider synchronizes from them.
  A manually selected Flat radio button also reaches the exact endpoint.
* Dragging the radius control delays a cold optical rebuild until 250 ms of
  inactivity (or immediately on `change`), rather than initiating an RK4
  solve on every pointer event. During the drag the previous scene remains
  displayed with an explicit pending status. Camera-only redraw caching is
  unchanged.
* For radii above 1e12 m, the legacy *computed reference values* now use
  a numerically stable geometric dip and distance; normal Earth calculations
  keep their former arithmetic. The physical camera ignores these references.

## Tested invariants

`tests/PhysicalCurvatureCamera127.test.js` exercises the exact same projected
local directions at Earth R, large R, nearly flat R and k=0; independent
3D placement differences at 500 m; 4 aspect ratios; pan/nick/roll; all aiming
modes; ultra-large radii; slider monotonicity and exact flat; existing state
fields; and browser script order. Run `node --test tests/*.test.js`.

A headless Chromium smoke test of the actual classic-script page ran 85+2
transmission towers with Standard atmosphere at 6371000 m, 6000370000 m,
1e16 m and Flat, with zero unresolved samples and no page errors. The camera
center and scene size stayed identical in Eye-Lvl. This is a browser smoke
check, **not** a pixel-perfect validation of the user's full screen capture.

## Known limits and next work

* The endpoint is exact, but positive-curvature steps are discrete on a log
  radius scale. The existing RadiusPlanet numeric field remains available
  for an exact finite value; the slider may show its nearest position.
* Legacy/Independent maintain their original horizon-based camera and
  pre-existing large-R limitations. This patch does not rewrite them.
* Finite ground guide extent remains 100 km and does not define the optical
  horizon. Ray solver convergence, atmospheric regimes with multiple ray
  branches, caustics, and very shallow grazing cases require the dedicated
  end-to-end #128 audit.
* Test the new control in the user's real browser, including Save/Restore,
  slow/fast dragging and image comparisons at fixed Eye-Lvl.
