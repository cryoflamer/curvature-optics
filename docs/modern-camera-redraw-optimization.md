# 137.3 — Physical frame handoff optimization

## Problem, baseline and deliberately limited scope

Modern Scene and both Compare viewports use `CurvatureMainCanvasRenderer.renderPhysical`.
The warm-cache comparison reported by the user before this patch was approximately
64.7 ms for a Compare redraw (32.5 ms for A, 30.9 ms for B). Those are **user-browser
measurements**, not reproducible timing promises for this patch.

Source inspection showed avoidable frame serialization in the shared physical
painter path:

1. `frames.fromComposition()` copied the scene, then the `SceneContract` copied it
   again while validating geometry.
2. `renderer.render(frame)` called `frames.validate(frame)`, serializing and
   checking the just-built frame a second time before painting it.

The optimization here addresses that frame handoff **only**. It does not cache
camera-dependent projections or change atmospheric physics, guide LOD,
triangulation, ordering, canvas primitives or the drag preview.

## Implementation and safety boundary

- `CurvatureRenderFrame.fromScene()` now makes one owned, strict, serializable
  deep copy and transfers *that private copy* to `SceneContract.adoptScene()`.
  `adoptScene()` performs the same point/mode/type validation as `createScene()`.
  The input scene and camera remain isolated from the returned snapshot.
- `CurvatureFrameRenderer.renderComposition(canvas,composition,camera,width,height,options)`
  is an atomic one-shot entrypoint that creates and validates a fresh frame
  and immediately paints it. It never accepts a reusable 'trusted' frame or
  `skipValidation` flag from an external caller.
- `CurvatureFrameRenderer.render(canvas,frame,options)` remains fully defensive:
  a frame modified after construction is validated afresh and rejected before
  drawing when invalid.
- `CurvatureMainCanvasRenderer.renderPhysical()` uses the new entrypoint for
  Scene and both A/B Compare model sessions. The backend still computes the
  same physical composition through the same optical session.

The stage profile preserves `frameMs` including LOD and snapshot construction,
while `paintMs` now excludes the snapshot; `validationMs` reports the single
snapshot-construction validation and hence overlaps `frameMs`. Do **not** add
these overlapping stages. The summed `totalMs` still measures the real
`renderPhysical()` wall time.

## Tests and repeatable proxy benchmark

`node --test tests/*.test.js`

`node tools/benchmark-camera-redraw-1373.js 3653 15`

`node tools/benchmark-camera-redraw-1373.js 10000 8`

`tests/CameraRedraw1373.test.js` checks strict equality of Canvas command
sequences, painter statistics, layer order, frame isolation, A/B isolation,
viewport mismatch, malformed data rejection and public-frame revalidation.

On the local Node/mock Canvas machine, one representative warmed run measured:

| Synthetic primitives | Old handoff median | New atomic median | Relative reduction |
| ---: | ---: | ---: | ---: |
| 3,653 | 14.50 ms | 9.41 ms | 35.1% |
| 10,000 | 41.30 ms | 29.19 ms | 29.3% |

These are *paired warm Node execution samples*, **not** physical ray timings,
Opera visual latency, final browser FPS or guaranteed speedups. Reruns and
hardware may change the values. The previous ~64.7 ms Compare result is a
browser measurement of a substantially larger pipeline and cannot be scaled
by the percentages above.

## Browser acceptance

1. Reload the modern UI; drag vertically, horizontally and diagonally in Scene.
2. Check that the optical image is identical at the same final Pan/Nick before
   and after upgrading, including fill and guide order and the traced horizon.
3. In Compare, drag in A then B. Check synchronization and independent physics.
4. Warm optics, reset the profiler, repeatedly adjust Nick, and compare the
   medians and p95 in `CurvatureModernApp.getRenderProfile()` with the previously
   recorded baseline **at the same viewport size and settings**.
5. Inspect `stages.snapshotOnlyMs`, `stages.paintMs`, and `batches.compare.totalMs`;
   these identify frame-hand-off savings versus the remainder of the pipeline.

## Follow-up

If measured end-to-end redraw is still costly, separately profile camera-dependent
`CurvatureScreenSpaceGuides.simplify()`, triangle projection and Canvas strokes
without altering physically derived ray arrival data. Keep 137.4 perspective
preview optional and separate from exact-frame performance.
