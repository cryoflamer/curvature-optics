# Modern target direction geometry

`src/camera/ModernTargetDirection.js` is a **read-only geometric** target
locator for the Camera target-direction indicator. The geometry is kept
separate from `src/ui/modern/ModernTargetIndicator.js`, which provides the
DOM indicator and optional PNG/MP4/WebM Canvas overlay. Both modules load
only in `CurvatureModern.html`, never in the Legacy entrypoint.

## Sources of truth

- `CurvatureGeometryEngine.objectSequence()` generates the same actual physical
  objects as the Modern renderer (including size/side variation and twin
  columns); `towerPlacement()` returns each object's physical anchor and
  vertical basis. The indicator aims at **half the placed object height**.
  `rEarth` is the authoritative physical radius, matching
  `CurvatureMainCanvasRenderer.renderPhysical()`. The list is independent of
  Legacy horizon masking.
- `CurvatureCameraTranslation.frame()/pointAt()` relocates these 3D targets into
  the observer's local ENU frame. On Globe this uses the renderer's spherical
  rigid rotation and parallel-transported axes, not planar coordinate
  subtraction. Flat is the exact zero-curvature limit.
- `CurvaturePhysicalCamera.create()` supplies the actual forward and rolled-up
  vectors, including the effective aim dip. The right vector is their cross
  product. Normalized screen coordinates use the **diagonal** `camViewAngle`
  and `deviceRatio`, consistent with the physical viewport:
  `halfTanY = tan(camViewAngle / 2) / hypot(1, deviceRatio)`;
  `halfTanX = deviceRatio * halfTanY`. Positive screen Y points **up**.

## Pure API

```js
const locator = CurvatureModernTargetDirection;
const targets = locator.collect(updatedPhysicalModel);
const group = locator.select(targets, {kind: 'group', groupIndex: 0});
const object = locator.select(targets, {kind: 'object', groupIndex: 0, instanceIndex: 0});
const sample = locator.point(updatedPhysicalModel, group);
// Or: locator.measure(updatedPhysicalModel, {kind: 'scene'});
```

`collect()` returns immutable `objects`, `groups`, and a scene-wide centre,
where `null` means no authored objects. Both centres are object-weighted means
of actual 3D object anchors; they are **not** fitted surface points and are not
artificially lifted to the globe. The `instanceIndex` follows the renderer's
far-to-near authored sequence; an individual entry also records its
`sequenceIndex` and `column`. Re-collect when object settings, camera offset,
height, or the surface geometry changes. Do not persist or reuse these
observer-local 3D coordinates across different model states.

`point()` reports actual slant distance, local geometric bearing relative to
north, signed bearing from Pan, elevation above the local tangent, forward/right/
up camera components, and optionally normalized viewport (`screenX`, `screenY`).
`inView` refers **only to the selected anchor within the camera's geometric
field of view**, not whether any part of its silhouette is rendered.
`direction` is one of `ahead`, `left`, `right`, `above`, `below`, `behind`,
`here`. Targets behind the camera have `null` screen coordinates; an exactly
coincident anchor gives `here`. Missing target selections return `null`.

**No optical visibility inference:** geometric direction may point below the
horizon or through other objects; it does not account for RK4 refraction,
atmospheric obscuration or occlusion. The indicator only appears when the
selected centre lies outside the geometric camera frustum; otherwise it stays
hidden even if refraction hides the target. This must not be interpreted as
optical visibility. Its browser preferences are independent of Camera HUD.

**Controls:** In Scene and Compare A/B choose **Display → Viewport overlays**:
**Target direction** toggles the live marker, and **Target** selects All towers,
Group 1, or Group 2. A bottom-centred arrow, target label and geometric distance
appear within each physical viewport. Animation Studio has its own playback
visibility control and separate opt-in PNG and MP4/WebM export flags (OFF by
default). The underlying physical Canvas, snapshots and RK4 remain unchanged.

## Verification

`node --test tests/ModernTargetDirection.test.js` validates authored anchors,
Globe/Flat observer movement, roll, aiming, diagonal FOV, grouped objects,
missing targets and browser load isolation. `node tools/audit-legacy-isolation.js
--check` checks the static Legacy/Modern script boundary. Tests don't replace
a manual visual check of the eventual marker against actual camera images.
