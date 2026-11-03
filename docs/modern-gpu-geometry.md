# #140.2 — Experimental WebGL2 geometry painter

## Purpose and boundaries

**Display → Geometry renderer** has two explicit choices:

- **Canvas 2D · reference** (default): the existing painter, unchanged.
- **WebGL2 · experimental**: triangulated fills and projected stroke segments are
  rasterized by WebGL2, then the offscreen WebGL canvas is copied with
  `CanvasRenderingContext2D.drawImage` into the same physical Canvas.

Both paths share the exact same CPU physical scene, optical ray field, camera,
visibility, clipping, triangle construction and command ordering. The new
backend does **not** accelerate ray tracing, triangulation, projection, frame
serialization or screen-space-guide LOD. Annotations and atmospheric shimmer
remain outside the physical painter as before. The experimental backend is a
manual session-only choice; experiment presets, URLs and persistence are not
changed. Scene and both Compare viewports use the same selected backend.

This is a **measurement prototype**, not an automatic speed upgrade. Each
WebGL frame requires CPU-side vertex buffers, WebGL uploads and an offscreen
WebGL-to-Canvas compositing step. These costs may exceed the old Canvas painter
for some scenes. The `canvasMs` profiling stage is **CPU wall time spent in
rasterization and Canvas presentation**, not shader execution time. The optional
`gpuDrawMs` profiling statistic still concerns the *Atmospheric Shimmer* pass,
not this geometry painter.

## Known limitations and fallback

- Stroke segments are rendered as screen-space quads with butt ends rather
  than Canvas 2D's continuous paths and round line joins. Small differences
  around bends, clipped segment endpoints, coverage and antialiasing are expected.
- The GPU mode implements painter order, not a new depth-occlusion algorithm.
  Fill triangles are the same CPU triangles and receive the same source order.
- Supported paint colors are common CSS hex, RGB(A), and known named colors.
  Unrecognized styles or failed WebGL calls cause a **whole-frame** fallback
  to the existing Canvas 2D painter, with a visible reason in Display.
- Loss of the offscreen WebGL2 context causes Canvas fallback until recovery.
  No graphics resource is moved from the existing atmospheric shimmer.
- Browser hardware acceleration is not proven by successful WebGL creation;
  software renderers can be slower. GPU execution times are not measured by
  the CPU wall-clock stage. No p95 or speedup claim is made without user measurements.

## Manual browser acceptance in Opera

1. Apply patch and use Ctrl+F5; in **Display → GPU capabilities**, run Check GPU.
2. Start with **Canvas 2D · reference** and a fixed Scene camera and atmosphere.
   Record 10–20 *cached-optics* redraws, stop recording and export JSON.
3. Switch **Display → Geometry renderer → WebGL2 · experimental**. Inspect
   **Active** status (must say WebGL2, not Canvas fallback). Repeat the same
   redraws and export another JSON; the reported painting stage is CPU wall time.
4. Compare tower outlines, fills, guide lines and perspective at the same
   scale. Check camera drag, resize, Atmospheric Shimmer on/off, and Compare A/B.
5. Force test fallback using browser GPU blocking if desired. The physical
   Canvas must remain usable and the status must explain the fallback.
6. Return to Canvas 2D at any time. Compare the outputs visually (pixel-perfect
   equality is *not* expected because of different rasterization semantics).

Automated Node tests exercise the selected mode, command-order geometry,
GPU command submission through a mocked WebGL2 context and fallback. Browser
pixel rendering was not automatically verified in this environment: Chromium
navigation was blocked by administrator policy. Real Opera results are needed
before considering backend selection or zero-copy work in #140.3.
