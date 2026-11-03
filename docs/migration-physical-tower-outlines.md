# 106 — Physical first-ground-hit occlusion of tower outlines

## Scope

`src/optics/OpticalTowerSilhouette.js` projects **the actual independent transmission-tower geometry** (banks 0 and 1) to azimuth/elevation angles using the shared 2D optical field from patch 104. It clips hidden parts of the tower's **outline edges** against the surface through `CurvatureTargetProjection` / `CurvatureSharedRayField`. It does not use the Legacy painter's opaque horizon disk, a screen-space visibility mask, or an effective-radius shortcut.

This is **an angular-geometry stage, not the final Canvas renderer**. A future renderer must map `[azimuth,elevation]` to pixels with the intended camera orientation/FOV. It must not draw undisclosed polygons across hidden regions.

### Public interfaces

```js
const field = CurvatureSharedRayField.create({
  geometry: 'flat', observerHeight: 15, atmosphere: 'inverse-spherical',
  profileOptions: {occlusionRadius: 6371000},
  distances: [1000, 20000, 40000], heights: [0, 20, 50],
  angleTolerance: 1e-5
});
const outlines = CurvatureOpticalTowerSilhouette.projectTowerScene({
  model, geometry: 'flat', field
});
// outlines.segments: [{points:[[azimuth,elevation],[azimuth,elevation]],
//   world:[[x,y,z],[x,y,z]], source:{primitiveIndex,edgeIndex,tower,mode,style},
//   visibility:'visible', units:'radians'}]
// outlines.unresolved and outlines.stats describe omitted uncertain pieces.
```

`projectTowerScene` consumes `CurvatureGeometryEngine.towerSequence` for each requested tower bank, reusing the existing local shapes, transformations, variations and side offsets. `banks` can explicitly select `[0]`, `[1]` or `[0,1]`; with no override, all enabled **tower** banks are selected. Non-tower object types are outside this patch. `projectPrimitives` accepts arbitrary 3D **line and polygon-outline primitives** from that engine; `coordinate(worldPoint,geometry,R,observerHeight)` exposes the coordinate transformation for independent tests.

### World/optical coordinate bridge

The GeometryEngine's world-space observer is at `[0,0,0]`, and its flat ground is at `z=-model.Height`. The Globe centre is at `[0,0,-R-model.Height]`. Therefore:

- Flat: `d = hypot(x,y)`, `h = z + observerHeight`.
- Globe: `rho = hypot(x,y,z+R+observerHeight)`, `h = rho-R`, `d=R atan2(hypot(x,y),z+R+observerHeight)`.
- Azimuth: `atan2(x,y)`; optical elevation comes from the field at `(d,h)`.

For Globe, `R=model.geometryRadius` must match the **geometric** sphere. On Flat, the profile's independently configurable `occlusionRadius` remains separate from that geometric placement scale. Height and radius overrides that disagree with the model are rejected by `projectTowerScene`. The field must be constructed with the matching geometry, observer height, radius and optical profile; as of 104 these configuration fields are intentionally encapsulated in the field instance and cannot be introspected.

### Conservative outline subdivision

Every 3D primitive edge is assessed at endpoints and recursively at midpoints. Two *visible* ends are not sufficient to draw a segment: a hidden midpoint divides it. Two *blocked* ends can still contain a visible middle portion. An accepted segment needs the midpoint to be visible and its angular linearisation deviation to be within `angularTolerance` (default `1e-5` rad). An unresolved, grazing (`indeterminate`) or numerically failed (`solver_failed`) region is **not painted as visible**. Subdivision stops at configurable `boundaryTolerance` (default `0.1` m of world chord), `maximumDepth` (default 16) or a per-projection `maxSamples` budget (default 40,000). Returns `unresolved` diagnostics for pieces that cannot be certified by sampled checks.

The validity of every sampled point is inherited from the physically integrated first-ground-hit solver; an interpolated field cell is only accepted after its own sampled certification (104). This does **not** prove the status or angular error across an arbitrary unsampled interval. Both levels deliberately provide empirical refinement, not global topology/error bounds for arbitrary atmospheric profiles.

### Tests

`node --test tests/OpticalTowerSilhouette106.test.js` covers real geometry of both banks, flat/globe coordinate transformations, vacuum line/sphere occlusion compared with an independent geometric oracle, exact inverse-spherical horizon law, fully hidden towers, near-limb omissions, mixed/unknown visibility, a hidden middle, a visible island, maximum subdivision failure and duplicate polygon closure. The Globe and Flat analytical horizon tests deliberately use different underlying mechanisms.

## Limitations / next patch

- No filled polygons or internal surface shading: even the solid foundation is **outlined only**. The output is tower wireframe/silhouette *edges*, not a finished filled 3D mesh image.
- No tower-on-tower or self-occlusion. The **only** first-hit occluder is the opaque ground, as implemented by the target projector. Unknown segments are omitted rather than guessed.
- No Canvas, camera yaw/pitch/roll, viewport clipping, pixel stroke calibration, artist's layers or UI selector. Patch 107 should supply a dedicated opt-in physical path and keep the Legacy renderer separately selectable. Pixel geometry must respect field of view and not confuse azimuth with horizontal screen position.
- Neither this module nor the field solver guarantees capturing all ray branches in an arbitrary multipath medium. Scope remains ordinary standard stratification and the engineered smooth inverse-occlusion profiles; mirages are not being developed.
- No performance/FPS claims for 85 complete tower meshes: real field qualification plus per-edge subdivisions can be expensive near the horizon. Benchmark this actual workload when integrating the Canvas path, rather than extrapolating patch 105's 85 **point** proxy.
