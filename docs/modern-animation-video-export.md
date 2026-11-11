# Deterministic video export — VP9 WebM / H.264 MP4

Status: **Scene WebM/MP4 and the earlier separate Compare exports were confirmed working in Opera**. The new single-file side-by-side Compare output requires a new browser acceptance test.
Prior pipeline profiling is available; Node tests are not browser performance
measurements and do not validate the new combined export in Opera.
The PNG ZIP export, Scene, Compare, and interactive Animation Playback remain
independent; the Legacy application is not modified.

## User workflow

In `CurvatureModern.html`, open Animation Studio and prepare an animation with
at least two compatible keyframes (a valid current draft also works). Expand
**Export video · WebM / MP4 · deterministic (offline)** and choose:

- **WebM · VP9** or **MP4 · H.264**
- FPS: 5, 10, 25, or 30
- Fixed size: 640×360, 960×540, or 1280×720
- Accurate RK4 render Worker count: Auto, 1, 2, or 4
- Encoder bitrate: Standard or High

Click **Render video**. The progress bar assigns 0–90% to ordered frame
submission and 95% to encoder flush/muxing. The optional separate-layout
ZIP branch uses 95–99% for packaging; 100% means the complete artifact was
returned. Status shows elapsed and
estimated render/encode time, rendered/submitted counts, reorder buffer usage,
codec queue depth, and compressed MiB. These are separate phases, not a
real-time screen recording. **Cancel export**
terminates all render and encoder Workers immediately, preventing partial
video downloads.

For Scene, one silent `curvature-animation.webm` or
`curvature-animation.mp4` is downloaded. By default, Compare A/B synchronously
composes both opaque view canvases into one presentation frame and downloads
`curvature-animation-compare.webm` or `curvature-animation-compare.mp4`.
The selected size is **per view**: 640×360 becomes 1280×720, 960×540 becomes
1920×1080, and 1280×720 becomes 2560×1440. Both views are copied at 1:1
resolution into separate letterboxed panels, with labels and timeline outside
the optical image. No extra optical calculations are performed. The internal
`compareLayout: 'separate'` protocol still produces a ZIP with two synchronized
files, for the user-facing layout selector planned in the following stage.

The browser must support `VideoEncoder`, `VideoFrame`, `OffscreenCanvas` and the
selected codec within dedicated Workers. WebCodecs does **not** produce a
container on its own. The probe includes the actual AVC sample format required
by the MP4 muxer (`avc: {format: 'avc'}`):

```js
console.table((await CurvatureModernAnimationVideoCapabilities.probe({
  width: 960, height: 540, fps: 25
})).codecs)
```

For a Compare A/B export with 960×540 **per view**, probe 1920×1080, not
960×540; the encoding worker independently checks the selected output size.
The probe also reports `containerMuxerInstalled` (WebM) and
`mp4MuxerInstalled`; a successful capability probe is not a substitute for an
actual export and playback test.

## Clock and physical fidelity

Every frame is calculated from an independent, validated project using
**Accurate RK4**, without Fast fallback or real-time screen recording. Opaque
white compositing, expected dimensions, and scalar-only diagnostic transfer
are shared with the deterministic PNG code. Rendered VideoFrames are
transferred directly, not encoded as PNG and decoded again.

The PNG sequence includes both endpoints: a five-second, 25-FPS animation has
126 PNG files. Video has **125 presentation intervals**. The last interval is
painted from the exact physical endpoint (5000 ms) but presented at 4960 ms for
40 ms, yielding exactly 5.000 seconds. For 30 FPS, interval boundaries are
independently rounded to integer microseconds. The endpoint-display policy is
intentional and is independent of the encoder format.

Both VP9 and H.264 are lossy: decoded video need not match PNG pixels exactly.
The source physics and Canvas pixels must not depend on Worker count. Keyframes
are requested at least every two seconds for seeking.

## Modules and resource limits

- `ModernAnimationFrameWorker.js`: isolated Accurate RK4 renderer, unchanged
  PNG protocol and transferable video frame bundles.
- `ModernAnimationVideoPipeline.js`: deterministic interval plan, opaque
  VideoFrame creation and bounded ordered gate, closing frames after enqueue.
- `ModernAnimationBackgroundVideoExport.js`: format-aware main-thread
  coordinator; one outstanding frame per renderer, plus a shared credit budget
  of **up to 32 MiB nominal uncompressed RGBA** (at most 8 bundles).
  A single combined Compare VideoFrame occupies four times the RGBA area
  of one view. Large-resolution exports are
  automatically throttled rather than consuming the same number of massive
  RGBA frames as a small Scene. The bound covers transferred/in-flight frames,
  not independently owned renderer canvases or WebCodecs internal surfaces.
  All Workers are terminated together on error or cancellation.
