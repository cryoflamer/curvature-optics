# Animation performance & pixel parity

This is a **measurement gate**, not a physical model, a video exporter, or a claim that
Animation and Scene/Compare already produce identical pixels. It adds no optical
approximations, does not rewrite Legacy, and never rescales source images to make
an apparent match.

## In Opera

1. Open a saved **Animation** project and Prepare. In **Optics**, prefer **Accurate RK4**.
2. Open **Performance & pixel parity (diagnostic)** beneath the playback controls.
3. Play or seek through the project. It records up to the latest 120 **actually
   rendered** frames; the time and p50/p95 are *not* inferred from intended FPS.
   Scene and Compare A/B have separate solver/caching metrics; a mixed
   Fast/Accurate Compare frame is labeled **Mixed**, not silently called Accurate.
4. Pause on the target frame. To test actual pixel parity, first render **the same
   experiment** in Scene or Compare (including camera, objects, captions, optical
   quality and display flags), then return to Animation and press **Compare
   current frame with Scene/Compare**. Do not edit the experiment in between.
5. The comparator refuses to claim parity if the viewport bitmap dimensions,
   experiment states, quality modes or Canvas backends differ. This is common
   when Animation and Scene have different layouts. If so, the result is
   **not comparable**, *not* a passed or failed pixel-parity test. To obtain a
   pixel comparison, both canvases must have identical backing dimensions.
6. **Export audit JSON** saves actual sampled timings and the last pixel
   comparison or its explicit refusal. **Clear measurements** starts a fresh
   sample set without changing the animation or caches.

The comparator reads full RGBA values with `getImageData`. It reports exact
mismatch count, fraction of pixels whose *maximum channel difference* exceeds
2/255, mean per-channel absolute error and maximum channel error. The 2/255
threshold is **diagnostic only**: no pass/fail claim about numerical or visual
acceptability follows from it. Image readback itself can be expensive; it only
happens on the explicit comparison action.

A changed physical state, different canvas dimensions, unmatched text overlays,
CSS/compositing effects, fast approximations, or an old working viewport can
produce a difference. Pixel equality also **does not prove** the atmospheric
physics is correct. Keep these distinct from validated numerical optics tests.

## Performance interpretation

- `frameMs`: wall-clock duration of the *actual* isolated Animation render;
  Compare includes both A and B and any Accurate fallback repaint.
- `opticsMs`, `composeMs`, `paintMs`, `canvasMs`: existing production renderer
  timings, *not* arbitrary stages reconstructed from an FPS count. Some stages
  are nested and must not be blindly summed.
- Cold optics: frame reports `cacheReused=false`; warm optics:
  `cacheReused=true`. A warm *request* that missed the cache is cold in reports.
- p50/p95 uses nearest-rank percentiles over the bounded sample set. With few
  samples, or a mixture of Fast/Accurate, treat these as diagnostics, not
  cross-machine benchmarks. Compare samples at the same resolution, browser,
  optics and physical scene. Export can be used to split by quality/time later.
- `unresolved` and `fillUnresolved` are separate quality-warning counters;
  neither is silently treated as zero when the renderer lacks that metric.
- The animation's real-time clock may skip sample times when CPU rendering
  takes too long. These are measurements of **rendered** frames only.

## Regression coverage / limitations

Run `node --test tests/ModernAnimationQualityAudit.test.js`. Tests cover exact
pixel comparison (including alpha and dimensions), refusal conditions,
independent A/B cold/warm summaries, bounded raw data, and loading without
CommonJS (`require`). Static isolation checks ensure the probe never applies
experiments or redraws the live renderer.

**Browser pixel parity is not certified by Node tests.** A real Opera test at
identical bitmap sizes and the same physical state is required. This audit does
not automatically prepare aligned reference canvases or record user videos;
those belong to the later deterministic frame-render/export work.

## Prior to deterministic export

Validate a fixed sequence including Globe R=6371 km, intermediate Globe,
exact Flat, and temperature-lapse gradient endpoints; compare accurate pixels
at fixed output dimensions. Determine a numerical/visual acceptance threshold
before labeling any mismatch acceptable. Export should use fixed timestamps
and never assume the interactive frame-skip policy is deterministic.
