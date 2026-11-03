# Compatpatch 138.1 — atmospheric presentation integration boundary

## Scope

This patch introduces a **disabled-by-default** image presentation layer for the
Modern UI, with independent Scene, Compare A and Compare B slots. It does **not**
add turbulence, shader effects, animation timers, settings or a physical
`C_n²` estimate. All existing physical optics, ray caches, and camera models
remain unchanged. The disabled path returns the original GraphX3DX graph and
does not create a DOM Canvas, copy pixels or schedule work.

## Real draw boundary

`ModernApp.draw` and `drawCompare` already complete physical painting **before**
painting eye-level and traced-horizon annotations. The new optional
`presentation.capture(view, graph)` runs at that boundary:

1. The original GraphX3DX Canvas stays the authoritative physical-raster source
   and mouse/pointer target.
2. When enabled, a lazily constructed presentation Canvas captures the clean
   physical image once, without re-running the ray solver.
3. A separate transparent, equal-resolution Canvas hosts diagnostic eye-level
   and horizon annotations, unaffected by future shimmer distortion.
4. Both presentation surfaces sit above the source, ignore pointer events,
   and follow its backing dimensions and CSS size (including HiDPI).
5. When disabled or on failure, the graph is returned unchanged and source
   opacity is restored. The caller must redraw when switching the layer off
   because the previous annotations lived in the separate overlay.

`presentation.frame(view)` re-presents the existing physical source without
re-running the ray tracer or clearing the annotation layer; an injected
`present(source, target, view)` strategy may use a WebGL-backed target in 138.2.
There is **no animation loop** in 138.1.

`presentation.suspend()` temporarily shows the original Canvas and hides the
presentation during camera dragging. `resume()` restores the last completed
presentation after cancel. On the next authoritative draw, `capture()` updates
the image and resumes automatically. This protects the CSS `matrix3d` drag
preview from a stale untransformed overlay. An enabled prototype temporarily
omits diagnostic lines during dragging, rather than distorting their labels.

## Follow-up patches

- **138.2:** Replace the identity 2D image copy with a GPU presentation backed
  by a temporally coherent distortion field. It must reuse the physical image
  rather than trace optical rays per animation frame, and preserve safe fallback.
- **138.3:** Add UI controls / per-model configuration, including redraw on
  enable/disable transitions, scene/compare mode handling and save policy.
- **138.4:** Profile, test performance and refine motion/resize behavior.
- **139+:** Calibrate a physically qualified optical turbulence model rather
  than interpreting a manual shimmer slider as `C_n²`.

## Verification

`node --test tests/ModernAtmosphericPresentation1381.test.js` checks inert
OFF behavior, pre-annotation capture, independent A/B, HiDPI/resize,
source restoration, drag suspension, failure fallback and bootstrap ordering.
Run the full Node test suite to detect regressions.
