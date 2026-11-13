# Modern camera interpolation and sequences

Modern Camera Positions are full camera poses saved in the experiment. Scene and
Compare share one camera; neither playback mode changes authored objects,
atmosphere or physical optics.

`src/camera/ModernCameraInterpolator.js` evaluates a saved pose at an absolute
transition time with `cameraAt(start, end, timeMs, durationMs, mode)`. `mode` is
`linear` or `smoothstep`. East/North interpolate linearly in the local camera
coordinates, Height stays height above the local surface, Pan/Roll follow the
shortest angular route, Nick is linear and positive focal lengths are
logarithmic. This is not a geodesic path for long Globe flights. The aim mode
and aspect ratio must agree at intermediate times.

`src/camera/ModernCameraSequence.js` is a separate **pure**, deterministic
keyframe timeline, with `validate(frames)`, `timeline(frames)`, `totalMs(frames)`
and `cameraAt(frames, absoluteTimeMs)`. Each frame contains exactly:

- `name`: keyframe label (1–80 characters).
- `camera`: an owned snapshot of the nine Modern camera pose fields.
- `travelMs`: duration of the **incoming** segment (200–120,000 ms); **zero
  on the first frame only**.
- `holdMs`: pause **after arrival** (0–120,000 ms).
- `easing`: `linear` or `smoothstep` for the incoming segment.

The total timeline includes every hold and every inbound travel interval. All
keyframes and intermediate aim/aspect constraints are validated before playback.
Sampling is stateless; seeking to a time never requires calculating previous
frames. Frames outside the timeline clamp to the respective endpoints.

## Animation Studio Spline interpolation

Animation Studio projects (`src/animation/ModernAnimationProject.js`) optionally
store `interpolation: "linear" | "spline"`. Existing version-1 projects without
this field retain their **unchanged Linear behavior**, including each frame's
`linear` / `smoothstep` inbound easing. Only **camera** projects support Spline;
physical curvature and temperature-gradient projects remain linear.

`ModernCameraInterpolator.interpolateSpline(frames, segmentIndex, progress)`
interpolates between the numbered arrival keyframes using a **shape-preserving
cubic Hermite** curve. It uses the actual inbound `travelMs` intervals when
estimating neighboring tangents, not uniform keyframe indexes. Interior keys
without a hold have continuous first derivatives in physical transition time;
endpoint keys and keys with `holdMs > 0` stop smoothly. With exactly two keys,
the cubic has zero end velocities. Per-frame easing is retained in the project
but not *also* applied in Spline mode: doing so would force an artificial stop
at every keyframe.

East/North, Height and Nick are shape-preserving **per coordinate**, with no
overshoot beyond each segment's endpoint values. Pan and Roll take shortest
angular differences and are wrapped to the supported Modern pose ranges.
FocalLengthField follows a shape-preserving spline **in log-space** to remain
positive. View aim mode and aspect ratio cannot change across a segment.
This is not constant-speed or geodesic motion, and the local tangent constraint
does not constrain the total three-dimensional path to a fixed ground altitude.

Studio's pure draft API carries the new property through `blank`, `edit`,
`build`, `fromProject` and crash-recovery checkpoints. With a compatible camera
animation prepared, **Animation Studio → Animation playback → Camera
interpolation** offers **Linear** and **Smooth · Spline**. Switching uses the
same working draft and keyframes, preserves the current elapsed playback time,
repaints the independent optical preview, and does not require re-preparing
or saving a second project. It also preserves the Play/Pause state. The mode
is autosaved to the working draft; **Save changes** is still required to
update a previously saved Animation Library project. The **Easing** selector
in the selected keyframe editor is disabled in Spline mode and explains why;
its previous `linear` / `smoothstep` value remains stored, so switching back to
Linear makes the same selection editable again without a semantic draft change
from merely viewing it. Switching modes refreshes the editor immediately.
For physical animations the control is hidden. The project's shared `sampleAt` path applies the chosen
mode to preview and export; this stage does not alter video codecs or frame
renderers. The independent Scene/Compare Camera Animation panel still uses its
original interpolation.

### Saving and restoring Spline projects

A working Spline draft is checkpointed together with its selected keyframe,
playhead, playback quality and optional named-project revision. Browser reload
restores the same `interpolation: "spline"` mode; a prepared preview is
recreated **paused**, not automatically played. Workspace switching keeps
independent draft copies for Linear and Spline. Explicit **Save changes** (or
**Save As**) commits the chosen mode to the Animation Library; opening a named
project does not change the current Scene/Compare experiment.

**Animation Library → JSON backup** exports the `interpolation` field in the
complete version-1 project. The import preserves it and restores the same
camera samples and keyframe timings without requiring local History records.
Linear and Spline share keyframe endpoints but are different semantic animations,
so duplicate detection must not merge them. A pre-Spline v1 project that omits
the field is **equivalent to explicit Linear** for duplicates, playback and
unchanged-project indicators; it should not display unsaved changes just from
being opened. Neither the format version nor old serialized files are rewritten
implicitly. Invalid interpolation values are rejected before storage writes.

