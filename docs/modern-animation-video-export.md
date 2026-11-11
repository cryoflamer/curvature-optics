# Deterministic video export — VP9 WebM / H.264 MP4

Status: **WebM and MP4 implemented**. The initial VP9 WebM flow was verified
with a real Opera export. MP4/H.264 must still be acceptance-tested in Opera.
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

Click **Render video**. The progress bar counts intervals handed to WebCodecs;
finalization and container muxing have a separate status. **Cancel export**
terminates all render and encoder Workers immediately, preventing partial
video downloads.

For Scene, one silent `curvature-animation.webm` or
`curvature-animation.mp4` is downloaded. Compare A/B uses synchronized
sampling and creates one ZIP with `curvature-animation-A.<format>`,
`curvature-animation-B.<format>`, and `manifest.json`. This avoids browsers
blocking the second simultaneous download.

The browser must support `VideoEncoder`, `VideoFrame`, `OffscreenCanvas` and the
selected codec within dedicated Workers. WebCodecs does **not** produce a
container on its own. The probe includes the actual AVC sample format required
by the MP4 muxer (`avc: {format: 'avc'}`):

```js
console.table((await CurvatureModernAnimationVideoCapabilities.probe({
  width: 960, height: 540, fps: 25
})).codecs)
```

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
  coordinator; at most two outstanding slots per renderer and eight total.
  All Workers are terminated together on error or cancellation.
- `ModernAnimationVideoEncoderWorker.js`: separate Worker with format-specific
  WebCodecs configuration, up to three queued frames per encoder, A/B encoders,
  flush, format-specific muxer and one download payload.
- `ModernAnimationWebMMuxer.js`: VP9 WebM with finite segment duration,
  clusters and seek Cues.
- `ModernAnimationMP4Muxer.js`: H.264 MP4 without third-party dependencies.
  Requests AVC-format, length-prefixed NAL samples plus the avcC SPS/PPS
  description; produces `ftyp`, fast-start `moov`, `mdat`, and video sample
  tables (`stts`, `stsz`, `stsc`, `stco`, `stss`). Uses a 1 MHz media timescale
  and 64-bit movie/media durations. Constrained Baseline output is expected:
  reordered B-frame timestamps are rejected rather than inventing DTS.
- `ModernAnimationVideoProbeWorker.js`: worker-local checks for VP9 and H.264
  plus both muxer implementations.

No full-sequence uncompressed RGBA buffer is retained. Encoded chunks are
accumulated until final muxing, capped at **192 MiB per stream**; Compare ZIP
also has a **192 MiB total** cap. This is bounded in-memory muxing, **not** disk
streaming. Large exports exceeding either limit fail explicitly.

## Validation and Opera acceptance

Run targeted and full regression tests, and the isolation audit:

```bash
node --test tests/ModernAnimationMP4Muxer.test.js \
  tests/ModernAnimationVideoEncoderWorker.test.js \
  tests/ModernAnimationBackgroundVideoExport.test.js \
  tests/ModernAnimationVideoCapabilities.test.js \
  tests/ModernAnimationWebMMuxer.test.js
node --test tests/*.test.js
node tools/audit-legacy-isolation.js --check
```

The MP4 unit tests check box layout, keyframes, H.264 configuration, corrupted
NAL data, timing, Compare ZIP, cancellation and worker contracts. An optional
integration test uses FFmpeg to generate real Constrained Baseline H.264,
remuxes its AVC samples with our muxer, and verifies FFprobe identification,
full decoding and seek playback. WebM tests and prior real Opera acceptance
remain intact. The build environment has not executed a full WebCodecs MP4
encode in Opera.

**First MP4 acceptance:** use Scene Globe → Flat at 640×360, 5 FPS, 2 workers.
Expect `curvature-animation.mp4`: 25 frames, 5.000 seconds, a final Flat image,
and playable seek. Repeat at 960×540, 25/30 FPS, then Compare A/B and Cancel.
Also verify an unchanged WebM export from the same project. If MP4 encoding
fails, capture the visible status and Opera F12 console; codec support may
vary by machine or encoder implementation.

Next stage: profile encoder throughput/latency and bounded frame backpressure,
measure visual errors against deterministic PNG, and evaluate disk streaming
if the 192 MiB limit becomes restrictive.

Reference: [W3C AVC WebCodecs registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/),
[WebCodecs usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API).
