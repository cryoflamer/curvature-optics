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

## Canvas Direct layer benchmark (Modern Animation Studio)

In Animation Studio, select **Canvas Direct** and open **Playback profiler**.
Click **Benchmark Canvas layers** at the desired position in a Soundly project.
The benchmark freezes one camera/scene sample and runs three rotated passes
(30 warm-up + 120 measured RAF callbacks for each mode) through:

- `canvas_full` — fills, outlines, and horizon mask enabled;
- `canvas_no_fills` — object fills disabled, but horizon mask retained;
- `canvas_no_strokes` — outlines disabled;
- `canvas_no_mask` — horizon mask disabled.

All variations start with the same three diagnostic flags enabled; the current
live Fills / Outlines / Horizon mask checkboxes are not changed. The benchmark
restores the prior playback position and playing state on completion or cancel.
One timestamped JSON is downloaded automatically. `summary` aggregates each mode
across all three passes; `runs` preserves every measured frame, including RAF gaps,
synchronous callback/render/projection/Canvas timings, and Canvas 2D call counts;
`config.profile` distinguishes layer experiments from the original five-mode
Playback benchmark. Canvas call counts cover **the Canvas Direct painter only**
(including its background clear/fill and mask), excluding HUD, decorations,
other browser-side work, and deferred GPU/compositor processing. The number of
`clip` calls is normally zero: the painter clips geometry numerically.

Compare each variation to `canvas_full` **inside the same report**. Do not
interpret differences across separate Legacy and Modern videos as isolated
renderer cost. Fast RAF intervals alone do not demonstrate actual frame display
rate; browser scheduling and deferred graphics may dominate.


## Canvas Direct stroke isolation benchmark (Modern Animation Studio)

After the layer benchmark identifies expensive outlines, click **Benchmark Canvas
strokes** in the same Playback profiler. No new page or project file is created.
This opt-in benchmark freezes the current scene/camera and forces the same
fills, outlines and horizon mask on in all modes, even if the live diagnostics
checkboxes are off. It performs three rotated passes of 30 warm-up and 120
measured RAF callbacks for each of these four diagnostic render variants:

- `stroke_baseline`: original Canvas Direct path construction and `stroke()`.
- `stroke_path_only`: exactly the same line clipping and path construction,
  with `stroke()` omitted. **Contours are invisible**, but calls to
  `beginPath()`, `moveTo()` and `lineTo()` remain.
- `stroke_simple`: same individual contours and stroke calls, but solid black,
  opaque 1-device-pixel lines with miter joins instead of authored styles.
  This is *not* an equivalent image and is never used during normal Playback.
- `stroke_batched`: combines consecutive strokes having identical color,
  alpha and width into one `beginPath()` / `stroke()` pair. Pending paths are
  flushed **before each fill** (including the horizon mask), at style changes,
  and at the end. This is an experimental diagnostic, **not yet a production
  optimization**: same-style overlapping subpaths can differ subtly in alpha
  compositing or line antialiasing.

A single JSON is downloaded on completion; `config.profile` is `canvas-strokes`.
`strokePrimitives` is the number of projected primitives whose outline paths
were prepared, while `strokeCalls` counts the number of actual `stroke()`
invocations. `lineToCalls`, `beginPathCalls`, RAF intervals, and JavaScript
stage timings distinguish path-building from stroke submission. The current
Playback position, running state and live layer toggles are restored when the
benchmark stops, completes or fails.

**Interpretation:** baseline vs path-only measures the effect of submitting
strokes *with path work retained*. Simple tests style cost; batching tests
submission count when geometry stays constant. RAF gaps include browser
scheduling and asynchronous graphics/compositing work, so these data alone
cannot locate the specific browser/GPU thread responsible for delays.

## Canvas Direct stroke style isolation (Modern Animation Studio)

The **Benchmark stroke styles** button appears alongside the layer and stroke
benchmarks in **Playback profiler**. Use it after the earlier stroke test
establishes that submitting normal `stroke()` calls is expensive while the
combined simple style is faster. It freezes the same scene, camera, canvas
size and authoring options across all six modes and forces fills, outlines
and the horizon mask on:

- `stroke_baseline`: authored color, alpha, scaled width, and **round** joins.
- `stroke_opaque`: identical to baseline except outline alpha is forced to 1.
- `stroke_black`: identical except outline color is forced to `#000`.
- `stroke_width_one`: identical except `lineWidth` is forced to 1 Canvas pixel.
- `stroke_miter`: identical except `lineJoin` is forced to `miter`.
- `stroke_simple`: combined positive control: opaque black 1px miter strokes.

Each mode retains exactly the same outline paths, line segments, number and
order of `stroke()` calls, fills and mask. Thus the single-factor comparisons
change *only* their named stroke style property; there are no substitutions of
geometry, depth ordering or draw-call batching. The experiment deliberately
changes pixel output and never affects normal Playback, PNG/video export or
saved project state. The painter resets `lineJoin` before every frame so a
previous `miter` or `simple` run cannot contaminate the following baseline.

The automatically downloaded JSON has `config.profile: "canvas-stroke-styles"`;
three rotated passes each measure 120 RAF callbacks after 30 warm-up frames.
There are 18 runs in total. As well as existing Canvas operation counters, it
contains per-frame `strokeTranslucent`, `strokeNonUnitWidth`, `strokeNonBlack`
and `strokeRoundJoin`: the number of *submitted strokes* exhibiting each
property (including the full and simple modes). These counters help detect a
nominal single-factor change that does not actually affect the chosen frame.

