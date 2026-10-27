# 110 — Physical ground horizon and guide projection

The previous Physical shared painter copied `surface-guides` and `horizon-guides` from `composeOpticalMain` without any optical transformation. Towers were refracted; the bright blue geometric horizon was not. The copy has been replaced by `CurvaturePhysicalGroundGuides`, an **optical scene adapter** upstream of the unchanged `CurvatureFrameRenderer`.

## Scope

- Determine a ground-visible interval using the same `CurvatureTargetProjection.solve` as the object/ground clipping path. Bracket the first non-visible sample and bisect (24 iterations). `visible` is not conflated with `solver_failed` or grazing `indeterminate`. The reported transition is thus a sampled/bracketed boundary, **not** a proof of unique global multipath behavior.
- The axisymmetric stratified profile allows 32 radial shooting samples to be shared by the ground grid in every azimuth. The grid uses segmented world-space paths, converted to ray arrival directions with the same perspective camera used for towers. Paths outside the resolved horizon are omitted instead of remaining geometric blue traces.
- Build an explicit 128-segment optical-horizon ring at the last safely visible ground sample. The legacy geometric horizon and tangent strokes are not passed to the Physical painter. This is a *line* on the optical silhouette, not an opaque horizon disk.
- Globe: physically project actual Globe ground guides. The auxiliary projected *flat comparison grid* is not Globe ground and is deliberately omitted from the Physical path. Flat: project its ground rings/radials. `Vacuum` uses exact analytic point angles.
- Flat standard/vacuum do not use the finite-horizon bracket search; a null finite horizon in diagnostics must **not** be interpreted as a global mathematical theorem for all atmospheres.
- Physical scene remains the same `CurvatureFrameRenderer` and keeps both tower groups. Optical geometry, including ground guides, is cached with the atmospheric/scene key. Camera pan does not cause extra ray solves.
- Latin-1 `CurvatureApp.html` is intentionally preserved (legacy asset encoding). A UTF-8 middle dot in an option is now `&middot;`; runtime diagnostics use ASCII ` | ` so the browser no longer displays `Â`.

## Acceptance checks

1. Open `TrnsmLine`, Globe, physical shared scene, observer height 15 m; leave `showGrid` enabled.
2. `Vacuum`: both tower groups should be present, and the diagnostic should report **optical horizon ~13.82 km**. The former plain geometric circle is no longer copied.
3. `Standard`: both tower groups should remain; diagnostic should report **optical horizon ~16.00 km** and **ground ray solves**. Horizon position should visibly change relative to Vacuum, without switching painter or camera.
4. `Flat` with `inverse-spherical`, comparison R = 6,371,000 m: an engineered **physical horizon ~13.82 km** is expected at 15 m. Flat vacuum should report no resolved finite horizon.
5. Spin camera: the diagnostic should report cached optics. Test surface guide paths near the horizon and ensure no blue geometrical ground grid extends past physical visibility.
6. Check the engine option text and status for absence of `Â` artifacts.

## Known limitations

- Surface grid curves are **piecewise-sampled** (six samples per authored edge), with radial angular interpolation from 32 points. They are **visual guides**, not error-certified mesh edges; for high-precision measurements directly query the target shooter.
- The horizon circle uses a near-last-visible ray, not an exact analytic tangent solution for every profile. Numerical grazing behavior still merits dedicated boundary tests.
- No physical surface filling, z-buffer mutual occlusion, or physically clipped filled tower polygons. Existing 130 narrow tower-boundary `unresolved` leaves are not solved here.
- Globe comparison-plane guides and non-ground tangent annotations are excluded, not refracted as if they belonged to Globe ground.
- Atmospheric horizon is not derived from arbitrary observer/camera rotation; it is derived from the stratified optical model, while its screen position uses the existing camera.
