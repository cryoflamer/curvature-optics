# Curvature Optics

Browser-based Earth-curvature and atmospheric-refraction visualizations, with **Modern as the primary interface**:

- **Demos** (Modern tab backed by `CurvatureDemosHost.html?embed=demos`) — nine original fast illustrated Legacy storyboards, running in their own isolated iframe. The historical `CurvatureApp.html?ui=legacy` page is retained for diagnostics and old saved links.
- **Modern** (`CurvatureModern.html`) — Scene, Compare and Demos, including physical-scene visualization with CPU ray tracing, a single **Scene** view and an independent **Compare A/B** view. Its Canvas 2D rendering path is the reference; WebGL2 geometry rasterization is an optional experimental backend.

The former standalone WebGPU optics harness and Modern's optional CPU research panel were **removed from the active tree** in #140.12.74. Neither is required to run these applications. The **Check GPU** button only reports capabilities; it does **not** perform WebGPU optical calculations. See [research archive](docs/research-archive.md) for history and recovery.

**Experimental Fast Preview:** In Modern → Scene/Compare → Display, choose
**Optical ray field → Fast Preview** to draw with cheaper approximate ray
angles. Accurate RK4 remains the default and is restored manually; the
near-horizon image may be incorrect. Fast Preview object detail can be
selected manually or adapted to measured redraw cost (`Auto`); full object
geometry remains intact in Accurate. Some profiles are not qualified and
show an explicit error instead of silently using RK4. Auto-switching during
navigation is not implemented. See [limits and tests](docs/fast-optical-preview.md).

**Modern camera navigation:** Shift + left drag moves the observer sideways and
changes eye height without changing Pan/Nick/Roll; Alt + wheel moves forward or
backward horizontally. Shift + wheel continues to zoom. The shared position is
saved with Scene/Compare experiments. See [Modern camera navigation](docs/modern-camera-navigation.md)
for coordinate semantics, spherical recentering and limitations.

## Run locally

Serve the **repository root** with a static HTTP server (Python 3 is sufficient; no npm install or bundling is required for these entry points):

```sh
cd curvature-optics
python3 -m http.server 8000
```

Open the main interface in a browser; the older URL is a compatibility entry:

| Purpose | URL |
| --- | --- |
| **Modern Scene/Compare/Demos (primary)** | <http://localhost:8000/CurvatureModern.html> |
| Historical entry (redirects to Modern) | <http://localhost:8000/CurvatureApp.html> |
| Legacy diagnostics (explicit opt-in) | <http://localhost:8000/CurvatureApp.html?ui=legacy> |
| Existing Legacy demo/state links | `CurvatureApp.html?demo=...` / `CurvatureApp.html?state=...` (still Legacy) |

Bare `CurvatureApp.html` and older `?ui=modern` bookmarks redirect to `CurvatureModern.html`. Modern now keeps its own URL and generates direct Modern experiment links; no history rewrite back to Legacy. Old `?tab=`, `?demo=`, `?pos=`, `?play=`, `?state=` and `?embed=` URLs still boot the original Legacy runtime for compatibility. Direct file opening is not the recommended verification environment. A local server is also useful when testing saved links and loading scripts.

For first-time use, start with the [user guide](docs/user-guide.md). **Modern Accurate may take appreciably longer to recalculate** because it numerically traces refracted rays; it is not intended to animate every Legacy storyboard frame.

## Current project map

| Area | Primary code / contract |
| --- | --- |
| Legacy diagnostics and demonstrations | `CurvatureApp.html?ui=legacy`, `CurvatureDemosHost.html`, `src/animation/CurvatureDemos.js`, `src/app/CurvatureModel.js`, `src/legacy/` |
| Modern UI, saved configurations, routing | `CurvatureModern.html`, `src/ui/modern/`, `src/ui/modern/ModernRoute.js` |
| Physical optics | `src/optics/OpticalRayTracer.js`, `OpticalTargetProjection.js`, `OpticalSharedRayField.js`, `CurvaturePhysicalSceneOptics.js` |
| Geometry, scene and rendering | `src/geometry/`, `src/scene/`, `src/renderers/`, `src/app/CurvatureMainCanvasRenderer.js` |
| Regression tests and references | `tests/`, `tests/fixtures/legacy-browser-references.zip` |

The modules are **not** partitioned purely by directory: for example, `src/legacy/GraphX3DX.js` is loaded by **both** interfaces. Do not remove a file solely because of its path or its name.

## Documentation

- [Architecture](docs/architecture.md) — entry points, module ownership, data flow, retained/archived boundaries.
- [Physics and numerical methods](docs/physics.md) — surface geometry, atmospheric models, RK4, shooting, and limits of validation.
- [Fast optical preview](docs/fast-optical-preview.md) — experimental manual Display → Optical ray field, adaptive Preview-only tower LOD, exact RK4 isolation, unsupported profiles and validation limits.
- [User guide](docs/user-guide.md) — Legacy storyboards, Modern Scene/Compare, rendering, URLs and saved scenes.
- [Development and tests](docs/development.md) — no-build workflow, test commands, preserved baselines and contribution rules.
- [Research archive](docs/research-archive.md) — CPU/WebGPU research removed from the active tree and Git worktree recovery.
- [Historical documentation](docs/historical-records.md) — superseded migration/patch notes and Git recovery instructions.

