# Compatpatch 108 — the physical engine is a scene adapter, not a painter

## Architectural correction

Previously `CurvatureMainCanvasRenderer.renderPhysical()` called the separate
`CurvaturePhysicalTowerCanvas` implementation, which painted a blank Canvas and
then drew tower outlines itself. Consequently it **never received** the
Independent painter's horizon, surface guides, other object categories, frame,
or drawing styles. This was a rendering architecture error, not a refractive
physics result.

As of 108, the opt-in Physical mode uses the **same**
`CurvatureFrameRenderer.render(..., {mode:'painter'})` and independent Canvas,
camera and decorations as the Independent mode. The two paths differ in the
**scene projection backend**, not in the renderer:

```text
                         CurvatureGeometryEngine
                                  |
                     world-space scene contract
                                  |
                  CurvatureIndependentComposition
                            /              \
                    composeMain       composeOpticalMain
                        |                    |
                geometric scene      optics-neutral scene
                   legacy mask       WITHOUT painter mask
                        |                    |
                        |           CurvaturePhysicalSceneOptics
                        |           ground-hit-clipped arrival rays
                        |                    |
                        +-------+------------+
                                |
                      CurvatureRenderFrame
                                |
                      CurvatureFrameRenderer
                                |
                           Canvas + camera
```

`composeOpticalMain()` preserves **both** independently authored object groups
(including the separate large comparison towers) and the existing surface and
horizon **guide** layers. Unlike `composeMain()` it never inserts the white
legacy horizon occlusion disk or pre-classifies objects as behind/before. In
Globe mode the geometric guide radius is derived from the *real* `rEarth`, not
the legacy effective `geometryRadius` or `rDisk` used by `legacy-k`.

`CurvaturePhysicalSceneOptics` reads the same scene, projects all object edges
in angular coordinates with the existing `OpticalTowerSilhouette` clipping,
then turns the visible ray directions into ordinary world-space line primitives
at a fixed positive radius about the observer. The common perspective renderer
handles their camera transform, near-plane clipping, viewport clipping, stroke
style and Canvas rasterization. The live guide geometry is attached to each
frame; only the optical object segments are cached between camera changes.

## Physical meaning / limitations

- **Vacuum**: constant-time analytic arrival elevation and Globe tangent
  visibility, with an independent shooting oracle comparison test. Vacuum
  projection is not allowed to timeout after 3.5 seconds; the 85+2 model
  completed in ~60–100 ms on one Node environment (not an FPS guarantee).
- **Atmospheric modes**: the shared field and bounded numerical solver still
  govern the result. A budget-limited or uncertain ray is **not** silently
  interpreted as visible or as definitively blocked. Dense atmospheric scenes
  may remain incomplete, especially near a grazing boundary.
- **Surface/horizon guides are geometric presentation** (not ray-derived
  refracted/visible surface silhouettes). In vacuum Globe the geometric
  horizon guide is positioned using the real radius and observer height.
  Flat grid rings are *not* a finite optical horizon. A refracted horizon
  must be calculated from rays in a later patch.
- **Fills are pending.** Fill-only polygons and foundations currently receive
  physically clipped outlines, but their interiors are *not* filled. Mutually
  occluded 3D shapes and mesh depth are outside 108's limited ground-only
  projection model. Legacy and Independent painter retain their old behavior.
- This is a strictly limited one-forward-branch optics model. Numerical solver
  failure is not proof of occlusion.
- The old `CurvaturePhysicalTowerCanvas` remains available for tests and
  diagnosis but is **no longer dispatched as the main Physical renderer**.

## Verification

`node --test --test-concurrency=3 tests/*.test.js`

New tests cover retained object banks and horizon guides, absence of the
legacy painter mask, guide invariance under a fake effective refraction radius,
shared frame/renderer integration, preservation of source lineage, cache
re-use with camera-only changes, analytic vacuum versus independent target
shooting, and full 85+2 tower group inclusion. The full legacy test suite must
continue to pass. Browser screenshot verification remains separate and must
not be inferred from Node tests.

## Next steps

109: browser-observed visual parity of surface guides/camera/large comparison
towers, then genuine physical **polygon fill and ray-derived surface/horizon**
without reviving a white painter mask. Optimize atmospheric field only after
visible correctness is measured.
