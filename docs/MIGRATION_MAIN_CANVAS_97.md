# Compatсh 97 — independent painter on the primary Canvas

The renderer selector in the page toolbar now has **two independent controls**:

- **Canvas engine**: Legacy (default) / Independent (preview).
- **Optical comparison**: Original / Optical P4 / Both. This is **not** a choice of Canvas engine.

The optional `CurvatureMainCanvasRenderer` builds the scene from
`CurvatureIndependentComposition.composeFull()`, validates it with
`CurvatureRenderFrame`, and sends the same canvas to `CurvatureFrameRenderer`
in `painter` mode. It does **not** invoke `DrawModel()` or replay legacy
commands. GraphX3DX retains ownership of the main Canvas and the viewport
window mapping needed to project against the existing camera. The callback
uses `CurveApp` camera inputs and the current Canvas backing dimensions;
its 2D context transform is temporarily reset for pixel-space painting and
restored after painting, including on failures.

The existing `DrawModelWithOptionalAudit()` is still used for the Legacy
mode and for every one-shot legacy diagnostic capture/export, regardless of
the selected Canvas engine. An exception from Independent causes an explicit
status message and a reset/Legacy repaint. `Globe` and `Flat` work as separate
modes. `Both` explicitly falls back to Legacy because the current independent
full composition is a single-geometry view, not a side-by-side compositor.

## Current limitations

Independent is an **experimental partial composition**, not a replacement
for the complete legacy screen. It renders one object group with the
supported world-space scene and guide layers. Additional groups, screen data
annotations, certain unsupported object types, and Optical P4 overlays are
**not** fully ported; the toolbar tells users this when Independent is active.
The independent painter uses ordered horizon masking, not physical Z-buffer
occlusion. No pixel-identical legacy parity or full physical equivalence is
claimed by this patch. The optical model selector remains unchanged, but its
optical overlays are not represented in Independent; choose Legacy to use
those comparisons.

## Browser verification

1. Open `CurvatureApp.html` in a browser. Canvas engine initially reads
   `Legacy`. Verify the familiar original drawing and controls.
2. Choose `Independent (preview)`. Verify that the **main** Canvas changes and
   the incomplete-preview notice is displayed. Try `Globe`, then `Flat`, and
   change Height, Pan, and Nick. Return to `Legacy` and compare.
3. Select `Both` in the Earth mode. Expect the notice `Both uses Legacy`
   and the Legacy drawing, not an incomplete independent split view.
4. With `Independent` selected, click **Export geometry diagnostics (ZIP)**
   under Advanced diagnostics. It still uses a *real legacy* capture and should
   produce the usual ZIP. Check the JavaScript console for errors.
5. Try the separate Optical comparison control **while Legacy is selected**;
   its existing behavior should remain unchanged.

Automated unit/integration tests: `node --test tests/*.test.js`. Browser
smoke testing should still be done manually; CI tests only provide a mocked
Canvas rendering check, not interactive visual equivalence.

Next: compatсh 98 adds **independent physics/geometry regression checks** and
invariants beyond image comparisons.
