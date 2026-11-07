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

## Browser controls

In **Scene / Compare → Camera → Camera sequence**, choose a saved camera
position, set a name and timings, then **Add keyframe**. The editor supports
editing name/timing, replacing a keyframe's camera from a saved position,
reordering, removing and clearing frames. When reordering makes a former first
frame non-first, its incoming travel defaults to 5 seconds. A keyframe always
contains an independent camera snapshot: later rename/update/delete operations
on Camera Positions do not alter it.

At least two keyframes are required to **Play sequence**. Playback uses Fast
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
