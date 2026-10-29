# Compatpatch 138.2 — animated atmospheric shimmer (GPU prototype)

## What has been implemented

- Standalone WebGL 1 postprocessor `ModernAtmosphericShimmer.js`.
- The physical Canvas is uploaded to one immutable-in-between-renders GPU texture
  **only** after a new optical scene draw. Every animation frame samples that
  cached GPU texture; **no physical ray solving, Canvas readback or texture
  re-upload occurs inside the animation loop**.
- Smoothly advected, two-scale value-noise gradients warp the resulting image
  continuously. Its `intensity`, `scale` and `drift` are **screen-space CSS
  pixel** quantities, not calibrated meteorological `C_n²` predictions.
- Each Scene/A/B viewport owns its own texture, while by default they share
  the same noise seed (useful for controlled A/B comparison).
- Existing guide Canvas stays sharp. The clipping box anchors overlays.
- The animation loop stops when no active view has an enabled, captured layer,
  during camera drag, and when the page is hidden; the physical source is
  restored if the presenter fails or is switched off.
- **Disabled by default**, and there is deliberately **no UI setting yet**;
  UI settings and persistence belong to 138.3.

## Local browser trial (after applying 138.1 and 138.2)

From the root of the app repository:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/CurvatureApp.html?ui=modern`, allow the normal
scene to render, open DevTools (`F12`) and run:

```js
(() => {
  const app = window.CurvatureModernApp;
  const p = app.getAtmosphericPresentation();
  const s = app.getAtmosphericShimmer();
  s.configure({intensity: 8, scale: 35, drift: 35});
  p.setEnabled('Scene', true);
  document.getElementById('ModernRender').click();
})();
```

Watch the towers, not the orange horizon line. Increase `intensity` up to 20
or reduce `scale` to 20 to accentuate the effect. Changing values while the
animation runs requires no redraw:

```js
CurvatureModernApp.getAtmosphericShimmer().configure({intensity: 12, scale: 24, drift: 55});
```

Inspect rendering counters (frames must rise; uploads should stay at 1 until
next physical render):

```js
CurvatureModernApp.getAtmosphericShimmer().getStats('Scene');
CurvatureModernApp.getAtmosphericShimmer().getError('Scene');
```

To stop and restore the undistorted view and guide annotations:

```js
CurvatureModernApp.getAtmosphericPresentation().setEnabled('Scene', false);
document.getElementById('ModernRender').click();
```

Compare A/B: click **Compare**, then run

```js
(() => {
  const p = CurvatureModernApp.getAtmosphericPresentation();
  p.setEnabled('A', true);
  p.setEnabled('B', true);
  document.getElementById('ModernRecalculateCompare').click();
})();
```

Look at `getStats('A')` and `getStats('B')` for independent textures. Disable
both and recalculate to return to the original rendering.

On browsers without WebGL 1 support (or if the browser/graphics policy denies
it), the original scene remains visible. Use `getError('Scene')` in the
console to see why shimmer was not activated. Browser hardware acceleration
and WebGL availability may depend on system graphics settings.

## Known boundaries

This is a **manual illustrative heat-haze effect**, not a physical simulation
of turbulence through a 40 km stratified atmosphere. The filtered noise
spectrum is not a Kolmogorov phase-screen solver; it must not be interpreted
as a forecast of real image motion given a temperature gradient. More physical
calibration, small-scale aliasing control and frame-time profiling are follow-up
work (138.4 / 139+).

## Automated checks

```sh
node --test tests/ModernAtmosphericPresentation1381.test.js tests/ModernAtmosphericShimmer1382.test.js
node --test tests/*.test.js
```

## 138.2.1 — transparent Canvas compositing correction

The ordinary physical GraphX3DX Canvas contains transparent sky pixels and
uses a white CSS backdrop. The 138.2 WebGL presentation requested an opaque
(`alpha: false`) drawing buffer, which converted those source pixels to black
**even with** `intensity: 0`. This was a presentation bug, not an optical
or noise-field result.

The WebGL context now retains the uploaded source's alpha channel
(`alpha: true`, `premultipliedAlpha: false`). The fragment shader continues
to return the entire RGBA texel unchanged apart from its sampling location.
The existing white CSS background of the presentation Canvas therefore shows
through transparent sky areas, like the original physical Canvas.

To verify in the browser, enable shimmer with `intensity: 0`: the sky should
remain white, and the image should be visually identical to the physical
view. Then increase intensity and check that only local image distortions
change, not the sky color. Switch the layer off and on to confirm consistent
compositing. Automated regression checks cover the WebGL alpha-context
contract, unmodified shader alpha, CSS background, and zero-strength frame.
