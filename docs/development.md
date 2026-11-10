# Development and verification

This is the workflow for the **post-#140.12.74 active branch**. Use [architecture](architecture.md) for module ownership, [physics](physics.md) for assumptions and [user guide](user-guide.md) for visible behavior. Historical patch notes in `docs/` and the long `PROJECT_STATE.md` are not a substitute for checking current source.

## Requirements and local workflow

- **Python 3**, for the root-level static server and standard-library Legacy PNG verifier.
- **Node.js** supporting `node --test`, for the repository's CommonJS/VM-based tests and check scripts.
- A modern browser (Opera/Chromium is the historical reference environment) for manual UI and Canvas/WebGL2 smoke checks. An actual GPU is **not** required for CPU-optics tests.

No `package.json` dependency installation, webpack build or generated HTML is necessary for the two tracked entry points:

```sh
python3 -m http.server 8000
# Open http://localhost:8000/CurvatureApp.html?ui=legacy for diagnostics
# Open http://localhost:8000/CurvatureModern.html
```

Run source checks from the repo root; tests may use relative file paths.

## Automated gates

**Fast, representative closure suite** (script is also the canonical index of its exact subprocesses):

```sh
node tools/check-refactor-closure.js --list
node tools/check-refactor-closure.js
```

**Documentation links and required behaviors:**

```sh
node --test tests/DocumentationConsolidation141275.test.js
```

**Focused physics, UI and preservation:**

```sh
node --test tests/OpticalFusedProductionPromotion141250.test.js
node --test tests/CurvaturePhysicsRegression.test.js
node --test tests/ModernPhysicalCompare.test.js
node --test tests/LegacyPreservationContract.test.js
node --test tests/ResearchArchive141274.test.js
node --test tests/LegacyDemosDirectPort.test.js
python3 tools/validate-legacy-visual-reference.py
```

For a broader regression run (potentially slow/resource-intensive):

```sh
node --test tests/*.test.js
```

**Different evidence levels:** a selected Node suite checks only its covered invariants; PNG hash/pixel validation authenticates stored browser observations; actual browser runs check layout/interactions on **that** machine. Never report a full suite, browser smoke test, WGSL compilation or numerical tolerance gate as passed unless it was actually performed.

## Manual browser acceptance before claiming release readiness

1. **Legacy:** open `CurvatureApp.html?ui=legacy`, run several demos (including TransLine and Bedford); pause/resume, step in both directions, test `?demo=TransLine&pos=5`, and try existing saved-state controls. Inspect the console.
2. **Modern Scene:** try a preset in vacuum and standard atmosphere, change curvature to exact flat, recalculate and exercise camera interaction. Note any unresolved results as unresolved, **not** necessarily invisible.
3. **Modern Compare:** verify A/B independent surface/atmosphere inputs, shared camera/objects, and scene export/import. Under **Atmosphere**, enable **Atmospheric extinction / haze** in Scene and Compare; try visibility ranges 15 km and 100 km with Globe and Flat. Compare A/B refraction settings must remain independent, but haze is one shared flag and range across both views; switching model tabs must not change either haze control. Toggling haze off restores the untouched reference colours, and changing its range must reuse cached optics. Old shared URLs should load with extinction off, while new ones retain the chosen settings. Use **Canvas 2D** first; optionally check **WebGL2** and the capability report without assuming GPU optical computing.
4. Record browser/OS, viewport size, DPR, input configuration and failure mode if reporting a bug. If exporting new Legacy references, use a **new ZIP**, never overwrite the frozen canonical archive without reviewed evidence.

## Animation Library classic-browser loading smoke test

`CurvatureModern.html` loads Animation Library as a **classic browser script**,
not as a CommonJS module. Any `require()` calls in its UMD wrapper must remain
inside the `module.exports` branch; Node-only tests can otherwise pass while
Opera fails at script evaluation, preventing IndexedDB initialization.

```sh
node --test tests/ModernAnimationLibrary.test.js
```

The focused suite executes the actual thumbnail and Animation Library source
in a VM without `module` or `require`, checks HTML dependency ordering and
round-trips a named project through a test IndexedDB implementation. It also
runs the existing Node persistence and revision tests. This **does not** replace
an Opera acceptance check: serve `CurvatureModern.html` over HTTP, prepare an
animation, select **Save animation**, reload, and use **Open** from the saved
project gallery. Verify no `ReferenceError` appears in DevTools; do not delete
existing History or browser storage to troubleshoot a loader error.

## Protected reference data

- `tests/fixtures/legacy-browser-references.zip` and `legacy-browser-reference-lock.json` freeze **six** original Opera Legacy Canvas samples (TransLine 0/4/7 and Bedford 0/3/6, zero-based source indices). The validator uses PNG CRC and byte/pixel SHA-256 plus state/model consistency. These are **Legacy regression observations** only.
- `optics-baseline-2026-11` is the prior CPU production baseline tag. `optics-research-archive-2026-11` should point to the **pre-#140.12.74** tree, when created in the target clone. Verify both independently with `git tag -l` / `git show`; Git patches do not transport tags.
- Numerical regression tests and protected physical rendering contracts must not be relaxed to make a refactor pass. Specify target profiles, sampling, tolerances and which ray branches a proposed change actually covers.

See [Legacy reference validation](legacy-visual-validation.md), [Legacy preservation](legacy-preservation-contract.md), [production promotion](fused-gradient-production-promotion.md) and [research archive](research-archive.md).

## Change discipline

- Treat current HTML script load order, modern state validation, scene-frame contracts, and Legacy transport/URL behavior as interfaces. Static reachability alone is not proof that a dynamically used function is dead.
- Separate **CPU RK4** from **WebGL2 geometry rasterization** and the **removed WebGPU optical prototype**. Keep `OpticalConformalPredictor.js` if required by `OpticalSharedRayField.js`, even if a similarly named user-facing experiment was removed.
- Preserve one canonical `CurvatureModern.html` and `CurvatureApp.html`; do not add version-numbered HTML copies to `tools/`. Old research work belongs in the archive tag, not the working app.
- For a targeted Git change, run relevant tests **before and after**, inspect `git diff --check`, document any pre-existing failures, and test clean `git am --3way` application if distributing a compatpatch. Prefer **one commit per compatpatch**. A Git format-patch can contain binary diffs but does **not** create a tag.
- Do not silently rebaseline PNGs or accept Legacy/Modern parity on filename, JSON field-name match or a visually similar screenshot. Physical correctness, numerical agreement and regression stability are distinct questions.

## Documentation lifecycle

`README.md`, `architecture.md`, `physics.md`, `user-guide.md` and this page are the **current entry points**. [Research archive](research-archive.md) documents recovery of removed CPU/WebGPU experiments. [Historical records](historical-records.md) inventories 71 retired migration/patch-note documents and explains how to recover them from Git; selected older scientific notes and test contracts remain tracked intentionally. Prefer updating current guides when implemented behavior changes instead of adding a new “plan” for every patch.
