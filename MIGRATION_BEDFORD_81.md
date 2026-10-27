# Bedford object geometry — compatch 81

`CurvatureGeometryEngine.localBedford(drawn,total,hidden,{segments})` now provides
renderer-independent local primitives for the three branches of the original
`DrawShape` Bedford (`ObjType=0`):

- First drawn marker: bridge and horizontal bar (legacy `OpenPath3D`, arc,
  polygon, two rectangles).
- Intermediate markers: yellow measuring rod and red circular head.
- Last marker, when `total > 2`: scope post, annular eyepiece and orange reticle.

The caller **must** pass `drawn` and `total` explicitly to `localObject` or
`createPlacedObjectScene` (`metadata: {drawn,total}`). The geometry engine does
not infer the branch from the object bank or live UI state. For `total <= 2`,
there is no scope, matching the legacy branch conditions.

Curved primitives are sampled at a fixed, caller-configurable **even** number
of segments (default 64). The scope annulus is emitted as separate quads so
its central opening remains transparent; it is not a white circle. Unlike the
original `GraphX3DX` arcs, this tessellation is independent of camera pixel
resolution. Consequently, it preserves analytic curve parameters and intended
appearance but is **not** expected to produce pixel-identical legacy curves.

The bridge's arc and polygon are merged into one primitive; path composition
is not yet a first-class SceneFrame operation. The new primitives are opt-in;
production `DrawModel()` and diagnostic presets are unchanged. The existing
`towerSequence()` intentionally remains tower-only; general object sequencing
with Bedford's branch context is a separate migration step.
