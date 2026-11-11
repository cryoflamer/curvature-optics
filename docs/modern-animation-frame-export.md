# Deterministic animation PNG sequence export

The PNG exporter lives under **Animation → Animation playback → Export PNG
frames**. It is a **background Web Worker pool** with a separate ZIP assembler,
separate from live
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
  Scene/Compare **in each renderer worker**, at the chosen fixed resolution.
  Each renderer imports the
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
  source-over afterwards (it would obscure the geometry). All render workers
  inherit this single post-processing step.
  `manifest.json` records `backgroundColor: "#ffffff"`. This is parity
  with the **displayed** live image over CSS white, not with the raw
  transparent backing-store RGBA channels.
- For Compare, `frame_N_A.png` and `frame_N_B.png` use identical timestamps;
  `manifest.json` records each file and available optical statistics. It
  includes the self-contained physical project and exact microsecond times.
  Parallel exports also record `renderWorkers` and `renderElapsedMs` (time from
  archive initialization through receipt of the last PNG). Optical timing and
  cache-hit metrics may vary with worker count; pixel outputs must not.
- The uncompressed ZIP32 store writer is bounded (max **751 timestamps** and
  **192 MiB PNG data**). Presets: 5/10/25/30 FPS at 640×360, 960×540 or
  1280×720. There is no MP4/WebM encoding or streaming archive yet.

## Background work, progress and cancellation

The main thread creates **1, 2 or 4 rendering workers** plus **one archive
worker**. The default **Auto** uses half the reported logical CPU count,
clamped to 1–4. Choose 1 as a performance / pixel-parity baseline; choose 2
or 4 to compare actual throughput. Memory usage grows with the worker count,
particularly for Compare A/B, and speedup need not be linear.

1. All renderers independently load the production Accurate RK4 painter,
   construct their own `OffscreenCanvas` and optical caches, and report ready.
2. The controller assigns the next unclaimed timestamp whenever a renderer
   finishes its current one. Each worker calls the **shared** `renderTimestamp`
   function: sample the validated project, paint in Accurate RK4, composite
   white `destination-over`, encode PNG and include per-side metrics.
3. PNG byte buffers transfer (not copy) from the renderer to the controller
   and on to the archive worker. The UI does not decode, rasterize or ZIP them.
4. The archive worker stores frames by index, checks for duplicates and the
   192-MiB limit, and assembles `manifest.json` plus PNGs **in timestamp order**
   after receiving every expected timestamp. Out-of-order completion cannot
   change file naming or final-frame selection.

Progress counts **fully encoded and received timestamps**, not intermediate
RK4 steps. It displays pool size, elapsed time and rough ETA; the timestamp
shown is the last **completed** frame, which need not be the chronologically
latest frame. A separate `packing` status is shown while ZIP CRCs and Blob
assembly run in the archive worker. `renderElapsedMs` measures the elapsed
render/transfer phase; the UI reports total time including ZIP creation.

**Cancel export** immediately terminates **all** rendering workers and the ZIP
worker, even in the middle of synchronous RK4 or ZIP assembly. Late messages
are ignored and **no partial ZIP** is downloaded. If Workers or OffscreenCanvas
are unavailable, a visible error is raised; there is no synchronous UI-thread
fallback. Each worker owns isolated state and must never read or mutate live
Scene/Compare, History, Animation Playback or Studio draft.

## Validation

- `node --test tests/ModernAnimationFrameExport.test.js tests/ModernAnimationBackgroundExport.test.js tests/ModernAnimationParallelExport.test.js`
  checks exact frame counts, OffscreenCanvas encoding, pooled scheduling,
  1/2/4-worker deterministic ZIP parity, out-of-order A/B assembly, duplicate
  and missing-frame failures, archive memory budget, immediate cancellation of
  the entire pool, real archive-worker imports without DOM, and a headless
  GraphX3DX camera bootstrap.
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

**Opera acceptance remains mandatory.** Export the SAME Globe → Flat project
at 640×360/5 FPS with 1, then 2 and 4 workers. Verify progress starts before
the first expensive frame, Compare A/B stays synchronized, `manifest.json`
contains the chosen worker count, and the final Flat is exact. Compare actual
**PNG pixel hashes** across worker counts (manifest timing/cache metrics will
naturally differ); record `renderElapsedMs` and total elapsed seconds to measure
speedup. Try Cancel during a long Accurate frame and during ZIP packing: the
page must remain responsive and neither case may download a partial ZIP.
Verify Scene, History, the draft and Playback remain intact.