Superseded migration and patch-by-patch documents were retired from the active tree in #140.12.76. See [historical records and recovery](docs/historical-records.md) for the removal inventory and Git commands to read them. `PROJECT_STATE.md` remains a historical journal, not the current project specification. Focused technical evidence and documents used by regression tests were retained.

## Quick verification

Requires **Node.js with `node --test` support** and Python 3 (standard library only):

```sh
node tools/check-refactor-closure.js
node --test tests/DocumentationConsolidation141275.test.js
```

This is an automated regression gate, **not** a substitute for checking animation, camera interaction, and appearance in the target browser. See [development](docs/development.md) for deeper checks and browser smoke tests.

## Baselines and scope

`optics-baseline-2026-11` is the historical CPU-optics baseline. The research archive is intended to be preserved as `optics-research-archive-2026-11`, an **annotated Git tag on the commit immediately before #140.12.74**; verify that it exists in **your** clone. A format-patch cannot create Git tags. Archived Legacy browser PNGs are **observations of Legacy output**, not measurements of physical correctness or proof of Modern pixel parity.

## Modern Demos — all nine original animations (#140.12.78)

In Modern, the **Demos** tab embeds all nine original Legacy animation families. Choose a demonstration, then use Play/Pause, Previous/Next and Restart controls. This is one isolated, lazily loaded iframe backed by the original fast Legacy renderer—not a conversion to RK4. Switching families stops playback and starts the selected demonstration at its first key state. Scene/Compare and opt-in Legacy diagnostics (`CurvatureApp.html?ui=legacy`) continue to work. See [user guide](docs/user-guide.md).

### Temperature gradient in Modern (#140.12.94)

In **Scene/Compare → Atmosphere**, select **Temperature gradient · hydrostatic** to control surface temperature (°C), local surface lapse rate (K/km) and pressure (hPa). In Compare, A and B have **independent** temperature atmospheres; atmospheric extinction/haze remains shared. **Display → Show temperature column (0–2 km)** overlays a switchable color column on each temperature-model image. It is a visual altitude legend, not a change to rays or a pixel-aligned height map. The settings and toggle are saved in experiment URLs/JSON. Existing fixed Standard and Legacy optics are unchanged. Read [the model's physics, validity domain and caveats](docs/temperature-gradient-modern.md) before interpreting inversion experiments.

## #140.12.97 — Inverse temperature atmosphere (Modern)

For an engineered exponential ray field, **Atmosphere → Inverse atmosphere · required temperature** derives the dry-hydrostatic `T(h)` and `dT/dh` that would be needed, including a zero-K validity boundary. The surface gradient can be edited directly or via an equivalent transition slider; A/B and experiment URLs are independent and backwards-compatible. Details, equations, warnings, and an Opera test guide: [`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).

### Inverse atmosphere slider responsiveness

The **Inverse target strength** slider now previews the surface gradient, sampled temperatures and optional color column while it is moving. This draft updates **only** the controls/legend: the image is deliberately not traced until pointer release (keyboard edits coalesce after a short pause). In **Compare**, a changed A/B temperature or transition parameter redraws only the edited viewport when the layout is unchanged; shared camera/objects and layout changes still redraw both. The bottom-of-Compare timing message distinguishes a skipped unchanged view from computed work and reports CPU wall times. The existing **Display → Render profiler** provides a more detailed optics-vs-Canvas breakdown. The inverse RK4 solver, atmospheric formulas, numerical tolerances, and saved experiment schema are unchanged.

### Inverse atmosphere optical performance

The prepared Modern inverse-temperature tracer now evaluates `d(ln n)/dh` in
one pass, omitting repeated inverse-temperature integral calculations on the
RK4 hot path. At the engineered 100% endpoint, the exact gradient is `1/R`.
The independent raw `n(h), dn(h)` diagnostic functions, integrator, precision,
visibility tests and temperature display are preserved. On the local 200-tower
Node benchmark the optics stage improved by about 8× at 100% and 3× at 50%.
Actual Opera wall times may differ. Reproduce with
`node tools/benchmark-inverse-optics.js --towers=200 --weight=1` or
`--weight=0.5`; compare against **B optics** in Compare. Details and checks:
[`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).


**Optimization status:** The inverse-atmosphere performance pass is complete
for now. Opera measurements for 200 towers were 647 ms B optics at 100% and
2462 ms at 50%; remaining intermediate-blend and non-optics overhead work is
tracked as a **deferred, low-priority TODO** in
[`docs/inverse-temperature-modern.md`](docs/inverse-temperature-modern.md).

### Modern camera navigation and saved poses

Modern Scene and Compare support W/A/S/D horizontal movement, Q/E height, and
arrow-key Pan/Nick after focusing the viewport. Shift/Ctrl adjust navigation
speed; optical recomputation occurs on release. The Camera panel exposes exact
East/North coordinates, movement/turn rates, Alt-wheel step and up to 20 named
camera poses. Poses round-trip with Modern experiments and leave physical A/B
settings unchanged. See [`docs/modern-camera-navigation.md`](docs/modern-camera-navigation.md).
