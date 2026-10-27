# Full-scene rendering parity: diagnostic 32 (#91)

The full-scene diagnostic produced Globe dark-pixel IoU of 0.1275 (near) and
0.0358 (far), while tower-only parity was already high. Inspection of the actual
RGBA images (composited over white) and the original `DrawModel()` revealed a
**painter-order regression** in `CurvatureIndependentComposition.composeFull()`.

Original `DrawModel()` Globe order:
1. Distant objects are drawn and, only if any were drawn, covered by the white
   horizon disk (`DrawObjectsBehindHorizon`).
2. Globe/plane-projected latitude and longitude guides are drawn **on top of**
   the disk.
3. Optional projected horizon, globe horizon and tangent are drawn.
4. Foreground objects are drawn.

The independent full composition incorrectly placed step 2 before the disk,
so the opaque disk erased most of the grid. It also painted the globe horizon
circle twice (once in `createHorizonScenes`, again in `globeHorizonGuides`), and
repainted both flat equator rings in `createHorizonScenes` and
`flatSurfaceGuides`. The full path now emits each outline exactly once, while
keeping the older partial scene outline intact. The flat outer ring keeps
its original two-pixel line width. Circular guide polygons now explicitly close
in the diagnostic stroke projector (without closing latitude polylines),
including the last-to-first segment previously omitted. The full globe and partial scene no longer
emit a mask if no distant object requires occlusion.

`CurvatureFullLayerParity.test.js` checks the ordering, conditional mask,
absence of redundant outlines, and flat ring widths. These are deterministic
world-scene tests, not claims of pixel parity. **Remaining limitations:**
legacy camera-dependent tessellation, text, frame, nonported objects and optical
overlays. A fresh geometry-diagnostics ZIP from the one-click exporter is needed
to measure the actual new IoU values; numbers from diagnostic 32 are a baseline.
