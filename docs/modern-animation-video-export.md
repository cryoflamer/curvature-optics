# Deterministic video export — pipeline foundation

Status: **foundation only**. This change does **not** add a Render Video button,
`VideoEncoder` run, WebM/MP4 muxer, or downloadable video. The proven PNG export
remains the only user-facing offline export.

## Why a separate timeline?

The PNG sequence is a set of stills and includes both endpoints. A 5-second
animation at 25 FPS produces 126 PNG images at 0, 40, ..., 5000 ms. Playing
126 images with 40-ms display intervals would instead produce a 5.04-second
video. The video timeline has **125 presentation intervals** of 40 ms: 0–40,
40–80, ..., 4960–5000 ms. To ensure the endpoint is visibly represented, the
last interval is painted from the exact **5000-ms physical state**, but retains
its 4960-ms presentation timestamp. This is an explicit video presentation
policy: the physical sample for the final interval is up to one nominal frame
later than its display timestamp. It avoids either adding time or omitting the
final Flat state. For a very short, one-frame video, only one physical sample
can be displayed (the initial sample); a video cannot display two distinct
states in a single frame. The PNG timeline, frame names and manifests do not
change. For 30 FPS, microsecond presentation boundaries are rounded from
`index * 1_000_000 / fps` separately, preventing accumulated drift. The last
frame's duration is truncated to match the exact requested animation length.

## New modules

- `ModernAnimationVideoPipeline.js`: validates the same fixed-resolution/FPS
  presets as PNG, but maintains an **independent** timestamped video plan and
  frame-count guard; samples `ModernAnimationProject` at each scheduled
  timestamp, renders an Accurate RK4 optical frame using the existing painter,
  invokes the same `ModernAnimationFrameExport.prepareCanvas()` validator and
  white `destination-over` compositor as PNG, and constructs an uncompressed
  transferable `VideoFrame` directly from that Canvas. It never invokes
  `convertToBlob`, `toBlob`, PNG decoding or a screen-recording clock.
- `ModernAnimationVideoCapabilities.js`: prepares VP9 and H.264 candidate
  configurations and asks `VideoEncoder.isConfigSupported()` **inside a
  dedicated Worker**, separately for each. It also checks `OffscreenCanvas`
  2D and `VideoFrame` there. A codec advertised by a browser is not guaranteed
  to work for a given resolution, profile or machine. Codec support alone does
  not mean a WebM/MP4 muxer is present. The diagnostic explicitly reports
  `containerMuxerInstalled: false`.
- `ModernAnimationVideoProbeWorker.js`: worker-only entry point for the
  diagnostic; does not render or encode. Loaded on demand, not at page start.
- `ModernAnimationFrameExport.js`: exposes its existing sizing policy and
  reusable Accurate-RK4/opaque-Canvas guard for **both** export paths. PNG
  rendering and encoding still follow the previous implementation.

The browser page loads both foundation APIs but **does not wire any new user
controls**. The existing parallel PNG frame workers and ZIP worker are
unchanged. The next stage will attach the video protocol to the actual
render worker and add a dedicated encoder/muxer worker.

## Ordered handoff, lifetime and memory

VideoFrame objects are large and **transferable**, not serializable PNG
strings. Multiple renderer workers can finish timestamps in any order. The
`orderedGate(plan, {capacity, consume})` accepts completed per-timestamp
bundles, including synchronized Compare A/B sides, holds at most `capacity`
out-of-order bundles (default 8, maximum 16), validates frame identities and
microsecond timestamps, and synchronously calls `consume()` in timestamp
order. It calls `VideoFrame.close()` on every consumed, cancelled or abandoned
buffered frame. `consume` must enqueue the frame **synchronously** and must
never retain it; a future encoder owns its **own internal queue** and must use
`encodeQueueSize`/`dequeue` to exert backpressure. The scheduling coordinator
must leave room for the earliest still-in-flight timestamp, which is always
accepted by the gate even if later frames fill it. `available() === 0` means
stop dispatching additional out-of-order work; it does not prohibit delivering
the missing head. An offered frame rejected due to capacity/validation remains
owned by its caller, which must close or retry it. A gate is a planning
primitive, not yet a streaming encoder implementation.

To avoid uncontrolled buffering in the next stage, schedule bounded outstanding
frames, send transferable VideoFrame instances directly between workers, close
all frames on errors/Cancel, and limit both the reorder queue **and** WebCodecs
`encodeQueueSize`. Avoid allocating a full animation of RGBA images in memory.
A 1280×720 RGBA frame uses about 3.5 MiB before overhead.

## Opera diagnostic before implementing the encoder

With `CurvatureModern.html` open in Opera and developer tools Console visible:

```js
await CurvatureModernAnimationVideoCapabilities.probe({
  width: 960, height: 540, fps: 25
})
```

The promise returns a report with per-codec `supported` flags and reasons,
`videoEncoder`, `videoFrame`, and `offscreenCanvas2d`. A VP9-supported result
is **only a prerequisite** for WebM export; it does not yet make the app
capable of creating a video. If both codecs are unsupported, an explicit
message and/or alternative encoder policy will be needed before UI activation.
The capability probe is not an actual encode test. `file://` Worker restrictions
or other browser security settings can prevent the probe from loading; serve
the project through the normal local HTTP server.

## Validation and remaining work

`node --test tests/ModernAnimationVideoPipeline.test.js tests/ModernAnimationVideoCapabilities.test.js`
checks endpoint policy, exact 25/30-FPS time intervals, Compare A/B side
identity, shared RK4 validation and opaque compositing, direct VideoFrame
construction without PNG, failure/cancellation frame disposal, bounded
out-of-order delivery, and a real VM-loaded dedicated probe script. The
production PNG test suite and legacy boundary audit must still pass.

**Not yet implemented or verified:** a browser-executed `VideoFrame` made from
a physical Accurate RK4 `OffscreenCanvas`; codec/bitrate negotiation on the
actual Opera machine; `VideoEncoder` event and queue backpressure; WebM/MP4
container writing; timestamps inside the muxed file; actual downloaded video;
background encoding, end-to-end Cancel, and visual quality comparisons.
Pixel-identical input canvases should be preserved, but compressed VP9/H.264
frames are generally **not** pixel-identical to the lossless PNGs.

## Next patches

1. Add a bounded video render/encoder protocol and an actual background WebM
   VP9 encoder with container muxing, worker lifecycle, progress and Cancel.
   Keep PNG path unchanged and preserve Scene and Compare A/B semantics.
2. Test actual encoding and muxing in Opera, external playback and timestamps,
   bitrate/quality tradeoffs and decoded-frame fidelity to PNG.
3. Add MP4/H.264 only when its worker-side codec capability and muxer have
   been validated, with explicit graceful handling of unsupported platforms.

References: [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API),
[MDN VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame),
[Chrome WebCodecs guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).
