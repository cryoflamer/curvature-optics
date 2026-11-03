# #140.1 — Rendering performance diagnostics

This patch adds **measurement and reporting**, not a new GPU scene renderer.
The physical scene remains **Canvas 2D** and the optional atmospheric shimmer
remains **WebGL**. No optics, ray cache keys, painter ordering, or physical
experiments are changed.

## Browser workflow (Opera/Chromium)

1. Apply the patch after #140.0, reload with Ctrl+F5, then open **Display → Render profiler**.
2. Click **Start recording**. This clears prior measurements and enables
   optional WebGL instrumentation. Scene and Compare have independent samples.
3. For a *warm-cache* sample, recalculate the same scene repeatedly (e.g. 5–10
   times) without changing the camera, viewport size, scene, or atmosphere.
4. Click **Stop recording** followed by **Refresh report**; use **Export JSON**
   to retain the raw measurements and capability diagnostics.
5. For a *cold optical cache* sample, change a parameter that really invalidates
   the optical field, then start a fresh recording. Do not mix cold and warm
   measurements in the same report. The `latest rays cached/computed` label
   refers **only to the latest sample**, not the entire sample set.
6. Repeat in **Compare** and compare A/B results at their actual viewport sizes.
7. For WebGL data, enable Atmospheric Turbulence *before* recording; leave it
   animated (`Intensity > 0`, `Drift > 0`) for several seconds before stopping.
   Scene is capped at 60 present frames/s, Compare at 30 per viewport. Without
   shimmer there is **no GPU scene render** to profile yet.

`Clear` empties all bounded sample buffers. An explicit Start resets them too.
Stop freezes CPU records and stops optional GPU queries. GPU results can arrive
one or more frames after their draw; if the user stops immediately, the last
query might not appear. Only available and non-disjoint results are recorded.

## Timing interpretation

- CPU measurements use JavaScript monotonic time around actual synchronous
  stage work; all values are **elapsed CPU-side wall time**, not CPU core time.
- `Scene composition`, `Optical transform`, `Frame / screen LOD`, `Geometry
  projection` (triangle/projection preparation), `Canvas 2D painting`, and
  `Canvas decorations` come from existing physical renderer stage timings.
  Stages are not all additive because there are nested intervals.
- `UI total` includes the physical renderer plus overlay handling.
- `RAF wait` is time *waiting for* `requestAnimationFrame`, **not drawing**.
- With shimmering enabled, `Canvas→texture upload call` measures the JS/WebGL
  call (including its associated error check), not the completion of the GPU
  texture transfer. `JS WebGL pass` and `State setup + draw submission` are
  also **CPU-side submissions**, not GPU execution time.
- If the browser supports `EXT_disjoint_timer_query`, the WebGL1 shimmer
  renderer may also report **GPU draw execution**. These are nonblocking
  asynchronous timer query results, excluding the texture upload and browser
  compositing. Results during a GPU disjoint period are discarded. The code
  never forces `gl.finish`, `gl.readPixels` or a synchronous GPU wait.
- No GPU draw time displayed means **unknown**, *not* zero. The extension may
  be unsupported, restricted, or pending. Browser compositing, display refresh,
  frame presentation, readback, power use and RAM/VRAM are not measured.
- Short sample sets and first-frame shader compilation should not be compared
  directly with steady-state median/p95. Re-run the same scenario several times.

Buffers hold the latest 60 values per viewport/measurement class. Exported
JSON includes the complete nested profiles with the capture timestamp and the
most recent GPU capability probe (if the user separately ran **Check GPU**).
The current scene settings and environment are **not** persisted by the profiler.
The existing DevTools API `CurvatureModernApp.getRenderProfile()` remains valid,
and `CurvatureModernApp.getPerformanceSnapshot()` exposes the export data.

## Safeguards and regression checks

- Off-by-default shimmer GPU profiling; existing non-profiling path has no
  timer query overhead.
- Feature detection before GPU query use; software-only and unsupported
  browsers remain operational with CPU measurements.
- A single in-flight GPU timer query per WebGL context prevents unbounded
  queued queries; it is deleted on ordinary disposal.
- Recording-generation guards exclude delayed timer results from a previous
  recording. Context recovery retains the existing cached texture behavior.
- A/B per-viewport samples and independent optical caches are unchanged.
- UI buttons never call the optical or Canvas renderer on their own.
