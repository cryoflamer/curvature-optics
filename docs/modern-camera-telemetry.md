# Modern camera telemetry (shared model)

Modern Scene, Compare A/B and Animation Studio need the same camera readout,
including when the Camera sidebar is collapsed or towers are outside the image.
The read-only `src/camera/ModernCameraTelemetry.js` module is the single source
for numeric measurements and displayed units; it never changes
camera controls or the physical renderer. The Scene/Compare HUD is a separate
DOM consumer of this model. It depends only on the existing physical camera
(`CurvaturePhysicalCamera`) for the camera's actual aim angle.

## Numerical contract

`CurvatureModernCameraTelemetry.measure(updatedPhysicalModel)` returns a frozen
object with raw, unrounded measurements. **Pass the exact model used to paint
that viewport or animation frame, after `model.Update()`**; for an animation
sample, build/update its dedicated model before measuring. A draft keyframe's
`FocalLengthField` alone is not the rendered diagonal FOV.

| Property | Meaning |
| --- | --- |
| `geometry` | `'globe'` for Modern physical model 1, `'flat'` for model 2 |
| `heightMeters` | Observer height above the local physical surface (not world Z) |
| `eastMeters`, `northMeters` | Signed observer offsets from the *authored scene origin* in local surface-arc metres |
| `distanceFromOriginMeters` | `hypot(eastMeters, northMeters)`; shortest origin-to-observer surface arc in the supported Globe camera frame, or planar distance on Flat |
| `headingDegrees` | **Signed `Pan`**, relative to the transported local North axis, 0° = forward/North and +90° = East; preserves the Camera sidebar value (not wrapped to compass 0–360°) |
| `nickDegrees` | Raw Camera `Nick`; not necessarily the physical optical-axis pitch |
| `aimDipDegrees` | The selected aim-mode offset from `CurvaturePhysicalCamera.create(model).aimDip`, expressed in degrees |
| `pitchDegrees` | Actual camera optical-axis elevation from the **local tangent horizontal**: `Nick − aimDipDegrees`; positive is up |
| `rollDegrees` | Camera `Roll` relative to the viewing axis |
| `fovDegrees` | **Diagonal** field of view from the updated model's `camViewAngle` in radians; not horizontal/vertical FOV |

### Globe versus Flat

`CameraEast` and `CameraNorth` denote surface-arc displacements, as in
`CurvatureCameraTranslation.frame`, not world-space straight-line coordinates.
On a globe their hypotenuse is an arc distance, **not** a surface chord or a
slant range. Height means local surface altitude on both geometries. This
readout does not compute distance to the towers, optical horizon, or geometric
centre of the authored objects. The scene origin is fixed when the observer
moves; geometry and objects are not recentered in the source experiment.

Physical camera modes: 0 = globe geometric horizon dip; 1 = flat reference
angle; 2 = their average; 3 = local eye-level. For Flat geometry, mode 0 dip
is zero. Compare A/B forces mode 3; with a shared camera pose, both sides show
identical position/orientation telemetry even though their physical surfaces
may differ. For other aim modes, moving Height can also change the **effective
pitch**, because the aim offset depends on observer height and geometry.
The dip is *geometric framing*, not a traced RK4 horizon or an atmospheric
refraction estimate. The readout never promises that a horizon or object is
visible.

## Formatting, integration and scope

`CurvatureModernCameraTelemetry.format(measurement)` returns a frozen object
with strings for Height, Distance, East, North, Heading, Pitch, Nick, Roll and
FOV. `formatLength()` displays metres (two decimals below 10 m, one decimal
at or above 10 m) and kilometres (two decimals at/above 1000 m).
`formatAngle()` preserves small degrees down to four decimal places; the
values are intentionally deterministic and locale-independent for future
DOM, Canvas and export parity. **Keep raw measurements for computations.**

Consumers should derive samples from the viewport's own rendered model:

- Scene uses its current updated model, including navigation state.
- Compare uses its two updated physical models (eye-level aim for both).
- Animation Studio uses its isolated, per-timestamp render model, not the
  current Scene sidebar or a cached draft keyframe.
- During uncommitted drag/keyboard CSS previews, the UI must supply the
  **effective interim camera state**, not the previous finished RK4 frame.

The persistent on-screen HUD is available in Scene and Compare A/B. Its
**Camera HUD** checkbox is in **Display → Viewport overlays** alongside the
independent **Target direction** indicator and target selector. The HUD's
**Camera HUD appearance** disclosure adjusts *background* opacity (0–100%,
text remains opaque with adaptive contrast), corner (top-left/right or
bottom-left/right), and text scale (75%, 100%, 125%). Both Compare sides share
the appearance preference, but their clipped viewports and camera telemetry
remain independent. The settings are stored in local
`ModernApplicationPreferences` (`cameraHudVisible`, `cameraHudAppearance`),
not in experiment snapshots or URLs. Resetting application preferences restores
the defaults. No RK4 recalculation is triggered by toggling or restyling the
DOM overlay. The Animation Studio keeps separate playback/export controls;
named Studio projects can store their own HUD appearance.

`ModernCameraHud.js` creates an accessible, non-interactive text-only overlay
in each Graph Canvas clipping container. It never changes exported pixels.
Scene uses the current model; Compare measures both independently rendered
models with their shared live observer pose and Compare eye-level aiming. Mouse
drag shows interim position/angles even before the committed RK4 redraw; wheel
FOV and keyboard motion update the HUD immediately. When hidden, the old
transient drag text remains available. Animation Studio playback and optional
PNG/MP4/WebM burn-in share the appearance model, including adaptive text contrast.
The exported Canvas HUD is not pixel-identical to the DOM's CSS text rendering.
No Legacy source changes.

Tests: `node --test tests/ModernCameraHud.test.js tests/ModernCameraTelemetry.test.js tests/ModernApplicationPreferences.test.js`.


Tests: `node --test tests/ModernCameraTelemetry.test.js`.
