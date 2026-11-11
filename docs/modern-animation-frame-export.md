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
- **Opaque white PNG background:** the shared physical painter deliberately
  paints on a transparent Canvas. Live Scene/Animation appears white because
  the browser displays that Canvas over a white CSS background; PNG has no CSS.
  After each completed Accurate frame, **before PNG encoding**, the common
  export runner draws `#fff` with Canvas `destination-over` at identity
  transform and full alpha. This puts white *behind* all pixels, retaining
  antialiasing and painter output while making every exported pixel opaque.
  Never fill white before the painter (it clears the Canvas), or paint
  source-over afterwards (it would obscure the geometry). All export workers
  inherit this single post-processing step, including future worker pools.
  `manifest.json` records `backgroundColor: "#ffffff"`. This is parity
  with the **displayed** live image over CSS white, not with the raw
  transparent backing-store RGBA channels.
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
- The opaque-compositing regression checks transparent, fully opaque and
  partially transparent edge pixels, destination-over semantics, Canvas state
  restoration, and that the compositor runs before PNG encoding. An additional
  local raster test loaded a **960×540 PNG from an actual Opera export** and
  compared rendering it over a white CSS-equivalent layer versus baking white
  behind it with destination-over: **0 differing RGBA channel values**.
  This validates background compositing on that recorded raster; it does not
  establish full Scene/Animation parity for different camera/viewport states.
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
