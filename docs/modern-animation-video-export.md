# Deterministic video export — VP9 WebM

Status: **VP9 WebM implemented**, subject to a real Opera acceptance test.
The PNG ZIP export, Scene, Compare, and interactive Animation Playback remain
independent. MP4/H.264 is not implemented yet.

## User workflow

In `CurvatureModern.html`, open Animation Studio and prepare an animation with at
least two compatible keyframes. In the independent playback stage expand
**Export WebM video · deterministic (offline)**. Select FPS (5/10/25/30), fixed
resolution (640×360, 960×540, 1280×720), render Worker count (Auto, 1, 2, 4),
and VP9 bitrate (Standard, High). Click **Render WebM**. The progress bar counts
video frames submitted to the encoder; after the last frame, the status changes
to VP9 flush and WebM muxing. **Cancel export** terminates render and encoder
workers immediately and prevents a partial download. A valid current draft can
be exported without first preparing live Playback.

Scene exports one `curvature-animation.webm` without audio. Compare A/B renders
both models on identical timestamps and downloads one
`curvature-animation-webm-compare.zip` containing `curvature-animation-A.webm`,
`curvature-animation-B.webm`, and `manifest.json`. This avoids browsers blocking
a second simultaneous download. ZIP is assembled in the encoder Worker.

The browser must support WebCodecs `VideoEncoder` with VP9, `VideoFrame` and
`OffscreenCanvas` inside dedicated Workers. A codec advertised by
`VideoEncoder.isConfigSupported()` still needs an actual encode test. In Opera,
probe with:

```js
await CurvatureModernAnimationVideoCapabilities.probe({
  width: 960, height: 540, fps: 25
})
```

`containerMuxerInstalled` reports whether the WebM muxer is available in the
probe worker. It does not mean MP4 is implemented, even if H.264 is supported.

## Clock and physics policy

Every frame is calculated from a self-contained project using **Accurate RK4**
in independent workers. No Fast fallback or real-time screen recording is used.
The same opaque white compositing and exact-size Canvas validation as the PNG
pipeline run before making `VideoFrame` objects. Raw optical diagnostic cache
objects are never posted across Worker boundaries.

The PNG sequence keeps both endpoints: 5 seconds at 25 FPS means 126 PNGs.
For video, there are 125 **presentation intervals**, each with a timestamp and
duration. The last interval is painted from the exact final physical state
(5000 ms) but has presentation timestamp 4960 ms and duration 40 ms. This
explicit policy yields a 5.000-second video, with a visible final Flat state,
without adding an extra frame. For 30 FPS, boundaries are independently rounded
to integer microseconds. This intentionally prioritizes displaying the final
state over sampling the last interval at its presentation time.

VP9 uses lossy compression: decoded video pixels are not expected to match
lossless PNG pixel-for-pixel, but changing Worker count must not change the
source Canvas or physical sampling. The encoder inserts a keyframe at least
every two seconds, allowing normal seeking.

## Module design and memory bounds

- `ModernAnimationFrameWorker.js`: supports existing PNG `init/render` and new
  `video-init/video-render` without mixing the protocols. Reuses one Accurate
  RK4 painter per isolated Worker. Posts transferable VideoFrame bundles.
- `ModernAnimationVideoPipeline.js`: validates the video-specific frame plan,
  creates opaque VideoFrames and exposes a bounded ordered gate. The gate can
  pause when WebCodecs queue is full, and resume on `dequeue`. It closes all
  VideoFrames after enqueue or cancellation.
- `ModernAnimationBackgroundVideoExport.js`: UI-thread scheduling only, with a
  maximum of two outstanding timestamp slots per renderer and eight in total.
  The scheduling window advances only after contiguous frames are accepted by
  the encoder. All workers are terminated together on failure or Cancel.
- `ModernAnimationVideoEncoderWorker.js`: checks requested worker-local VP9
  configuration, owns separate VideoEncoders for A/B, bounds each encode queue
  to three VideoFrames, flushes on completion, and muxes the compressed data.
- `ModernAnimationWebMMuxer.js`: writes seekable WebM EBML metadata (finite
  Segment length, duration, VP9 track, clusters, SimpleBlocks, seek Cues) with
  no third-party dependencies. Timestamp scale is 1 ms; source timestamps are
  in microseconds and rounded only for WebM block timecodes.

No uncompressed full-sequence frame buffer is created. The compressed VP9
chunks accumulate in the encoder Worker until final muxing, with a hard
**192 MiB per-stream** limit. Compare ZIP uses the existing in-memory ZIP32
writer and its **192 MiB total** limit. These are intentional safety limits,
not disk streaming. If a long video exceeds the limit, export fails explicitly.

## Validation / known limitations

Run `node --test tests/ModernAnimationVideo*.test.js
 tests/ModernAnimationBackgroundVideoExport.test.js` plus full
`node --test tests/*.test.js` regression. The isolated encoder Worker is run
in a Node VM with fake asynchronous WebCodecs; its protocol verifies frame
ordering, A/B synchronization, frame close, flush, failure, and ZIP assembly.
The WebM muxer was also tested with real VP9 elementary data; `ffprobe`
identified the video, exact duration and dimensions, and `ffmpeg` decoded
and sought successfully. **An actual Opera/WebCodecs encode and playback of
Curvature physical frames is still an acceptance test**. The available
Chromium environment blocked navigation by administrator policy; browser
capture was not claimed as a successful integration test.

First Opera acceptance test: Scene Globe → Flat, 640×360, 5 FPS, two Workers.
The expected five-second video has **25** frames and a visible final Flat.
Then compare to 25-FPS, 960×540 PNG export (video has 125 intervals; PNG
has 126 sampled endpoints), inspect quality and seekability. Test Cancel while
RK4 is running, while encoding is draining, and during final muxing. Test
Compare A/B and verify both downloaded WebM files can be opened.

Next stage: profile and improve long-run backpressure, measure encode/mux
latency and output sizes at both bitrate levels, compare decoded frame quality
against PNGs, and implement a bounded disk-streaming strategy if required.
MP4/H.264 remains a separate feature after the VP9 path is validated.

Reference: [WebCodecs usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API),
[Chrome Worker guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs).