Compare `gapMs.p50` and `gapMs.p95` by mode **within this one JSON**, while
checking that `strokeCalls` and path counters are identical. One-factor speedups
are not necessarily additive, so the combined simple control also detects
interactions. RAF intervals include scheduling and deferred browser paint;
these data do not prove which graphics backend is responsible. `1000/p50`
is an approximate comparison rate, not the application's achieved video FPS.


## Canvas Direct stroke width sweep (Modern Animation Studio)

After the single-factor stroke-style benchmark identifies authored stroke width
as the dominant sensitivity, use **Benchmark stroke widths** in **Playback
profiler** to measure a frozen frame with one baseline plus nine forced widths:
`0.5`, `0.75`, `1`, `1.125`, `1.25`, `1.5`, `2`, `3`, `4`. The JSON profile is
`canvas-stroke-widths`, with stable mode identifiers `stroke_baseline` and
`stroke_width_0_5` through `stroke_width_4` (underscores represent decimal
points). Three rotated passes measure 120 RAF callbacks per mode after 30 warmups
(30 runs in total). Download is automatic; the original Playback state is
restored afterward or after cancellation.

Each width mode retains the exact same projected geometry, clipped paths,
`stroke()` calls, order, joins, stroke colors and alpha, fills and horizon mask.
**Only `ctx.lineWidth` changes.** The baseline retains authored, scaled widths.
These are diagnostic images, not a change to regular Playback, exports or
project data. Look at `strokeCalls`, `beginPathCalls`, `lineToCalls`,
`strokeWidthMinPx` and `strokeWidthMaxPx` in the JSON to confirm isolation.

The fixed values are **Canvas backing-store pixels**, because Canvas Direct
paints after `setTransform(1,0,0,1,0,0)`. They are not CSS pixels: for example,
with `canvas.width = 1334` and `cssWidth = 1186`, a 1 CSS px line corresponds
approximately to `1334/1186 = 1.125` Canvas px. The 1.125 step deliberately
probes this neighborhood, but remains *exactly* 1.125 Canvas px even when DPR
or canvas CSS dimensions differ. `devicePixelRatio`, canvas and CSS dimensions
are recorded in `environment`. Baseline widths may differ across objects and
can be non-integer.

Compare `gapMs` p50 and p95 **within each pass as well as pooled across passes**.
RAF intervals include scheduling and deferred browser graphics work, so
`1000/gapMs.p50` is a comparison proxy, **not** achieved video FPS. The sweep
isolates a width dependency but does not establish which graphics process or
raster backend causes it. Parameter changes can affect pixel output and
antialiasing; do not promote a forced width to production without visual
comparison and normal-playback verification.

## Isolated Canvas 2D stroke microbenchmark

Open `tools/canvas-stroke-benchmark.html` directly in Opera/Chromium (a `file://`
URL works). This standalone diagnostic imports **no Curvature modules**, changes
no production rendering settings, and uses deterministic paths on an independent
1334 × 889 backing-store Canvas with 1,221 individual `stroke()` calls per frame.
The default outline-only experiment is deliberately simpler than Soundly; a
separate scene-like mode interleaves 1,189 fills with the same strokes.

Select one experiment at a time (or **All experiments**):

- **A · 1 px threshold**: 0.95, 0.99, 1, 1.005, 1.01, 1.025, 1.05,
  1.075, 1.1, 1.125, and 1.25 backing-store px; the other properties match.
- **B · Straight vs polyline**: one vs six segments per contour at widths around
  1 px; compare widths *within a geometry type* before comparing geometry.
- **C · Canvas transform vs physical width**: identity vs 1.125× Canvas CTM,
  scaling input coordinates and assigned `lineWidth` inversely so the actual
  backing-store geometry and line width stay the same. This is **not** a change
  in the real display `devicePixelRatio`.
- **D · Context allocation hint**: default Canvas 2D context versus a separate
  context created with `{willReadFrequently:true}`. This flag can influence
  implementation but does **not** guarantee a CPU-only backend.
- **E · Interleaved fills + strokes**: same contour widths with an additional
  fill before most outlines, to probe a more scene-like painter workload.

Default: 15 warm-up + 90 measured RAF frames per mode × three rotated passes.
The run is cancelled if the tab becomes hidden. A timestamped JSON is downloaded
on completion (and can be exported again); `config.profile`, browser DPR,
context attributes, immutable mode definitions, measured rows, per-pass runs and
aggregated `summary` distinguish this report from Curvature Playback benchmarks.
Compare `gapMs.p50/p95` **within the same run**. `drawMs` is CPU-side elapsed
JavaScript submission time, *not* proof of GPU completion. `1000 / gapMs.p50`
is only indicative RAF cadence, not a reliable displayed video FPS estimate.

To investigate a **real** device-pixel-ratio effect, repeat the same profile
with a different browser zoom / display scaling, and compare the exported DPR
and canvas sizes. Check `opera://gpu` or `chrome://gpu` and browser tracing when
identifying the raster backend: the benchmark itself cannot determine whether
Skia used a hairline, CPU, GPU or compositor path. A negative reproduction in
this isolated page does not rule out interaction with Curvature's painter.
