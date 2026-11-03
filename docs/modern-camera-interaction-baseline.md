# 137 — Modern camera interaction and render profiling baseline

## Scope

This patch introduces **instrumentation and a shared interaction contract**, not
working click-and-drag. There are **no pointer listeners**, no camera parameter
changes and no new preview-render path in patch 137. The optical solver,
composition, camera projection, Scene/Compare save schema and Legacy UI are
unchanged. The next step is 137.1 (drag wiring and angle mapping).

## Verified implementation boundaries

- Both Scene and Compare call `CurvatureMainCanvasRenderer.renderPhysical()`.
  Compare owns independent optical sessions for A and B, while the shared
  `model` supplies Pan/Nick/Roll/FOV and observer height. Compare clones use
  the eye-level aim mode; Scene retains its selectable camera aim.
- Physical optics are already cached independently from Pan, Nick and Roll.
  Cached rays do **not** mean cheap full redraw: composition, optical-transform
  dispatch, screen-guide LOD, frame projection, Canvas paint and annotations
  still run on the main thread.
- `renderPhysical().timings` already provides numerical stage durations.
  Patch 137 does not alter those stage boundaries, so `frameMs` already
  includes LOD and frame construction, and `paintMs` includes the painter
  subphases. **Do not sum overlapping timings.**
- Compare A and B currently redraw sequentially inside the same animation
  frame callback. The reported batch duration measures this combined work;
  it is not an FPS guarantee.

## New profiling API

The browser page loads `src/ui/modern/ModernRenderProfiler.js` before
`ModernApp.js`. `CurvatureModernApp` exposes:

```js
CurvatureModernApp.getRenderProfile()
CurvatureModernApp.resetRenderProfile()
```

Each viewport (`renders.Scene`, `renders.A`, `renders.B`) retains the last 60
successful renders with count, latest, median, 95th percentile and maximum.
The `stages` branch summarizes the physical renderer's own measurements:
`composeMs`, `opticsMs`, `frameMs`, `screenLodMs`, `snapshotOnlyMs`,
`paintMs`, `validationMs`, `projectionMs`, `canvasMs`, and
`decorationsMs`, when available. External wall timings:

- `rendererMs`: call to `renderPhysical`;
- `overlayMs`: traced horizon/eye-level overlays after the physical renderer;
- `totalMs`: these two operations combined.

The independent `batches.scene` and `batches.compare` data measure:

- `setupMs`: synchronous `redraw()` work before scheduling, including
  model update and Compare model preparation;
- `queueMs`: time from scheduling to start of the `requestAnimationFrame`
  callback (not a measure of CPU time or entire event-to-paint latency);
- `totalMs`: entire redraw callback duration;
- nested `Scene`, or `A` and `B`: individual graph `resizeMs` and `redrawMs`.

The profiler excludes input debounce delays, unrelated event handlers and actual
browser compositor/presentation time. Use Chrome Performance recording to
measure those separately. The baseline should be captured on the **same
computer and viewport** for all future comparisons.

Recommended manual measurement, in DevTools Console:

```js
CurvatureModernApp.resetRenderProfile();
// Recalculate Scene once (cold), then several times (warm).
console.log(CurvatureModernApp.getRenderProfile().renders.Scene);
// Switch to Compare, recalculate A/B and inspect:
console.log(CurvatureModernApp.getRenderProfile().renders.A);
console.log(CurvatureModernApp.getRenderProfile().renders.B);
console.log(CurvatureModernApp.getRenderProfile().batches.compare);
```

For cold runs, a fresh page or explicit optical cache invalidation may be
necessary; clearing **profiler samples** does not clear physics caches.
No benchmark numbers are claimed by this patch, since Node mocks are not a
browser performance measurement.

## Shared camera gesture contract

The page also loads `src/ui/modern/ModernCameraInteraction.js`. The app owns a
single `getCameraInteraction()` instance, independent of Scene/Compare.
The controller receives `begin({viewport, x, y, width, height, camera})`
with `viewport` in `Scene`, `A`, `B` and camera `{Pan, Nick, Roll}`. It
produces immutable gesture samples with the original camera values and
unmodified pixel deltas `dx`, `dy`. `move()`, `end()`, `cancel()`, `isActive()`
and `snapshot()` implement one active gesture transaction. Optional
`onPreview`, `onCommit`, `onCancel` callbacks can later drive the view.

**No assumptions about degrees per pixel are baked in.** In 137.1, convert
pixel displacements to yaw and pitch using the actual physical camera FOV,
canvas dimensions and Scene/Compare camera-aim semantics. A pan/tilt gesture
must keep the observer position and both models' physical parameters fixed.
Both Compare viewports must receive the same camera angles; the originating
viewport only determines the pixel-to-angle calibration.

## Planned follow-ups and gates

1. **137.1**: hook pointerdown/move/up/cancel + pointer capture to the Scene
   and both Compare canvases, with one shared camera state; exercise both
   axes and diagonal drags; handle Scene aim and test experiment persistence.
2. **137.2**: store finished frames and draw cheap previews during drag, **no**
   ray retracing. First use an approximate Canvas/CSS translation; exact
   geometry returns on release. Overlay text should not be stretched.
3. **137.3**: use measured hotspots to separate camera-independent prepared
   optical geometry from camera-dependent projection and Canvas painting;
   preserve painter order, horizon rules and A/B cache isolation.
4. **137.4** (optional): GPU-assisted rotational image reprojection, with
   a simple fallback and explicit treatment of newly uncovered regions.

Acceptance for 137 is architectural and diagnostic, **not a performance
speedup**: the default rendered pixels and camera values must not change,
existing regression tests must pass, profiling must distinguish A/B/Scene,
and all renderer timing fields remain available.
