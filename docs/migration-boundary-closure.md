# Compatpatch 116 — physical boundary closure and fill viewport validation

## Root causes

Two different observations from the #115 report must not be conflated:

1. **Zero `fill()` calls for Globe in the baseline CLI camera.** The authored
   foundation triangles exist, but the validation camera pointed outside their
   projected viewport. Centering a third camera pose on an actually emitted
   nondegenerate foundation triangle produces Canvas fill calls using the
   **same** `CurvatureFrameRenderer`. The baseline poses are retained and
   reported separately under `painterViews`: a zero count there is a camera
   framing fact, not a claim that Globe has no physical fills.
2. **130 and 276 `visibility-boundary` outline leaves.** Previous splitting
   terminated with adjacent confidently visible and blocked samples in a
   narrow physical strip. Dropping the entire strip caused small missing
   contour pieces near grazing contact, even when there was no shooting or
   integration failure.

## Conservative boundary clip (no invented ground visibility)

For a terminal edge with three monotonically ordered `visible`/`blocked`
probes, bracket the transition using the existing optical point oracle.
Refine only that local bracket while keeping **both a certified visible
sample and a certified blocked sample**. A solver-indeterminate sample in an
already sufficiently small bracket stops refinement: it is counted as a
`boundaryGrazingStops` event, not silently promoted to either visibility.
Draw the endpoint-to-last-confirmed-visible piece only after a midpoint
visibility and angular-linearity check. The remaining bracket is omitted.

`boundaryClipped` counts such terminal clips; `maxBoundaryGapMetres` and
`boundaryGapMetres` report the **physical-space omitted bracket width**.
The clip is permitted only when the complete terminal leaf is no longer
than the existing `boundaryTolerance` (0.1 m by default); successive
bisection normally brings the residual bracket below ~0.01 m. This is a
**bounded conservative world-space gap**, *not* a proof of an exact grazing
point or a universal sub-pixel screen bound. Strongly curved projections,
failed point shooting, exhausted sample budgets, wide leaves, non-monotone
samples and genuinely unresolved cases retain their previous explicit
`unresolved` status. No geometry is projected through known blocked ground.

At the reference 85+2 towers: Globe + Standard previously reported 130
unresolved leaves; now 130 bounded clips, zero unresolved and a maximum
omitted gap of ~0.0062 m. At 200+2, 276 bounded clips, two of which end
at a grazing/indeterminate sample, with maximum gap ~0.0102 m. Values and
timings are scene-dependent. Flat + Standard has zero such clips; a Flat
inverse-spherical horizon and Globe vacuum both exercise bounded closure.

## Validation and UI

Run:

```sh
node --test tests/PhysicalBoundaryClosure116.test.js tests/PhysicalValidation115.test.js
node tools/validate-physical-scene-115.js --full --json > physical-validation-116.json
```

For each scene inspect `painterViews`: `reference`, `pan`, and
`foundation-targeted`. `drawnFillCalls` is now the sum of **three** views;
use `painterViews[].fillCalls` for meaningful per-camera comparisons.
The third pose is programmatically aimed at a nondegenerate *physical*
foundation facet. It validates the painter contract, **not** the actual
interactive browser camera or the correctness of arbitrary raster occlusion.

In `TrnsmLine` → Physical → Globe + Standard, 85 towers, height 15 m,
look for `bounded boundary clips` and the maximum omitted gap in metres.
`unresolved` should be zero for the control scene, with no solver or sample
budget error. Switch to Globe Vacuum and Flat inverse-spherical to exercise
true horizon boundaries; Flat + Standard should have no invented finite
horizon. Turning Pan should reuse the optical scene. Zoom closer to a
partially covered tower to inspect the physical silhouette and the foundation
fill; an exact comparison of screenshots is still a *manual* test.

## Remaining limits

- Single-transition classification uses discrete probes; no exhaustive
  search for hidden subintervals or multipath is claimed.
- A bounded world-space gap does not itself prove a global raster pixel
  tolerance at all zooms.
- The painter implements far-to-near **tower** ordering, not per-pixel depth
  for intersecting polygon meshes.
- Foundation fills, physical horizon guides and visible strokes remain in
  the original shared painter; filled continuous ground is not implemented.
