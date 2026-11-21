# Interactive rendering — preview and authoritative optics

This is a **current technical contract**, not a staged TODO list. Outstanding
browser and physics requalification is tracked by
[#32](https://github.com/cryoflamer/curvature-optics/issues/32).
The former stage-by-stage implementation journal can be recovered from
[Git history](https://github.com/cryoflamer/curvature-optics/blob/aa8b2b1a94fa72432648f2ffcec8929a90601b04/docs/interactive-rendering-migration.md).

## Ownership and quality

Modern Scene and Compare use one shared camera and separate A/B physical
surface/atmosphere configuration. Interaction can show a low-latency approximate
frame; after release, idle/settle, sequence stop, or fallback, the configured
authoritative optical painter must replace it. Animation Studio has its own
Preview lifecycle. Offline PNG/video outputs retain their explicitly selected
quality; previews must not silently change their physics or project schemas.

The Canvas Direct painter is an **approximate interactive visualization**, not
an independent validation of the RK4 optical field, visibility or subpixel
parity. Approximate frames must be labelled/understood as such. Preserve
original camera FOV, signed coordinates, source geometry, and both Compare
sides' independent physical settings.

## Capability and fallback boundary

`OpticalEffectiveRadiusPreview.canvasDirectSupport(model, options)` is a
low-cost representability gate shared by Studio and interactive Scene/Compare.
It checks the current pose/observer height, surface radius, refraction profile
and engineered target; **support does not certify image accuracy**.

- Signed Flat curvature is allowed, including supported positive virtual
  curvature; Flat Vacuum remains straight. Globe requires representable
  positive effective curvature. Invalid/nonfinite parameters, negative or
  otherwise invalid engineered targets, translations beyond the local
  domain and virtual-antipode crossing are rejected explicitly.
- The painter also checks actual signed Flat mesh-vertex geometry. A runtime
  rejection may occur after partial painting; the original fallbacks must
  restore correct frames, not leave a mixed or stale image.
- Studio retries a classified Canvas Direct rejection using full-detail
  Accurate with an explicit reason; unrelated errors remain visible.
- Scene/Compare preflight both physical sides **before** a direct frame is
  displayed. The rejecting side is identified. Unsupported interaction poses
  take the existing Fast/CSS or abort-and-restore path; no sticky rejection
  cache is allowed.
- Fast preview and the CSS composition fallback remain supported paths, not
  dead code. Preserve the 220 ms wheel idle-settle behavior, pointer capture,
  transaction cancellation and camera sequence clock.

Code ownership includes `src/ui/modern/ModernCameraDirectMotion.js`;
the historical `ModernCameraCanvasDirectDrag.js` name is retired. Do not
copy scheduling logic back into multiple Scene/Compare handlers.

## Known limits and verification policy

Canvas Direct and effective-radius previews can differ materially from
Accurate RK4 near the horizon, multiple occluders, strongly curved rays and
engineered profiles. Stage 5A numerical samples are useful diagnostics, not
universal error bounds. Browser-observed smoothness is not instrumented FPS;
a representable optical profile is not necessarily physically plausible.

Previously reported as accepted in Opera: shared pointer/wheel/keyboard
interaction, Camera Sequences and virtual Flat horizon masking. At the
pre-consolidation baseline, shared fallback policy and refactor code were
implemented, but **extreme fallback browser acceptance, complete manual
regression and representative accuracy requalification were still open**.
Follow [#32](https://github.com/cryoflamer/curvature-optics/issues/32) for
the exact gates and later evidence. Preserve Legacy isolation, final Accurate
settle, Scene/Compare A/B invariants, horizon/occlusion classification and
explicit scientific limitations. Do not loosen optical tolerances.

See [camera navigation](modern-camera-navigation.md),
[Animation preview and compatibility](modern-animation-contract.md),
[fast optical preview](fast-optical-preview.md), [physics](physics.md)
and [development verification](development.md).
