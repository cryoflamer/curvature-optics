# Curvature Optics

Browser-based Earth-curvature and atmospheric-refraction visualizations, with **two deliberately different interfaces**:

- **Legacy** (`CurvatureApp.html`) — fast, interactive illustrated demonstrations and animated storyboards. Preserve its original behavior; it is not required to reproduce Modern's numerical optics.
- **Modern** (`CurvatureModern.html`) — physical-scene visualization with CPU ray tracing, a single **Scene** view and an independent **Compare A/B** view. Its Canvas 2D rendering path is the reference; WebGL2 geometry rasterization is an optional experimental backend.

The former standalone WebGPU optics harness and Modern's optional CPU research panel were **removed from the active tree** in #140.12.74. Neither is required to run these applications. The **Check GPU** button only reports capabilities; it does **not** perform WebGPU optical calculations. See [research archive](docs/research-archive.md) for history and recovery.

## Run locally

Serve the **repository root** with a static HTTP server (Python 3 is sufficient; no npm install or bundling is required for these entry points):

```sh
cd curvature-optics
python3 -m http.server 8000
```

Open one of the following in a browser:

| Purpose | URL |
| --- | --- |
| Legacy animations | <http://localhost:8000/CurvatureApp.html> |
| Modern Scene/Compare | <http://localhost:8000/CurvatureModern.html> |
| Canonical Modern link | <http://localhost:8000/CurvatureApp.html?ui=modern> |

The canonical link redirects to the separate Modern document; the Modern document may rewrite the visible URL back to the canonical form. Direct file opening is not the recommended verification environment. A local server is also useful when testing saved links and loading scripts.

For first-time use, start with the [user guide](docs/user-guide.md). **Modern may take appreciably longer to recalculate** because it numerically traces refracted rays; it is not intended to animate every Legacy storyboard frame.

## Current project map

| Area | Primary code / contract |
| --- | --- |
| Legacy app and demonstrations | `CurvatureApp.html`, `src/animation/CurvatureDemos.js`, `src/app/CurvatureModel.js`, `src/legacy/` |
| Modern UI, saved configurations, routing | `CurvatureModern.html`, `src/ui/modern/`, `src/ui/modern/ModernRoute.js` |
| Physical optics | `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `CurvaturePhysicalSceneOptics.js` |
| Geometry, scene and rendering | `src/geometry/`, `src/scene/`, `src/renderers/`, `src/app/CurvatureMainCanvasRenderer.js` |
| Regression tests and references | `tests/`, `tests/fixtures/legacy-browser-references.zip` |

The modules are **not** partitioned purely by directory: for example, `src/legacy/GraphX3DX.js` is loaded by **both** interfaces. Do not remove a file solely because of its path or its name.

## Documentation

- [Architecture](docs/architecture.md) — entry points, module ownership, data flow, retained/archived boundaries.
- [Physics and numerical methods](docs/physics.md) — surface geometry, atmospheric models, RK4, shooting, and limits of validation.
- [User guide](docs/user-guide.md) — Legacy storyboards, Modern Scene/Compare, rendering, URLs and saved scenes.
- [Development and tests](docs/development.md) — no-build workflow, test commands, preserved baselines and contribution rules.
- [Research archive](docs/research-archive.md) — CPU/WebGPU research removed from the active tree and Git worktree recovery.

The remaining `docs/migration-*`, `docs/controlled-cleanup-*` and `PROJECT_STATE.md` files are **historical records**; some describe features that no longer ship. They are not the recommended entry point for current usage. A later documentation-cleanup change can retire redundant historical files after reviewing their references.

## Quick verification

Requires **Node.js with `node --test` support** and Python 3 (standard library only):

```sh
node tools/check-refactor-closure.js
node --test tests/DocumentationConsolidation141275.test.js
```

This is an automated regression gate, **not** a substitute for checking animation, camera interaction, and appearance in the target browser. See [development](docs/development.md) for deeper checks and browser smoke tests.

## Baselines and scope

`optics-baseline-2026-11` is the historical CPU-optics baseline. The research archive is intended to be preserved as `optics-research-archive-2026-11`, an **annotated Git tag on the commit immediately before #140.12.74**; verify that it exists in **your** clone. A format-patch cannot create Git tags. Archived Legacy browser PNGs are **observations of Legacy output**, not measurements of physical correctness or proof of Modern pixel parity.
