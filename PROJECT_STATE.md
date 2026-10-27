# Curvature optics migration — project state

Updated at compatpatch **99** (2026-10-27). Refresh after approximately every 5–10 patches **and** after major architectural decisions. This file is a compact handoff, not a substitute for focused patch documentation.

## Objective

An independently computed physical comparison of Globe and Flat observations: world geometry + atmospheric refractive index `n(h)` + ray equations + first-hit visibility produce the image, **without hardcoding a horizon law or using the legacy horizon occlusion mask**.

## Current baseline

- Latest migration milestone: **99**, read-only optics/core audit (`docs/MIGRATION_OPTICS_AUDIT_99.md`). It does not modify runtime behavior.
- Recent sequence: 95 runtime extraction, 96 render-frame/renderer contract, 97 main Canvas preview, 97.1 two active object groups, 97.2 horizon tessellation and stroke styles, 98 independent vacuum/geometry regression, 99 core audit.
- Legacy DrawModel remains selectable/default; Independent painter preview handles Globe and Flat separately, both supported object groups, with some overlays/annotations absent. `Both` uses Legacy fallback.
- Independent geometric composition uses an ordered horizon disk/mask for presentation; this is **not** physical ray-derived occlusion.
- Numerical `CurvatureRayTracer` already exists (2D RK4, vacuum/standard/custom `n(h)`), but is **not** the physical primary-Canvas renderer. Optical P4 diagnostics/overlays and effective-radius `legacy-k` are separate mechanisms.
- Patch 98 reports a 270-test baseline (verify against the current environment and log results of future patches).

## Source of truth / workflow

Only use the user-supplied `chatgpt-pack-*` archive (choose the explicitly named pack, otherwise newest timestamp). Unpack it into a temporary Git workspace and apply outstanding compatpatches **in sequence** before making further changes. Never mix packs or reconstruct missing files by guessing. Make one focused commit and distribute as Git `format-patch` (prefer ZIP containing `.patch`); use the repository Git author and English passive-voice commit subject. Test on a clean reapplication. Include in chat: commit subject, validation, browser-check instructions if needed, and next patch preview.

## Invariants / guardrails

- Do not conflate `Canvas engine`, `Optical comparison` and optical physics/profile selection.
- Vacuum means straight optical rays, regardless of surface geometry.
- Solver `no solution` is not proof of physical occlusion; distinguish numerical failure from blocked geometry.
- `legacy-k` effective radius is a proxy, **not** a numerical `n(h)` ray solution.
- Keep camera/units explicit: metres, radians, tangent-plane reference.
- Geometry tests and physical ray-intersection oracles take priority over pixel equality.

## Open limitations

2D/3D coupling, ground event accuracy, lack of adaptive error control, multi-path completeness, physical mesh intersections, and ray-driven main Canvas visibility. Details and proposed interface contracts: `docs/MIGRATION_OPTICS_AUDIT_99.md`.

## Next steps

100: qualify/reuse existing 2D integrator against analytic vacuum geometry and numerical convergence. 101: first-hit physical ground/target intersection. 102: atmospheric validation. 103+: controlled physical rendering and 3D integration, scoped after tests. Recommended effort: Medium for isolated audits/docs; High for changes involving numerical physics, near-horizon geometry or 2D-to-3D visibility.
