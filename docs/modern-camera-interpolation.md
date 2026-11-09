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

This is a sequence of independent segments: smoothstep stops at keyframes.
Fly-through splines, a scrubbable timeline, geodesic paths, final accurate
frame-by-frame rendering and video export remain future work. Live Chromium
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
