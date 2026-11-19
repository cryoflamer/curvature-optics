# Technical debt and deferred improvements

This is the living backlog for work intentionally deferred from the active
[roadmap](modern-demo-catalog.md). It is not a patch diary or a competing roadmap.
Read it together with [PROJECT_STATE](../PROJECT_STATE.md) when resuming work.

Record a stable ID, status, category, priority, problem, expected behaviour,
possible direction and reason for deferral. IDs are never reused. Add new items
when discovered, without interrupting the current stage for non-critical work.
Defects threatening physical correctness or evidence integrity must be triaged
immediately. Review open items before closing a major stage; mark resolved
items with the resolving commit and verification rather than deleting them.
Priorities are provisional until the proposed investigation is complete.

## TD-001 — Consolidate HUD controls

- Status: open; category: UI/UX; priority: low.
- Problem: the HUD visibility checkbox is outside the HUD Appearance panel.
- Expected: group the visibility control with the other HUD settings; consider
  renaming the panel to HUD or HUD Settings because it controls more than style.
- Direction: audit Scene/Compare/Studio control ownership, existing persistence
  and synchronization; preserve values and behaviour when moving the control.
- Deferred: an interface refinement, separate from reference images and demos.

## TD-002 — Curvature-aware vertical reference lines

- Status: open; category: geometry/optical visualization; priority: medium.
- Problem: vertical reference lines currently appear as straight lines without
  the expected curvature-dependent behaviour. The user specifically wants to
  investigate upward bending for a flat-Earth configuration with upward
  concavity, and the corresponding behaviour for other geometries.
- Expected: reference-line construction and projection are consistent with the
  physical model, including the upward-concave case; do not just draw a cosmetic
  curve. Separate physical local vertical / guide definition from optical image
  projection: a physically straight object may project as a curve in refracting
  optics, but surface concavity alone does not imply a physically bent vertical.
- Direction: identify the actual guides and render path, audit local vertical,
  geometry and projection; derive expected behaviour before implementing it.
  Compare straight-ray and refracting cases, both signs of curvature and flat
  limiting cases, with numerical and visual tests. Do not silently change the
  geometry of real bridge supports or other physical scene objects.
- Deferred: research is needed to distinguish visualization debt from physical
  correctness issues. If it affects trustworthy physical outputs, reprioritize.
