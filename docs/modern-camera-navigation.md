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
fraction of this reference distance per notch. Preview drags are an approximate
CSS image shift; actual perspective, parallax and refractive visibility are
recomputed on release. A short sequence of wheel inputs is coalesced into one
physical redraw.

The signed observer position is displayed in **Camera** settings and saved
in the Modern experiment state, including URL sharing, JSON and the library.
Old experiment links with no East/North fields restore both coordinates to
zero. Selecting a named scene preset resets the offset to the origin.

**Limits:** positions are at most 10,000 km in either signed axis and must
remain on the near observer-facing hemisphere of the selected globe; the
camera refuses movements that would cross this restriction. OS/browser
shortcuts may intercept Alt + wheel before it reaches the page.