- `ModernAnimationVideoEncoderWorker.js`: separate Worker with format-specific
  WebCodecs configuration, up to three queued frames per encoder, one
  encoder for side-by-side Compare (two for optional separate layout),
  ordered frame gate with the same bounded credit window, flush, per-stage
  telemetry, and an early 192 MiB **combined** compressed-output check.
  A slow encoder cannot create an unbounded backlog of transferred RGBA frames.
- `ModernAnimationWebMMuxer.js`: VP9 WebM with finite segment duration,
  clusters and seek Cues.
- `ModernAnimationMP4Muxer.js`: H.264 MP4 without third-party dependencies.
  Requests AVC-format, length-prefixed NAL samples plus the avcC SPS/PPS
  description; produces `ftyp`, fast-start `moov`, `mdat`, and video sample
  tables (`stts`, `stsz`, `stsc`, `stco`, `stss`). Uses a 1 MHz media timescale
  and 64-bit movie/media durations. Constrained Baseline output is expected:
  reordered B-frame timestamps are rejected rather than inventing DTS.
- `ModernAnimationVideoArchive.js`: streaming CRC32 for the optional separate
  Compare layout; the ZIP is formed from immutable media `Blob` parts without
  reading complete video files into second full-size `ArrayBuffer` copies. It uses stored ZIP32
  and enforces 192 MiB including headers. The existing PNG ZIP path is not changed.
- `ModernAnimationVideoProbeWorker.js`: worker-local checks for VP9 and H.264
  plus both muxer implementations.

No full-sequence uncompressed RGBA buffer is retained. Encoded chunks are
accumulated until final muxing, capped at **192 MiB total compressed output**.
The optional separate Compare ZIP also has a strict final archive size cap.
ZIP CRC is calculated a block at a time, but the finished ZIP remains a Blob
in memory. This is bounded in-memory pipeline streaming, **not disk streaming**
or fragmented/streamable MP4/WebM. Video export can still fail on the memory
limits and requires sufficient additional browser memory for encoder internals.

The persisted result manifest includes `frameWindow`, `peakBufferedFrames`
(encoder reorder gate), `peakEncoderQueue`, and `encodedBytes`, plus the prior
`elapsedMs`, `renderWorkers`, bitrate and format. The controller separately
reports its observed `peakInflightFrames` to the UI after completion; this
controller-only statistic is not embedded in standalone media files.
These are measured counters/high-water marks, not a claim of total process RSS.
Single-file Compare uses one codec queue of at most three frames; the internal
separate-layout branch retains one per view.

At 1280×720 per view, a Scene RGBA frame is ~3.5 MiB, while a
side-by-side 2560×1440 Compare output frame is ~14.1 MiB. With four render
workers, the nominal 32 MiB dispatch budget permits eight Scene frames
but only **two** combined Compare frames (before independent renderer/codec
allocations). The credit count also respects available workers.
Timing and memory are workload-dependent; production speedups must be verified
in Opera, not inferred from test doubles.

## Validation and Opera acceptance

Run targeted and full regression tests, and the isolation audit:

```bash
node --test tests/ModernAnimationMP4Muxer.test.js \
  tests/ModernAnimationVideoEncoderWorker.test.js \
  tests/ModernAnimationBackgroundVideoExport.test.js \
  tests/ModernAnimationVideoArchive.test.js \
  tests/ModernAnimationVideoCapabilities.test.js \
  tests/ModernAnimationWebMMuxer.test.js
node --test tests/*.test.js
node tools/audit-legacy-isolation.js --check
```

The streaming/optimization tests additionally check adaptive frame credits,
slow encoder drains, stream-based CRC without `.arrayBuffer()` of media files,
ZIP headers and CRC (for the separate-layout branch), immediate Cancel,
and telemetry. Browser acceptance should decode and play a **single**
Compare WebM/MP4 and check both synchronized halves and their labels. The MP4 unit tests check box layout,
keyframes, H.264 configuration, corrupted
NAL data, timing, single-file Compare, optional separate ZIP, cancellation
and worker contracts. An optional
integration test uses FFmpeg to generate real Constrained Baseline H.264,
remuxes its AVC samples with our muxer, and verifies FFprobe identification,
full decoding and seek playback. WebM tests and prior real Opera acceptance
remain intact. The build environment has not executed a full WebCodecs MP4
encode in Opera; the user confirmed the previous release works in Opera.

