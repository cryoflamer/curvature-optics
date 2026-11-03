# Patch 138.3 — Atmospheric Turbulence controls

The **Atmosphere** tab now includes an *Atmospheric Turbulence* panel in both
Scene and Compare modes. This is an experimental **visual** postprocess, not a
physical estimate of \(C_n^2\) from the chosen refractive profile.

## Controls

- **On**: enables/disables the presentation layer for the current viewport.
  Initially OFF for Scene, A and B. Changing On causes one cached physical
  repaint so source captions are separated from the GPU image, and disabling
  restores the original clean Canvas with decorations. Optical ray fields
  remain cached if the underlying physics has not changed.
- **Intensity**: requested CSS-pixel displacement (0–20 px). As in 138.2.2,
  the effective displacement is capped at `min(intensity, 0.16 * scale)` to
  avoid image folds. A low scale therefore limits the visible intensity.
- **Eddy scale**: spatial size of displacement patterns (8–200 CSS pixels).
- **Drift**: horizontal advection speed (0–120 CSS pixels/second).
- **Pause animation / Resume animation**: freezes the selected viewport at
  its last displayed frame and resumes from the same temporal phase. When no
  active viewport needs animation, no shimmer `requestAnimationFrame` runs.

In **Compare**, choose model A or B using the existing model tabs, then edit
its turbulence controls. A, B and Scene have independent settings, enabled
state and pause state. Their atmospheric *physics* is unchanged. Switching
models or editing sliders does not recompute optics. Both Compare models can
animate at once with separate settings.

The preview is **not** yet saved in experiment URLs/local scene presets; it is
a nonpersistent visual preference for the current page session. The existing
DevTools API (`getAtmosphericPresentation()` and `getAtmosphericShimmer()`) is
retained. Optional second argument `configure({...}, 'Scene'|'A'|'B')`
configures one viewport; without a name it changes the global default.

## Manual browser checks

1. Apply this patch on top of #138.2.2, then hard-reload
   `http://localhost:8000/CurvatureApp.html?ui=modern`.
2. In **Scene → Atmosphere** turn **On**. Confirm white background, crisp
   title/diagnostic labels, and moving distortions of the optical scene.
3. Adjust all three sliders. Confirm the image responds immediately without
   clicking *Recalculate scene*. Compare `getStats('Scene').uploads` before
   and after changes: it should not increase until a new physical repaint.
4. **Pause**; the warp freezes. **Resume**; it continues smoothly, without
   a jump caused by time spent paused.
5. Switch to **Compare → Atmosphere**. Enable A, adjust it, select B, give B
   distinct settings, then switch back to A. Confirm neither control state nor
   the optical image of one viewport overwrites the other.
6. Turn both effects OFF, switch back to Scene, verify no shimmer RAF loop
   remains and the regular physical image returns.
7. Drag the camera with shimmer ON and ensure the existing fast camera preview
   is still used, with a fresh authoritative frame after pointer release.

## Implementation

- `ModernAtmosphericShimmer.create()` accepts per-viewport settings and keeps
  a per-viewport elapsed-time clock. `resetClock(name)` resets only the *last
  wall clock sample*, not the accumulated phase, after a pause or hidden tab.
- `ModernApp.js` creates one RAF loop only when a visible, enabled, unpaused
  viewport is ready. Presentation still samples the cached source texture.
- The Atmosphere controls use only `configure`, `frame`, `setEnabled`, and
  `redraw` on ON/OFF. Sliders and Pause/Resume never call physical `redraw`.
- GPU and WebGL behavior still require manual validation in Opera; Node tests
  verify state isolation, scheduling and source-upload invariants.
