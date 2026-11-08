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

## Camera Animation and saved views

**Camera → Camera Animation** is the primary workflow for visual camera motion.
Navigate to a view and click **Add current view**, then navigate to another
and repeat. The camera is captured directly into an owned sequence frame;
no saved-view name is needed. Two frames replace the former separate Camera
transition controls. Three or more frames add further transitions, each with
an adjustable inbound travel time, easing and optional arrival pause. See
[`modern-camera-interpolation.md`](modern-camera-interpolation.md).

**Saved views · optional library** is a collapsible secondary control. Its
**Save current** action accepts an optional name (an empty name generates one).
Selecting a saved view allows **Go**, **Update**, **Rename** and **Delete**;
a selected view can also be added as a snapshot to Camera Animation. The
**Reset camera** action remains available outside that optional library.
Each stored view includes `CameraEast`, `CameraNorth`, `Height`, `Pan`, `Nick`,
`Roll`, `FocalLengthField`, `viewcenterHorizon`, and `deviceRatio`. Up to 20
views are persisted as optional `cameraPositions` in Modern experiments and
links, without altering Legacy state. They are not required for animation.

Sequence interpolation samples from **absolute elapsed time**, independent of
Fast optical frames, and never changes authored objects, atmosphere or surface.
Stop keeps the camera position at the last sample; Cancel restores the pre-Play
view. Manual navigation, mode changes and focus loss stop playback. Compare
receives a single common camera pose on both sides. Discrete camera aim and
aspect ratio must agree across frames. Geodesic paths, fly-through splines
and video export are deferred.

## Application preferences (browser-local)

**Display → Optical ray field**, **Fast Preview object detail**, and
**Rendering backend** are now saved immediately when changed, together with
**Camera → movement speed, rotation speed and Alt + wheel step**. They are
restored automatically on the next visit from the **same browser profile and
origin**. The UI's **Reset application preferences** button (in Display)
restores the reference defaults: Accurate RK4, automatic Preview LOD, Canvas 2D,
10 m/s, 1°/s and automatic wheel step. Reset does **not** delete saved
experiments, Camera Positions or animation frames.

These are **user interface/performance choices**, not scene physics: they do
not enter exported experiment JSON, share URLs or keyframes. In particular,
`Auto` always begins at rest using Accurate, then uses Fast only for eligible
motion. `Auto LOD` stores the *Auto choice*, not the measured tower stride.
WebGL2 is still experimental; when unavailable the renderer uses its existing
per-frame Canvas fallback without changing the saved selection.

The versioned browser key is `curvature-modern-application-preferences-v1`.
Previously saved camera-navigation values from
`curvature-modern-camera-navigation-v1` are read when no new-format record
exists; new-format values take precedence thereafter. Reset clears both keys
so that obsolete speeds cannot reappear. Malformed or unavailable storage
falls back to defaults and should not block the Modern app. Browser storage
may be partitioned by origin, so `localhost` and `file://` do not necessarily
share preferences.
