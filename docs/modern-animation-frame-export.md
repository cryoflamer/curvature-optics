# Deterministic animation PNG sequence export

This is the first offline frame-export stage. The UI lives under **Animation →
Animation playback → Export PNG frames**, not in Scene, Compare or History.
The selected prepared project is copied and validated when **Render PNG ZIP**
starts. Later editor changes do not affect the running job.

## Contract

- An owned, self-contained `ModernAnimationProject` is sampled at indexed
  timestamps via `sampleAt()`; frame timing never comes from `requestAnimationFrame`
  or from the speed of the physical renderer.
- The sampling grid includes **both endpoints**. For a five-second animation at
  25 FPS this is 126 images at `0, 40, ..., 4960, 5000` milliseconds, not a
  125-frame real-time recording. For non-integral frame counts the final interval
  may be shorter than `1000/fps`; `manifest.json` lists exact timestamps in
  microseconds. A video encoder can later choose its own endpoint presentation.
- **Accurate RK4 only**, Canvas 2D, no Fast approximation or fallback. An error
  stops the job and no partial ZIP is downloaded. Every sample is rerendered,
  including repeated hold frames.
- A detached HTML Canvas with explicitly fixed backing dimensions is used per
  Scene/Compare side. The GraphX3DX camera/window data are cloned from the
  isolated Animation preview, not from the live Scene/Compare viewport. Export
  runs in a separate `ModernAnimationPreview` instance with separate optical
  sessions. Width and height are invariant; the DPR of the browser window does
  not silently change the export size.
- For Compare A/B, `frame_N_A.png` and `frame_N_B.png` are rendered at the same
  sampled time. Frames are **not** composited side by side. `manifest.json`
  specifies each file, its timestamp and available optical health metrics.
- The ZIP uses the uncompressed ZIP32 **store** method, allowing standard ZIP
  readers to open it without adding a third-party script. PNG data are already
  compressed. The ZIP includes `manifest.json` with full self-contained project state, mode,
  target, FPS, dimensions, duration and per-frame paths.
- **Cancel export** is checked between synchronous optical calculations and
  after encoding. The UI yields to the event loop between frames to let Cancel
  be processed. A frame already inside synchronous RK4 cannot be interrupted.
  Cancel never offers a partial archive.

## Limits and performance

This initial exporter intentionally assembles the archive in memory. It rejects
more than 751 timestamps or more than 192 MiB of PNG data. Choose 5/10/25/30
FPS and a preset of 640×360, 960×540 or 1280×720. Lower FPS or shorten the
project when the frame limit is exceeded. There is no streaming archive, MP4,
WebM, background worker, wall-clock deadline, or promised real-time export rate.
Accurate frames can take seconds to compute on large scenes, and synchronous
computation can temporarily block the UI.

The current renderer retains existing limitations, including mutual-object
occlusion and possible unresolved optics. The fact that an Accurate frame was
rendered is not by itself proof of pixel parity with a separately sized Scene
viewport. Use the Performance & pixel parity diagnostic at matching sizes for
that separate question.

## Tests and remaining acceptance

Run `node --test tests/ModernAnimationFrameExport.test.js`. Tests check exact
sample times and terminal Flat, Compare synchronization, cancellation,
rejection of Fast/wrong-size/failed PNGs, ZIP records, browser global-module
loading, and cloning of mutable GraphX3DX viewport state. General Modern
regression and Legacy-isolation tests should also pass.

**Opera verification remains required:** render a known Globe → Flat project,
open `curvature-animation-frames.zip`, examine `manifest.json`, confirm that
all PNGs have the same dimensions, and compare the initial/middle/final PNGs
with the corresponding Accurate playback states. In Compare, inspect both A/B
images at the same time. Check that the working Scene, History, current playback
position and draft remain unchanged; try cancellation on a long project.
