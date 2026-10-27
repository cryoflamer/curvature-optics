# 105 — Shared optical field: measured error and time

This patch adds a reproducible **Node point-projection workload**, not a Canvas FPS benchmark and not a simulation of 85 complete tower meshes. No physical solver or renderer was changed.

Run (from repository root):

```sh
node tools/benchmark-shared-optical-field.js --profile=vacuum --grid=3
node tools/benchmark-shared-optical-field.js --profile=vacuum --grid=5
node tools/benchmark-shared-optical-field.js --profile=vacuum --grid=9
node tools/benchmark-shared-optical-field.js --profile=inverse-spherical --grid=5 --frames=2
node tools/benchmark-shared-optical-field.js --profile=standard --grid=5 --frames=2
```

The deterministic point workload uses 2, 10 or 85 individual targets (a **proxy** for object count), ranges 1000–1200 m and heights 20–22 m with observer height 15 m. These short near-horizontal rays exercise interpolation without conflating it with the horizon boundary. The grid has N×N vertices; the 2026-10-27 measurements below are representative, not guaranteed performance. Node JIT, process load and host hardware change timings. All values are emitted in JSON for future comparisons.

Important timing phases: `directMs` = repeated distinct exact projections; `warmMs` = construction/qualification of all cells; `firstMs` = sampling the first frame from an already warm field; `redrawMs` = remaining repeated samples. For `frames=3`, `redrawMs` includes **two** frames. Thus comparing `directMs` directly to `redrawMs` ignores one-time preparation and does not quantify end-to-end break-even. The benchmark also records interpolated/fallback counts, solver calls, status mismatches and maximum angular discrepancy relative to independently evaluated exact target projections.

For illustrative projection of angular errors into pixels use focal length `f = W/(2 tan(FOV/2))`; the reported `approxMaxPixelError` is `f * |delta angle|` with W=1920, horizontal FOV=60°. This is a **small-angle approximation**, not a claim about final Canvas screen displacement, and may need revision for nontrivial camera pitch, horizontal viewing direction and full 3D projection.

### Observations and trade-offs

- In tested smooth vacuum cells a 3×3 grid already yielded roughly 0.025 px maximum sampled error (85 points); a 9×9 grid reduced it to around 0.0017 px, but increased the number of exact warm-up solves from 25 to 289. Five-by-five is a reasonable *initial candidate* to test on the eventual physical scene, not a calibrated final requirement.
- Shared-field redraw is cheap when accepted cells can be interpolated, but **warming the field can be slower than directly projecting a small number of objects**. Use the cache across redraws to amortise work. Do not present cached-frame speedup without its startup cost.
- A cell's five interior checks do **not** bound interpolation error everywhere in the cell; independent points in this benchmark constitute empirical validation only. Refinement and its optimal tolerance remain workload-dependent.
- Cells crossing the surface-occlusion threshold intentionally fall back to exact shooting. A separate near-horizon regression asserts no interpolation and preservation of exact visibility status; this workload does not yet measure large near-horizon frame costs.
- The benchmark's 85 points are **not 85 full towers**. No browser rendering, geometry traversal, mesh occlusion, camera mapping, image-pixel comparison or real interactive FPS is measured. Those belong to 106–107.
- Profiles `standard` and `inverse-spherical` are available for the same reproducible measurement. The precise positive-gradient profile is a mathematical model of Globe-like grazing occlusion on Flat, not a standard physical atmosphere.

No change has been made to the shared-field acceptance algorithm or to the solver. Avoid premature grid/tolerance tuning until the real tower prism ranges, horizon proximity and viewport are available.
