# Modern camera interpolation

`src/camera/ModernCameraInterpolator.js` is a pure, deterministic mathematical
module for future camera animation. It has no renderer, clock, DOM, or Legacy
dependency and is **not** wired into Scene/Compare playback yet.

`cameraAt(start, end, timeMs, durationMs, mode)` evaluates a saved Modern camera
pose at an absolute timestamp. `mode` is `linear` or `smoothstep` (default).
Times before/after the interval clamp to the exact saved endpoints.

East/North are linearly interpolated in Modern's local camera coordinate system;
Height is interpolated as height above the local surface. This is **not** a
geodesic path for long Globe flights. Pan and Roll take the shortest angular
route, Nick interpolates linearly, and positive focal lengths interpolate
logarithmically. The interpolator does not change atmospheric or scene state.

`viewcenterHorizon` and `deviceRatio` are discrete: they must agree between
endpoints for an interior frame. Callers must choose a fixed aim mode and
aspect ratio before playback. There is no implicit mid-flight switch.

Future playback should evaluate poses by absolute timestamps, use Fast Preview
while moving, and run Accurate on completion. Rendering, cancellation, keyframe
storage, and video export are separate future work.

Run `node --test tests/ModernCameraInterpolator.test.js` for focused checks.