**Streaming-stage Opera acceptance:** repeat Globe → Flat at 960×540,
25/30 FPS in both WebM and MP4; use 1/2/4 render workers and compare elapsed
time and the manifest's peak counters. Test 1280×720 Compare A/B (fewer frame
credits, one playable 2560×1440 video with synchronized A/B) and Cancel
during both rendering and encoding. Check `unresolved` and the final Flat image
against your PNG baseline. If a codec is unsupported or errors, capture the
visible status and Opera F12 console.

Future directions: optional true disk streaming/fragmented containers for
exports exceeding the 192 MiB cap, and measured visual-error comparisons
against PNG. Neither is claimed by this patch.

Reference: [W3C AVC WebCodecs registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/),
[WebCodecs usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API).

## Pipeline profiling and interpretation

After a completed WebM or MP4 export, Animation Studio displays a **Video
pipeline profile** beneath the export status. **Download profiling JSON**
exports the entire video manifest (including `profiling`) plus a
main-thread controller report for reproducible comparisons. The button is
disabled until a successful export; a new export clears the previous profile.
Both Scene and Compare A/B use the same counters; PNG export is unchanged.

`manifest.profiling` (schema `curvature-video-profile-v1`, units **ms**) records:

| Field | What it measures |
| --- | --- |
| `render` | Sum/mean/max of per-view *wall* time spent in RK4 painting and opaque compositing, plus VideoFrame construction for Scene/separate mode. Combined Compare VideoFrame construction is measured under `compareComposition`. Samples = rendered frames × views. |
| `reportedOptics` | The **existing** optics engine's `timings.opticsMs` diagnostic when reported. This is a subset of rendering, not an additional phase. Missing timings are excluded from the sample count, not converted to zero. |
| `encoderHandoffWait` | Delay inside the encoder worker from receiving a transferred frame bundle to submitting it to WebCodecs in presentation order. Includes out-of-order buffering and encoder backpressure. |
| `outOfOrderArrivals` | Bundles that arrived before the next required presentation index was available. |
| `codecOutputLatency` | Wall latency from `VideoEncoder.encode()` submission to its encoded-chunk output callback (includes its asynchronous queue); this is **not** isolated codec CPU time. Combined Compare records one sample per video interval. |
| `compareComposition` | Sum/mean/max of per-frame wall time for A/B Canvas composition and combined VideoFrame construction in renderer Workers. Samples = number of composed frames; overlaps summed worker time, but is separate from RK4. |
| `codecActiveWallMs` | Elapsed from the first encoding submission to the last encoded-chunk callback. Overlaps worker rendering. |
| `finalize.flushMs` | Elapsed waiting for asynchronous `VideoEncoder.flush()` after all frames were submitted. |
| `finalize.muxMs` | Container finalization (`WebM` or `MP4`), excluding the encoder flush. |
| `finalize.zipMs` | Optional separate-layout Compare ZIP packing including streaming CRC; zero for single-file Scene and Compare videos. |
| `encoderWorkerElapsedMs` | Encoder worker lifetime after session setup, including overlapped frame processing and finalization. |
| `controller.dispatchToDelivery` | In the downloaded JSON's controller section: mean/max from render request dispatch to receipt of the frame bundle on the main thread. **Includes** painting and transfer, not just postMessage latency. |
| `controller.elapsedMs` | Total controller wall time including Worker initialization and final artifact delivery. |

**Do not add these times together.** Rendering overlaps between Workers and
with encoding. In particular the summed render and optics metrics are not
process CPU times; the optics metric is nested inside render, and chunk
latencies overlap. This profile can locate bottlenecks (slow render, queue
contention, expensive codec output, flush or ZIP) but does not establish actual
CPU utilization or browser memory RSS. Memory high-water counters remain
nominal outstanding RGBA frames, not measured heap usage.

For the optional separate-layout Compare mode, `manifest.json` inside the ZIP is
constructed **before** ZIP creation, so `profiling.finalize.zipMs` is `null` there. The complete measured
ZIP duration is available in the UI and downloadable profiling JSON returned
after packaging. Standalone WebM/MP4 files have no embedded JSON manifest;
use **Download profiling JSON** to preserve those results.

Suggested acceptance comparison: export one unchanged Globe → Flat project
at 960×540, 25 FPS and Standard bitrate for **WebM and MP4**, each with
**1, 2, and 4 Workers**. Keep Opera foreground state, hardware load and
resolution as consistent as possible; ideally repeat each run to gauge JIT
warmup and noise. Compare `controller.elapsedMs`, `render.totalMs`,
`reportedOptics.totalMs`, `codecOutputLatency`, `encoderHandoffWait`,
`flushMs`, `muxMs` and (for Compare) `zipMs`. Do not infer phase shares by
subtracting overlapping durations. The 22.5/22.3-second runs before this patch
show only total times; **they cannot be retroactively phase-profiled**.

