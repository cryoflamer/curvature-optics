# Migration 85 — spherical and projected grid guides

`CurvatureGeometryEngine.globeSurfaceGuides(model)` independently builds the latitude and longitude polyline geometry from the Globe branch of `DrawModel()`. It uses the original `aDip`, `aDelta`, `hDisk`, `geometryRadius`, and `Height` expressions and both original coordinate mappings (`PointOnEarth` and `PointOnPlane`). `showGrid & 1` enables the spherical guides; `showGrid & 2` enables their flat projections.

The resulting primitives are renderer-independent world-space polygons with `mode: 1`, explicit colors, alpha, and semantic metadata. No live model is mutated. They are visual guides, **not** a physical surface mesh. The original renderer remains active. Camera-dependent tessellation, clipping and pixel-level equivalence have not been established; horizon circles and tangent guides are separate migration work.
