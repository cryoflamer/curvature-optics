# Shared object sequence placement (compatpatch 82)

`CurvatureGeometryEngine.objectSequence(model, objectIndex, globe)` now builds
far-to-near independent scenes for Bedford (0), M-Rod (1), Ship (2), and
Tower (3). `createObjectSequenceScene` combines these primitives in drawing
order. The old tower-specific APIs are retained for compatibility.

The legacy size-variation and side-variation formulas are shared, including
two-column placement. Ship uses its legacy distinct horizontal/vertical size
scales. Bedford receives drawn/total sequence metadata for its first/middle/
last marker variants. Entries retain a `hidden` flag for behind-horizon style.

This is **opt-in** geometry. It does not change `DrawModel()` or the live UI,
and it does not yet provide the final horizon-mask composition for every
object type. In particular, the old tower-only partition and composition APIs
remain tower-specific. Pixel parity is not a requirement for tessellated curves.
