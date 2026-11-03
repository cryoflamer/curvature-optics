# 137.1 — Shared Scene/Compare camera drag (final-frame interaction)

## Scope and behavior

- The same `ModernCameraInteraction` transaction is used for Scene and Compare
  A/B. Drag with the primary pointer on the **Canvas** (left mouse button or
  primary touch/pen contact). Dragging diagonally changes Pan and Nick together.
- **Grab the picture** convention: dragging right looks left (Pan decreases),
  dragging down looks up (Nick increases) for Roll=0. Nonzero camera Roll rotates
  the angular mapping accordingly; Roll itself is preserved.
- Angle sensitivity uses the physical camera's **diagonal** `camViewAngle`
  (radians), `deviceRatio`, and the initiating viewport's CSS pixel width and
  height. High zoom leads to smaller angle changes per pixel. Canvas backing
  store/DPR and the relative width of Scene vs Compare do not change the meaning
  of a given *fraction* of the viewport drag.
- A lightweight HUD displays the prospective Pan/Nick during dragging. Neither
  `model` nor the physical scene is changed during `pointermove`. On `pointerup`
  with at least 2 CSS pixels of movement, the shared model Pan and Nick are
  committed **once**, the existing numeric controls synchronized, the preset
  marked custom and one normal redraw scheduled. In Compare that redraw runs A
  and B with the **same** camera, keeping independent physics/cache sessions.
- Clicks below the movement threshold do not redraw. `pointercancel`, lost
  pointer capture, window blur, visibility loss, and mode change cancel without
  changing the model. Pointer capture retains a drag outside the Canvas.
- The user's selected Scene `Camera aim` remains unchanged. Compare continues
  using common eye-level aim for A and B. Other fields, including FOV, observer
  height and Roll, are not changed by dragging. Existing experiment persistence
  operates through the normal redraw/save path; there is no new save schema.

## Angle mapping

Let `fov` be the diagonal field of view in radians, `r` the physical camera
aspect ratio, and `(w,h)` the initiating viewport's CSS dimensions. Then:

```
q = tan(fov/2) / hypot(1,r)
H = atan(2*q*r*dx/w) * 180/pi
V = atan(2*q*dy/h) * 180/pi
Pan'  = clamp(Pan - H*cos(Roll) + V*sin(Roll), -360, 360)
Nick' = clamp(Nick + H*sin(Roll) + V*cos(Roll), -90, 90)
```

This is a **centre-calibrated gesture mapping**, not a guarantee of exact pixel
correspondence for arbitrary pan/tilt/roll across the whole perspective image;
exact view projection is carried out by the existing physical renderer after
release. Values outside the supported camera controls' ranges are clamped.

## Performance and next step

Patch 137.1 is **not** a live image preview: the Canvas contents do not move
until release. The light HUD is the only per-move update. No physical redraw,
scene recomposition or ray tracing is called by `pointermove`. This avoids
blocking the main thread with the current ~65 ms warm Compare redraw measured
on the user's browser. Patch **137.2** will add an inexpensive cached-image
preview during drag; this should not change the model until commit, and it must
not blur the physically authoritative final result.

## Validation

- Pure tests: both axes, inverse displacement, zoom sensitivity, viewport
  scaling, Roll mapping, camera limits and invalid calibration.
- ModernApp integration: Scene and A/B pointer events, one redraw on release,
  same model Pan/Nick in Compare A and B, no redraw on move, and cancellation
  paths including a mid-gesture mode change.
- Legacy scene drawing and the Physical solver are not modified.

Run: `node --test tests/*.test.js`.