### Preview / Accurate export parity (Spline stage 4)

`ModernAnimationPlayback.sample()`, PNG frame ZIP and the independent VP9/WebM
and H.264/MP4 renderer workers all use the **same validated project** and
`ModernAnimationProject.sampleAt(project, timeMs)`. Tests cover intermediate
samples, non-uniform travel times, holds, angular wrap and final keyframes in
Scene and synchronized Compare A/B (one composed video or separate streams).
Video samples its **last display interval at the exact endpoint** without
adding time; the PNG timeline instead includes a separate endpoint image.
When the entire project fits in one nominal video FPS interval (for example,
200 ms at 5 FPS), video intentionally splits that interval into two positive,
contiguous, variable-duration frames: first at time zero, second sampling the
exact final camera pose, both within the original total duration. The FPS
selection remains a nominal encoding setting in this exceptional case; frame
timestamps and durations reflect the split. Regular video timelines retain
their previous FPS boundaries.
Sampling equivalence refers to camera/experiment state at equal times, **not
pixel identity** between an interactive Fast/Auto Preview and a fixed-size
Accurate RK4 export. Physical optics and codec quality are not altered.

The pre-render `splineProof` handshake now checks representative midpoints
across the *first, middle and last* transitions (up to eight) rather than
only the first transition. A missing, stale or mismatched proof aborts before
expensive RK4 frames. Completed PNG and video export manifests contain
`cameraInterpolation: "spline"` or `"linear"` for camera projects (and `null`
for physical projects); the respective controller checks this field before
accepting a completed file. This is a bounded compatibility guard, not a
formal proof of pixel or trajectory equivalence at every possible timestamp.

The new contract is covered by
`node --test tests/ModernAnimationSplineExportParity.test.js` together with
Worker codec/controller tests. Real Opera rendering and pixel-level comparisons
remain a separate manual validation.

## Spline Animation stage-5 closure (2026-11-13)

**Status: implementation and automated audit complete; optional real-browser visual
acceptance not performed.** This is the stable, documented baseline for the
camera-only Spline mode, not a claim of pixel-perfect rendering in Opera or a
release qualification for every codec/browser combination. No additional Spline
features are required for this milestone.

### Supported workflow

1. In **Animation Studio**, prepare a compatible **camera** animation with at
   least two keyframes. Physical-parameter animation continues to use Linear.
2. Under **Animation playback → Camera interpolation**, select **Smooth ·
   Spline** (or return to **Linear**) without rebuilding the draft. The Preview
   playhead and Play/Pause state are retained across the selection.
3. Edit keyframe travel and hold durations normally. The per-keyframe **Easing**
   field is deliberately disabled in Spline; its stored value is not discarded
   and becomes editable when returning to Linear.
4. Save an existing named project with **Save changes**, or create a distinct
   Library entry with **Save As**. Independent working drafts survive reload;
   restored previews start paused. **Stash & restore** preserves an independent
   draft before restoring the named Library revision; **Discard changes**
   restores that revision only after confirmation.
5. Back up selected/all Library projects to JSON and re-import as needed. Old
   version-1 projects missing `interpolation` still mean Linear. Exports include
   interpolation metadata in their manifests. PNG ZIP, WebM and MP4 sample the
   shared camera state in Scene and Compare; codec output and browser pixels
   remain separate concerns.

### Automated evidence and boundaries

| Area | What is checked | What is not thereby established |
| --- | --- | --- |
| Spline math | Timing-aware Hermite/PCHIP, holds, bounded scalar channels, angular wrap and focal length semantics | Constant spatial speed or a geodesic trajectory |
| Preview vs export | Shared `sampleAt` camera state at tested times, Scene and Compare A/B, Worker `splineProof` checks | Byte-identical or pixel-identical Fast/Auto vs Accurate RK4 images |
| Very short video | Two positive-duration samples preserve both endpoint poses within the original duration when a video occupies one nominal FPS interval | Visual smoothness at very low FPS |
| Storage and Library | Mode preservation in drafts, project revision operations, JSON round trips and old Linear defaults | Browser-specific IndexedDB durability under every failure mode |
| UI | Spline disables per-keyframe Easing, switching back restores the saved Linear setting | Manual inspection of every Opera layout and interaction |

Run the focused suite from the repository root:

```sh
node --test tests/ModernCameraSpline.test.js tests/ModernAnimationSplinePreview.test.js tests/ModernAnimationSplineExportParity.test.js tests/ModernAnimationSplineExportCompatibility.test.js
node --test tests/ModernAnimationVideoPipeline.test.js tests/ModernAnimationDraftAutosave.test.js tests/ModernAnimationLibrary.test.js
```

For the broader regression gate, use `node --test tests/*.test.js` and the
Legacy/isolation checks listed in [`development.md`](development.md). The
2026-11-13 final Spline-fix validation reported **1412/1412 automated tests**;
this number describes that checked source state, not a perpetual guarantee for
later commits. Real Opera playback, WebM/MP4 display and a same-state,
same-size pixel comparison were **not manually accepted** for this closure.
Do not represent automated camera-state parity as pixel parity.

