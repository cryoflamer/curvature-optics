# Project layout (compatpatch 93)

This patch moves files without changing the rendering or mathematical algorithms.
The HTML entry point remains `CurvatureApp.html`, so existing browser entry URLs remain valid.

- `src/geometry/` — geometry primitives and generators.
- `src/scene/` — scene frames, contracts, composition and frame rendering.
- `src/renderers/` — independent camera, rasterization and preview code.
- `src/legacy/` — original GraphX3DX and legacy extraction, adapters and replay tools.
- `src/diagnostics/` — audits, capture, image comparisons, export and controlled presets.
- `src/optics/` — atmospheric ray tracing, optical calibration and overlays.
- `src/ui/` — UI JavaScript and stylesheets.
- `src/` (existing) — original browser utility library; left in place.
- `tests/` — Node test files.
- `docs/` — architecture and migration notes.
- `tools/` — command-line checks and reference scripts.

The browser still uses ordered classic `<script src>` tags rather than ES modules.
Relative CommonJS imports, HTML asset paths, test fixture paths, and tool imports
were updated for the new layout. The `tools/check-optics.js` runner now discovers
its test files in `tests/`.

Run the full test suite with `node --test tests/*.test.js`. The legacy sequential
runner is also available as `node tools/check-optics.js` (and may take longer).

The pack metadata and `CHATGPT_PACK_USAGE.md` remain at the root intentionally;
those files are managed by the patch packaging workflow, not by the application.

## Parallel UI entrypoints (patch 130)

Modern UI implementation and the shared-physics contract are specified in
[`modern-ui-plan.md`](modern-ui-plan.md). `CurvatureApp.html` is still the
Legacy default; only `?ui=modern` routes to `CurvatureModern.html`. The
standalone Modern entry loads the **same physics/scene/renderer modules**,
without starting the old control/animation/diagnostic UI.

## Legacy retirement boundary

Before removing the default Legacy entry point or Legacy-only UI modules, consult the [Legacy UI retirement assessment](legacy-ui-assessment.md). Modern routing, old saved-state links and scientific comparison oracles require independent compatibility decisions.
