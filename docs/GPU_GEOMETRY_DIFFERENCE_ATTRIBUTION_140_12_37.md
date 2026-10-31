# #140.12.37 — Source-linked physical geometry difference attribution

## Purpose

The existing #140.12.35 / #140.12.36 operation compares real independent CPU f64 and GPU-first f32-predictor Canvas 2D frames for four camera configurations and three GPU modes. The earlier visual comparisons exposed dense triangular-line differences and long horizontal discontinuities. The new **diagnostic-only** pass records the actual optical geometry the renderer hands to the painter and captures the unresolved outline/fill leaves that led to omitted geometry. It does **not** try to fix shooting, infer a physical horizon, or redefine pixel error.

## Run and artifacts

In Compare, with matched Globe/standard A and B, Canvas 2D and atmospheric shimmer disabled, click **Audit geometry attribution · CPU/GPU contours and fills · ZIP**. Output:

`curvature-compare-140.12.37-geometry-attribution.zip`

The old numeric report (`algorithm-attribution.json`) and all 44 raw/overlay/difference PNGs from #140.12.36 are retained. The numerical report additionally includes `geometryAttribution`. The ZIP additionally contains:

- `geometry/<camera>/cpu-vs-baseline-edges.png`
- `geometry/<camera>/cpu-vs-strictDirect-edges.png`
- `geometry/<camera>/unresolved-queries.json`
- `geometry/README.txt`

Four camera cases yield eight geometry edge diagrams and four rejection-trace JSON files. **Red** edges are CPU f64 and **blue** edges GPU; transparent overlap blends the colors. Fills are shown as triangle *boundaries*, not as painted colored areas. These diagrams are independently projected from the same scene primitives sent to the production Canvas painter and do not modify the frame or rerasterize its filled output. Use them alongside the existing actual-frame pixel differences.

## Data provenance

- After the optical solver completes its outline and fill processing, but before painting, the optional geometry collector reads the actual assembled `CurvaturePhysicalSceneOptics` scene and the physical camera used by `CurvatureMainCanvasRenderer`.
- Only `physical-object-stroke` and `physical-object-fill` primitives are recorded. Presentation guides and axes are intentionally excluded.
- Each primitive is associated with the original `(objectLayer, opticalSourceIndex)` from the independently authored scene. Counts and approximate angular-vertex signatures are reported *per original source*. This identifies candidate source geometry with different output counts or subdivisions rather than attributing whole-frame error to a generic GPU mode.
- `OpticalTowerSilhouette` and `CurvaturePhysicalPolygonFills` emit **opt-in only** rejected-leaf callbacks with originating source ID, phase, reason, recursion depth (fills), and sampled `(distance, height, azimuth, status, reason, angle, world)` tuples. `fieldQueried` distinguishes a real optical field call from a point classified without invoking it, such as an under-ground point. Each render stores the first 500 rejected-leaf details, and **all** per-source totals/reason counts; truncation is declared.
- For each source, the diagnostic computes a bounding box of visible projected edges in camera pixels and reports the tile coordinates of intersecting high-error 4×3 frame tiles. This is **only a spatial co-occurrence aid**. Overlapping sources may associate with the same tile and counts must never be added to infer caused pixels.

## Geometry comparison semantics

The CPU and GPU project the same authored object geometry, but adaptive optical clipping and triangulation may generate different primitive counts, boundaries and vertex positions. Therefore the report includes (a) per-source outline and fill counts, (b) rejected leaves per source, and (c) unmatched *quantized angular-vertex signatures* with 2×10⁻⁶ rad rounding. Signature mismatch does **not** prove an entire triangle is missing: slightly moved and differently subdivided triangles also mismatch. Conversely a matched signature is **not** a proof of pixel-equivalent painting, intersection topology, occlusion or camera clipping.

`geometryAttribution.cases[*].comparisons.{baseline,strict,strictDirect}.bySource` is the main place to find problem sources. Examine `screenFootprint`, `intersectedHotTiles`, `cpuOnlyAngularSignatures`, `gpuOnlyAngularSignatures`, `cpuUnresolved` and `gpuUnresolved`. Use the corresponding per-camera `unresolved-queries.json` to inspect specific field statuses without claiming a physical screen location for indeterminate shots: **an indeterminate ray typically has no valid arrival angle**.

## Invariants / limitations

- All GPU-first candidates are completed before CPU frame/target oracles, as in #140.12.35. Captured data never changes statuses or sampling and never enters rendering logic.
- GPU here remains f32 RK4 predictor with a scene-derived grid, **not DS**. Canvas 2D, not GPU rasterization, paints the frame.
- No WGSL/shader changes are introduced. A browser/WebGPU runtime run is still necessary to validate actual export and capture of the four real scenes.
- No production authorization or causal decomposition is claimed. Comparison must be repeated with additional controlled interventions before selecting a new algorithm.
- Geometry footprints are conservative bounding rectangles of projected visible edges, not the pixel-perfect painted mask. Rejected leaves and unknown angles have no certified pixel projection.