## Optional camera HUD in Playback and exported video

Playback displays per-view camera telemetry over its own Canvas; its **Camera
HUD** checkbox hides/shows it immediately without repainting Accurate RK4.
This is a DOM overlay, so it does not contaminate the underlying physical
pixels or pixel-parity diagnostics. The existing Scene/Compare toggle is
independent.

**Include camera HUD in video** is a distinct video export checkbox, **off by
default**. Once enabled, the isolated render worker burns the shared camera
telemetry into each RGBA Canvas **after** opaque white compositing and
**before** constructing `VideoFrame`. This applies identically to VP9/WebM
and H.264/MP4; in combined Compare these are drawn on each view **before**
the views are composed. The option
travels with the exported project when workers initialize; the encoder does
not draw or resample camera state. The downloadable video profiling JSON
records `cameraHudIncluded: true` when enabled.
With HUD off, the established VideoFrame source, codec timing and encoded
pixels are untouched by the HUD painter. Video compression remains lossy.

The labels use physical camera geometry and do not imply optical visibility
of towers. Opera acceptance: export the same camera-motion project with the
checkbox on in WebM and MP4, inspect the first/middle/final frames and A/B
geometries, then repeat with it off and verify the pristine frame. Repeat a
short PNG export using 1/2/4 workers to check HUD image pixel parity. Such
browser-level acceptance is separate from Node test mocks.


## Compare A/B single-video export

`ModernAnimationCompareComposition.js` is the deterministic **Canvas compositor**
used by the active single-file Compare video pipeline. Each Worker first
renders A/B independently using Accurate RK4 and opaque backgrounds. It then
composes the painted views and constructs **one** transferable VideoFrame per
timestamp. The encoder receives a single ordered stream and muxes one WebM/MP4
with the combined width and height. Output bitrate, buffer credits, H.264 level
selection and export validation use these output dimensions.

The compositor receives two **already painted, opaque Accurate RK4** view
images, each with the corresponding `cameraModel` (including `showModel`).
If camera telemetry is enabled, it must already have been painted on each
source Canvas by the existing shared HUD renderer. The compositor never
mutates either source Canvas and performs no physics or additional ray tracing.

```js
const layout = CurvatureModernAnimationCompareComposition.layout(960, 540);
// layout.width === 1920; layout.height === 1080
const destination = new OffscreenCanvas(layout.width, layout.height);
CurvatureModernAnimationCompareComposition.paint(destination, {
  A: {quality: 'accurate', canvas: opaqueCanvasA, cameraModel: modelA},
  B: {quality: 'accurate', canvas: opaqueCanvasB, cameraModel: modelB}
}, {timeMs: 7200, durationMs: 10000, animationMode: 'camera'});
```

The composite has **twice the view width and twice the view height**, hence
the same aspect ratio as each view. For standard 16:9 views, 960 × 540 becomes
1920 × 1080. Each optical viewport stays at its original 960 × 540 resolution,
placed side by side and vertically centered; the extra top/bottom letterbox
space contains the title, physical-geometry-specific A/B labels and a
presentation-time caption. There is **no stretching, cropping, resampling or
HUD relocation**. Because composition occurs after the full optical render,
there is no need to reinterpret the Globe/Flat reference frames.

Output dimensions and source frames are validated before painting. Invalid
sizes, incomplete A/B pairs, mismatched dimensions, unexpected Fast frames,
missing geometry or invalid presentation times are rejected. The Canvas 2D
state is restored even after a paint error. Timestamp captions are derived
from the deterministic video timeline, never wall-clock time.

A combined RGBA frame at 1920 × 1080 occupies about 7.9 MiB, in addition
to the two original 960 × 540 canvases (~4.0 MiB total). A 1280 × 720 pair
produces a 2560 × 1440 combined frame (~14.1 MiB). The 32 MiB frame-credit
limit applies to transferable combined VideoFrames; the two input canvases and
the compositor's retained Canvas are separate allocations. If a combined frame
alone would exceed that limit, export fails before allocating workers. The
encoder checks `VideoEncoder.isConfigSupported()` for the **combined dimensions**,
with an appropriate H.264 level; browser support for the smaller views alone
is not sufficient.

Tests: `node --test tests/ModernAnimationCompareComposition.test.js \
 tests/ModernAnimationVideoPipeline.test.js \
 tests/ModernAnimationVideoEncoderWorker.test.js` exercises 1:1 composition,
per-frame synchronization, worker transfer count, final output dimensions,
codec configuration, ordered backpressure, optional legacy separate ZIP and
clean error handling. Opera playback and decode tests remain necessary to
confirm production WebCodecs support for 1920×1080 and 2560×1440.
