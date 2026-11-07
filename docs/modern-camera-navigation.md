# Modern camera navigation

The Scene and Compare viewports use one shared observer pose. Camera movement
is supported by the Modern physical optics renderer only; Legacy demos are
independent and keep their original interaction contract.

| Pointer gesture (over a scene Canvas) | Action |
|---|---|
| Left drag | Change camera Pan/Nick (existing behavior) |
| **Shift + left drag** horizontally | Move observer left/right along the local horizontal (relative to camera Pan) |
| **Shift + left drag** vertically | Change observer height (drag upward to raise camera) |
| **Alt + wheel** | Move observer forward/back along the *horizontal* camera heading |
| Shift + wheel | Change focal length / optical zoom (existing behavior) |
| Wheel without modifiers | Browser scrolling (unchanged) |

The drag mode is fixed on pointer-down. Both viewports in Compare receive
exactly the same height, East and North position, Pan/Nick/Roll and focal length;
only the A/B surface and atmospheric profiles differ.

## Physical meaning

`CameraEast` and `CameraNorth` are the observer's signed surface-arc displacement
in metres from the authored scene's initial origin. `Height` is height above
the current local surface; Pan/Nick/Roll are kept unchanged by translation.
The original object distance and lateral-offset values are never rewritten.

A globe translation rigidly rotates the **authored objects** into the new
observer's tangent frame and parallel-transports the local east/north axes.
The transformation is exact for a spherical surface and also supports the
flat limit. The 3D ray field remains observer-centred, so optical occlusion,
refractive bending, and distances are recalculated in the new tangent frame.
Metric ground rings remain observer-centred reference guides. Physical camera
translation does not change the chosen atmospheric model.

In Scene mode, a horizon-relative Camera aim may affect the effective pitch
when **Height** changes, as it already does for the Height input. For a strictly
fixed local viewing direction use **Camera aim → Eye level · fixed** (Compare
uses this by default).

Mouse movement sensitivity depends on the field of view and weighted scene
object distances captured at the start of the drag. Alt + wheel moves a bounded
fraction of this reference distance per notch. With ordinary Accurate selected, preview drags are an approximate
CSS image shift; actual perspective, parallax and refractive visibility are
recomputed on release. In **Display → Optical ray field → Auto**, qualified
profiles instead use throttled Fast optical projections while dragging, with
Accurate recomputed on release. Wheel events are similarly coalesced and
refined after a short idle period.

The signed observer position is displayed in **Camera** settings and saved
in the Modern experiment state, including URL sharing, JSON and the library.
Old experiment links with no East/North fields restore both coordinates to
zero. Selecting a named scene preset resets the offset to the origin.

**Limits:** positions are at most 10,000 km in either signed axis and must
remain on the near observer-facing hemisphere of the selected globe; the
camera refuses movements that would cross this restriction. OS/browser
shortcuts may intercept Alt + wheel before it reaches the page.

## Keyboard navigation and precision controls

Click or focus a Scene/Compare image before navigating. The viewport is keyboard
focusable. Ordinary input, select, button and text editing keep their own keys;
Demos and Legacy never receive Modern navigation events.

| Keyboard | Motion |
|---|---|
| W / S | Forward / back along the local surface, following Pan, not Nick |
| A / D | Left / right along the local surface |
| Q / E | Lower / raise observer height |
| Left / right arrows | Decrease / increase Pan |
| Up / down arrows | Increase / decrease Nick |
| Shift (with navigation key) | Five times normal movement and angular rate |
| Ctrl (with navigation key) | One fifth of normal movement and angular rate |

These keys can be held together. Translation in multiple directions is
normalized so diagonals do not move faster. Keyboard movement is integrated
from elapsed time with bounded steps, with numeric values updated immediately,
and with **Accurate** selected the expensive optical redraw happens on key
release. When **Auto** is selected, eligible profiles instead render Fast
optical snapshots at a bounded cadence (at most one pending renderer frame),
then one complete Accurate image after release. This is not 60 FPS physical
rendering: frames may take longer than the requested 120 ms interval.
Unsupported profiles retain the release-only Accurate workflow. The browser/OS may
intercept certain Ctrl shortcuts before the application receives them.

The Camera sidebar has `East` and `North` numeric fields, in metres, alongside
Height, Pan, Nick, Roll and focal length. They use the same physical camera
and validation as pointer navigation. Changes do not modify object coordinates,
refractive profiles or surface geometry. The shared camera is applied to both
models in Compare. The Camera panel also exposes a movement speed (m/s),
angular rate (degrees/s), and an optional fixed Alt + wheel step (metres per
notch); `Automatic` preserves the original scene-scaled wheel behavior. These
navigation preferences are stored only in local browser preferences, *not* in
saved experiment camera poses.

## Saved camera positions

In **Camera → Saved camera positions**, name a pose and select **Save current**.
Choose one from the list to **Go**, **Update** its stored pose, **Rename**, or
**Delete** it. `Reset camera` returns to the starting camera pose of the
currently loaded experiment (or the most recently selected named Scene preset),
without changing objects, atmosphere, surface or Compare A/B settings.

Each pose stores `CameraEast`, `CameraNorth`, `Height`, `Pan`, `Nick`, `Roll`,
`FocalLengthField`, `viewcenterHorizon`, and `deviceRatio`. This is a full
camera pose, **not a complete experiment snapshot**. Up to 20 named poses are
included as optional `cameraPositions` data in the existing Modern experiment
JSON, copied links and experiment library. An older experiment without poses
continues to load unchanged. The optional field does not modify the Legacy
`?state=` contract. Selecting a fresh Scene preset starts a new pose list;
loading a saved experiment restores its own list.

The list is ordered by creation. The **Camera transition** controls below it
provide a single non-persistent transition between **two distinct saved poses**:
select From/To, a duration from 0.2 to 120 seconds, and Linear or Ease in / out.
Press **Play transition** for an actual moving camera preview. Fast optical
samples are throttled and use the existing adaptive/selected tower LOD; when
finished, the active optical-quality preference (normally Accurate or Auto at
rest) renders the full endpoint. Compare A/B always receive the same camera
and LOD. Some atmospheres are not qualified for Fast and cannot be animated by
this player yet; no implicit RK4 renders are scheduled during a transition.

**Stop here** keeps the latest intermediate camera pose. **Cancel / restore**
returns to the camera pose that was active *before Play* (not to the chosen
From position). Starting manual keyboard/pointer/wheel navigation or editing
physical controls interrupts playback. Changing workspaces, experiments or
browser focus also stops the active transition, without changing the authored
scene. Discrete camera aim and aspect must match between the saved poses;
otherwise Play reports a validation error before modifying the camera.

Position is sampled from **absolute elapsed time**, not integrated per Fast
frame: a slow optical frame may cause visual skipping but must not make camera
motion run slow. Only local linear East/North, local height, shortest wrapped
Pan/Roll, linear Nick and logarithmic focal length are used. Long-distance
geodesic paths, multi-keyframe timelines, video export, and persistence of
transition settings are intentionally out of scope. The existing experiment
schema and saved poses remain unchanged.