### Known limitations and intentional behavior

- Spline interpolates camera channels independently, so it does not promise
  constant path speed, constant ground clearance, or physical/geodesic flight.
- A hold stops motion at its keyframe; a two-keyframe spline stops at both ends.
  Per-keyframe easing has no effect in Spline but survives for Linear.
- Video's final sampled frame shows the endpoint within the last display
  interval, whereas PNG ZIP includes an explicit endpoint frame. For an
  unusually short video, two variable-duration video frames share the same
  original total duration. Low FPS may still look jerky.
- PNG frame ZIP has a **751-frame** cap, video a **36,000-frame** cap; PNG
  archives also have a 192 MiB size guard. Export can reject projects which
  play in interactive Preview.
- Preview may use Fast/Auto optical quality while offline output uses Accurate
  RK4. Equal sample times and camera states do not imply equal pixels.
- Renderer/encoder Workers can remain stale in a cached browser session.
  If a Spline compatibility warning appears, reload the page and retry rather
  than accepting unverified output. Browser/codec support still varies.

**Release note:** This stage is considered closed on automated evidence and
accepted limitations; manual Opera validation is intentionally deferred, not
claimed as passed. If a future user-visible defect is found, open a focused
regression and fix rather than reopening the mathematical design by default.

## Browser controls: direct camera animation

In **Scene / Compare → Camera → Camera Animation**:

1. Navigate the live camera to the desired starting view and select **Add current view**.
2. Move or turn the live camera to a second view; select **Add current view** again.
3. Repeat to add more views, then select **Play animation**. Two frames are an
   ordinary transition; three or more are an ordered sequence.

Frames are automatically named `Frame 1`, `Frame 2`, etc. No name, saved
position or separate transition player is required. A multi-row frame picker
shows the playback order, incoming travel duration, optional pause and arrival
clock time. Select a frame to edit its **incoming** travel (default 5 seconds),
its pause and easing. Changes save automatically on change. The first frame
always has travel time zero. The optional frame name can be changed under the
collapsible advanced control. Use **Go to frame** to inspect its pose and
**Use current view** to replace it with the live camera position without
changing the frame's timing. Reorder, remove or clear frames as needed.

The **Saved views · optional library** section is collapsible and independent.
Saved views can be added to an animation, but the animation owns snapshots:
updating/renaming/deleting a saved view never changes a sequence already made.
Previously saved named sequences are loaded and edited in exactly the same
format; the HTML-only legacy two-position player was retired.

At least two frames are required to **Play animation**. Playback uses Fast
Preview and the existing adaptive LOD, then restores the selected idle optical
quality. Unsupported atmospheric profiles are rejected before playback.
**Stop here** leaves the last sampled pose; **Cancel / restore** returns to the
pose captured before Play. Manual navigation, workspace switching, browser
blur or hiding the page interrupts playback. Both Compare viewports receive
the same shared camera pose.

A nonempty sequence is an **optional** `cameraSequence.keyframes` field in
Modern's version-1 experiment. It is preserved in local storage, JSON export
and the `experiment=` share URL; old experiments and empty sequences omit it.
The saved sequence references *poses*, not IDs of Camera Positions. Editor
selection and navigation speed are intentionally not serialized.

The **direct Camera Animation panel** is a sequence of independent segments:
smoothstep stops at keyframes. It does not expose the new Animation Studio
spline core. Geodesic motion and constant-speed path parametrization remain
out of scope; Animation Studio already has a separate Preview and video export. Live Chromium
visual validation is separate from the Node integration tests.

## Checks

```sh
node --test tests/ModernCameraInterpolator.test.js tests/ModernCameraSequence.test.js tests/ModernCameraNavigation.test.js
node tools/audit-legacy-isolation.js --check
```


## Next-generation Animation Studio foundation

The pure Animation Studio foundation (`src/animation/ModernAnimationCompatibility.js`
+ `ModernAnimationProject.js`) permits **camera-only** or **single-physical-parameter**
animations using self-contained snapshots from Modern History. It reuses the
existing camera interpolator without changing the present Camera Animation UI,
serialization, or playback behavior. Read [animation research and API contract](modern-animation-research.md)
for the exact two-mode invariant, allowed physical channels, and limitations.

## Animation Studio editor (transition stage)

`src/animation/ModernAnimationStudio.js` provides pure, side-effect-free draft
helpers: `blank`, `history`, `importCamera`, `edit`, `editFrame`, `move`,
`remove`, `inspect` and `build`. The History draft owns the source experiment
payloads; old Camera Animation import captures copies of the active experiment
with each saved camera pose, preserving `travelMs`, `holdMs` and `easing`.
The existing camera sequence still runs independently from the live Camera
panel. `src/ui/modern/ModernAnimationStudioUI.js` renders the lightweight DOM
editor within History; `ModernApp.js` wires its actions and exposes only an
explicitly prepared project to DevTools. Read [History](modern-experiment-history.md)
for usage and the limitations of this in-memory editor.

The project is not yet applied to a renderer and must not be mistaken for a
live animation. No intermediate optical frames are computed while editing.
