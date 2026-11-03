# Compatpatch 114.1 — far-to-near painter order for physical tower fills

## Observed defect

Patch 114 projected and clipped foundation polygons correctly with respect to
physical ground visibility, but `CurvaturePhysicalSceneOptics` emitted **all**
foundation fills in each tower bank followed by **all** bank outlines. The
shared Canvas painter strictly follows primitive command order. Consequently,
farther tower outlines overpainted nearer foundation fills and the foundations
appeared visually interleaved in a physically incorrect order.

## Change

- `CurvatureGeometryEngine.createObjectSequenceScene` now tags each authored
  primitive with its `objectBank` and `placedObjectIndex`. Those tags belong to
  the optics-neutral scene and do not change the geometry or the renderer.
- The physical scene adapter groups primitives by placed object across both
  banks, sorts the resulting objects **far to near** by their mean radial world
  distance from the fixed observer, and emits the certified foundation fills
  then the outlines **for each object**, not for a whole bank at once.
- Physical ground guides remain the background layer. The same shared
  `CurvatureFrameRenderer` renders the result in scene-command order.
- Existing `stats.perGroup` retains its aggregated two-bank semantics. New
  `stats.perObject` reports individual painter batches and their distances.
- This is pure draw-order composition: RK4, shared adaptive prism field,
  shooting, physical ground clipping, and rendered vertex calibration do not
  change. Pan/Nick/Roll redraws reuse the camera-independent optical cache.

## Deliberate limits

This is painter sorting for separated tower structures, **not a Z-buffer**.
Self-intersecting / interpenetrating meshes, crossing faces, and arbitrary
inter-object occlusion cannot always be resolved by one object-level distance.
Wireframe strokes still render on top of the *same* tower's opaque fill.
Foundations remain source-authored polygons, not invented tower strut plates.
The mean point radius is a practical object sorting key, not a per-pixel depth
test. The physical ground horizon and any small unresolved near-grazing leaves
are unaffected.

## Browser check

1. Load `TrnsmLine`, Physical shared scene, Globe + Standard, 85 towers.
2. Compare with patch 114: nearby foundations should cover farther drawn
   foundations/strokes where their projected images overlap; large foreground
   structures should no longer be overdrawn by distant wireframe segments.
3. Repeat in Flat + Standard, then change Pan to both sides. The painter order
   must remain stable and `optical geometry cached` should appear.
4. Test 200 towers and inspect both banks. There may be dense *legitimate*
   wireframe overlap, but foreground opaque foundations must paint last.
5. Check `stats.perGroup` (two bank entries) and `stats.perObject` (one per
   placed tower) in programmatic diagnostics. No new UI controls are required.

Tests: `node --test tests/PhysicalTowerPainterOrder1141.test.js`.
