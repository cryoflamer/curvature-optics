# Patch 111 — bounded Flat ground-guide rendering

## Root cause and scope

The authored Flat reference grid can extend to `2*rFEarth` (~20,015 km). Patch 110's radial interpolation table only covers the first 100 km; every later sample was sent directly to `OpticalTargetProjection.solve()`. Six subdivisions of each far source edge produced ~29,745 ground-solver calls in the user's Standard scene, despite the visible towers spanning kilometres.

The physical Earth model and actual tower visibility are **not** clipped at 100 km. The new 100 km default is a **presentation-only extent for ground guide lines**; it is independent from `horizonDistance` and never interpreted as proof of occlusion. Globe physical horizon computation remains unchanged. The existing finite-horizon engineering profiles still use their own visibility boundary.

## Implementation

- Flat ground-guide source segments, including closed circular polygon edges, are clipped against the guide-drawing disk in WORLD coordinates *before* expensive optical calls. Chords are retained when their endpoints are outside but their interior intersects the disk.
- Subdivision of retained Flat edges is bounded by their retained length (up to 6 divisions per edge). The Globe subdivision remains unchanged. The table and horizon still feed the same physical point projection; there is no legacy horizon mask.
- A radial query outside the Flat guide drawing extent returns no *guide point*, not a `blocked` status for real objects.
- Status reports skipped and clipped guide edges and explicitly identifies the limit as a drawing extent rather than an optical horizon.
- No new rendering engine, no geometry changes to towers, and no changes to the RK4 solver.

## Validation and restrictions

Run `node --test tests/PhysicalGroundGuideExtent111.test.js tests/PhysicalGroundGuides110.test.js` and, where environment time permits, `node --test tests/*.test.js`. Test cases cover clipped crossing chords, rejected distant rings, unchanged Flat standard no-horizon semantics, engineered profile horizon, and both object banks.

For browser acceptance: open `TrnsmLine`, switch to Physical + Flat + Standard. The initial ground grid must not stall for tens of seconds; the status should report the drawing extent and number of skipped/clipped edges. Check that both tower groups remain visible. Switch to Globe + Standard and Flat + inverse-spherical to verify their finite physical horizons. The extent is a temporary conservative rendering policy, **not viewport-aware adaptive sampling**. A future improvement can choose a camera/frustum-dependent extent with certified clipping and subpixel screen error.
