# Independent full composition (patch 87)

`CurvatureIndependentComposition.composeFull(model, objIx, globe, options)` is an
opt-in, world-space scene assembler. It combines the independently generated
object horizon partition, flat or globe surface guides, and (for globe) horizon
guides. It assigns consecutive `commandIndex` values and reports named layer
ranges and roles (`objects`, `visual-aid`, `occlusion`).

Globe order: behind objects → globe surface guides → occlusion mask → horizon
outline → horizon guides → before objects. Flat order: flat surface guides →
behind objects → mask (empty) → outline → before objects.

`auditFull` checks the layer structure and unique contiguous command indices.
The original `compose` and `audit` are unchanged for existing diagnostics.

This is not yet a full replacement for `DrawModel`: no camera, labels, optical
overlays or unsupported object types are generated. Guides are discretized into
world-space primitives; no pixel identity with the legacy renderer is claimed.
