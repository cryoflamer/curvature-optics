# Migration 84: Flat surface visual guides

`CurvatureGeometryEngine.flatSurfaceGuides(model, options)` now produces independent
world-space geometry for the **Flat Earth** reference rings, concentric grid
circles and radial grid lines in `DrawModel()`.

- Plane is `z = -Height`.
- The two reference rings use radii `rFEarth` and `2*rFEarth` even with grid disabled.
- Grid circle radii follow the legacy nested thresholds at 700000, 30000,
  3000 and 300 metres. Radials use 15-degree spacing.
- Tessellation is fixed by `options.segments` (default 128), so raster pixels
  are not expected to be identical to camera-adaptive `GraphX3DX` arcs.
- These primitives are **visual guides**, not a physical flat-surface mesh.
  No globe latitude/longitude grid, camera state or Canvas integration is
  changed in this patch.
