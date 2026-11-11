# Deterministic animation PNG sequence export

The PNG exporter lives under **Animation → Animation playback → Export PNG
frames**. It is a **background Web Worker** pipeline, separate from live
Playback, Scene/Compare and History. A compatible Studio draft can be exported
without clicking **Prepare project**; if a project has already been prepared,
that validated project is used. The input is snapshotted at Start.

## Contract

- `ModernAnimationProject.sampleAt()` is evaluated at exact indexed timestamps;
  wall-clock playback never controls the frames. A five-second project at 25 FPS
  exports 126 timestamps (0, 40, ..., 5000 ms), including the exact endpoint.
  The last interval can be shorter than `1000/fps` for other durations.
- **Accurate RK4 only**: the same production `CurvatureMainCanvasRenderer`,
  `CurvaturePhysicalSceneOptics`, and `ModernAnimationPreview` as live playback.
  The exporter refuses Fast/mixed or incorrectly sized output.
- One isolated `OffscreenCanvas` and independent optical session per side of
  Scene/Compare, at the chosen fixed resolution. The worker imports the
  production GraphX3DX math but **does not run its DOM canvas constructor**.
  Instead it initializes a private camera/window transform on the GraphX3DX
  prototype and lets the independent physical painter own the Canvas pixels.
  The legacy `SetClipping` operation is not used: the independent physical
  frame renderer clips its projected primitives itself.
- For Compare, `frame_N_A.png` and `frame_N_B.png` use identical timestamps;
  `manifest.json` records each file and available optical statistics. It
  includes the self-contained physical project and exact microsecond times.
- The uncompressed ZIP32 store writer is bounded (max **751 timestamps** and
  **192 MiB PNG data**). Presets: 5/10/25/30 FPS at 640×360, 960×540 or
  1280×720. There is no MP4/WebM encoding or streaming archive yet.

## Background work, progress and cancellation

The main UI only starts the worker, receives `ready`, `progress` and `complete`
messages, updates the percentage, elapsed time and estimated time remaining,
and downloads the finished ZIP. Progress counts fully encoded timestamps,
**not intermediate RK4 iterations**; estimated time is rough because different
physical states can take different amounts of time. The status is visible
before the first heavy computation starts, while the main UI remains usable.

**Cancel export** immediately calls `Worker.terminate()`, including when a
synchronous optical calculation is still executing. Pending results are
ignored and **no partial ZIP** is offered. If Workers or OffscreenCanvas are
unavailable, the UI reports an error; it never silently falls back to blocking
synchronous rendering. The worker does not read or mutate live Scene/Compare,
History, Animation playback or the Studio draft. Only **one** worker is used;
a future worker pool could parallelize independent frames after validating
memory use and pixel parity.

## Validation

- `node --test tests/ModernAnimationFrameExport.test.js tests/ModernAnimationBackgroundExport.test.js`
  checks exact frame counts/format, OffscreenCanvas encoding, background message
  protocol, immediate terminate, failure handling, import of actual production
  dependencies without `document`, and a headless GraphX3DX camera bootstrap.
- Local supplemental smoke: production Accurate RK4 plus Canvas PNG encoding
  were run in a Worker-like VM with a Canvas 2D implementation. A scene
  completed all six timestamps at 5 FPS and its first frame had zero RGBA
  channel differences compared with the previous `graphForCanvas` adapter
  at matching dimensions. This is **not** a real Opera/Chromium acceptance test.
- The Legacy/Modern dependency audit and the project regression suite must
  pass before shipping the patch.

**Opera acceptance remains mandatory.** Export a small Globe → Flat project
at 640×360/5 FPS. Confirm the worker status appears before the first frame,
check `manifest.json`, PNG dimensions and final Flat, and compare frames with
Accurate playback at matching resolution. Try Cancel during a long Accurate
frame: the page must remain responsive and the task must terminate without a
partial ZIP. Verify Scene, History, draft and playback state remain intact.
