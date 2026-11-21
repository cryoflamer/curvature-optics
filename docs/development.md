# Development and verification

This is the workflow for the **post-#140.12.74 active branch**. Use [architecture](architecture.md) for module ownership, [physics](physics.md) for assumptions and [user guide](user-guide.md) for visible behavior. Historical patch notes in `docs/` are not a substitute for checking current source and the concise `PROJECT_STATE.md`.

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

**Architecture/Legacy closure suite (run only when relevant to the change; script lists its subprocesses):**

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

**Expensive full Node run — requires explicit approval:**

```sh
node --test tests/*.test.js
```

**Different evidence levels:** a selected Node suite checks only its covered invariants; PNG hash/pixel validation authenticates stored browser observations; actual browser runs check layout/interactions on **that** machine. Never report a full suite, browser smoke test, WGSL compilation or numerical tolerance gate as passed unless it was actually performed.

## GitHub Actions CI

### Single-branch development and selective verification

The single permanent working branch is `main`. Normal work is committed
directly to `main` **without Pull Requests**. Short-lived branches, including
future feature/fix branches, require explicit approval. Stable, fully
qualified baselines may be tagged deliberately; a tag is not proof of CI.

Before changing source: inspect `AGENTS.md`, `PROJECT_STATE.md`, the current
Issue, `git status`, HEAD, and relevant implementation and test boundaries.
Never force-push or rewrite public history without explicit permission.

**Default:** run the smallest meaningful subset of tests for changed modules.
For a documentation-only change, run local Markdown/link and relevant
documentation-contract tests; do not run full optics or browsers. For optics,
run targeted numerical/visibility/accuracy tests; for storage, test recovery,
compatibility and failure; for UI, test affected DOM and focused browser
behavior where feasible. Preserve original assertions and physics tolerances.

**Automatic fast CI:** `.github/workflows/ci.yml` runs on `main` pushes.
Its curated Node contracts and protected architecture/Legacy audit are **not**
the whole suite. A failed gate must be reported, not ignored. Fast CI is an
additional repository safety net, not permission to launch all tests locally.

**Full verification:** the full Node suite, complete architecture audit
and all Chromium browser smoke tests remain available in
`.github/workflows/full-verification.yml`, but run **only after explicit
approval or a separately agreed release-validation procedure**. Do not
silently launch a full local run or `workflow_dispatch scope=full`.
The full workflow has no periodic schedule, and does not run automatically
on commits. Do not claim release/readiness or close an acceptance gate whose
required tests have not been performed.

When a required check would be very expensive, first report the intended
scope and reason, and ask before invoking the full suite. Prefer bounded
targeted tests; do not skip a correctness-critical check while claiming a
validated physical result. Always report tests actually run, skipped,
pre-existing failures and pending browser/manual scientific acceptance.

An explicit full run may be triggered with:

```sh
gh workflow run ci.yml -R cryoflamer/curvature-optics --ref main -f scope=full
```

## Targeted developer commands

From the repo root (Node 22):

```sh
node --test tests/ModernCalibrationProjects.test.js
node --test tests/ModernCalibrationProjectCheckpoint.test.js
node --test tests/ModernExperimentHistory.test.js
node --test --test-name-pattern='migration' tests/ModernCalibrationProjects.test.js
node tools/check-refactor-closure.js
```

For one browser case, first install Playwright Python 1.57.0 and Chromium:

```sh
python -m unittest discover -s tests/browser -p 'test_*.py' -k test_navigation_and_studio_bootstrap -v
python tools/run-browser-smoke.py --match calibration --list
python tools/run-browser-smoke.py --match calibration
```

For all browser cases on one developer computer, omit `--match`; for the two
independent CI shards use `--shards 2 --shard 0` and `--shards 2 --shard 1`.
The runner sorts discovered test IDs, then assigns index modulo shard count.
The shards therefore have disjoint selection and cover the complete suite.
Every shard owns its own Python process and Playwright browser, preserving
per-test context/IndexedDB isolation and existing failure artifacts. It prints
the ten slowest browser cases, including their setup and teardown time.

## Qualification and measurements

Baseline full CI `44829619433` (2026-11-20): 2261 Node tests
(2260 passed, 1 skipped), 51 Chromium smoke tests and green architecture.
The workflow took about 282 seconds; Chromium itself ran for 214 seconds,
Playwright setup around 37 seconds and Node around 157 seconds. The 22 km
Gaussian-noise camera calibration qualification alone took about 107 seconds;
it remains in **full**, not fast. Individual Node TAP `duration_ms` values
remain in Actions logs, while the browser shard runner adds per-case timings.
Playwright Chromium downloads are cached in full CI; system dependencies are
still checked with `--with-deps`.

When a fast check fails, reproduce only its relevant Node file or browser case.
When a full check fails, inspect that particular job and reproduce locally
before another commit. Do not change scientific tolerances or remove coverage
merely to improve CI duration. New modules must be added deliberately to fast
coverage where appropriate; every `.test.js` stays covered by full CI.

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
an Opera acceptance check: serve `CurvatureModern.html` over HTTP, assemble a compatible animation,
click **Preview animation** to confirm playback remains separate, then choose
**Save project**. The saved gallery must expand and select the new card. Reload
and use its explicit **Open** button (the browser-autosaved draft is not the
named record). Verify no `ReferenceError` appears in DevTools; do not delete
existing History or browser storage to troubleshoot a loader error.

## Portable animation files acceptance

Use Animation Studio → Animation Library to **Export selected**, **Export all**
and **Import JSON**. The export envelope uses format
`curvature-modern-animations` v1. An imported project receives a fresh local
ID; duplicate physics and timing are reused rather than copied. Confirm the
reported created/reused counts, the restored preview and playback after F5,
and the unchanged Scene/Compare and working Studio draft. Import a file twice:
the second pass must report zero created. A malformed, unsupported-version or
oversized JSON must fail without partially importing a valid first record.

Run `node --test tests/ModernAnimationLibrary.test.js` to exercise portable
round-trips, whole-file validation, duplicate detection and UMD loading without
CommonJS globals. A successful Node VM test does **not** establish that the
Opera file chooser, download or IndexedDB behaves correctly.

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

## Backlog ownership and documentation lifecycle (Issue #28)

**GitHub Issues are the sole active backlog.** New implementation tasks, deferred technical debt, research proposals, dependencies, missing CI evidence and manual browser/scientific acceptance gates must be filed or updated there. Use [Milestones](https://github.com/cryoflamer/curvature-optics/milestones) for workstreams. Before creating a new Issue, check all open/closed Issues and source/CI evidence so old stage notes are not re-filed as new work. Separate implemented, CI-verified and manually accepted states.

Markdown files describe **durable** architecture, physics and numerical derivations, source/data/provenance contracts, limitations, reproducible experiments and supported workflows. They may link to Issues, but must not accumulate unchecked TODO roadmaps or chronological compatpatch journals. Historical notes can remain only when specifically useful for technical evidence or regression fixtures and are explicitly marked noncanonical. Recover removed plans from Git history; [historical records](historical-records.md) explains how.

When closing an Issue, retain acceptance evidence and relevant commit/CI links there. Update the current technical contract if runtime behavior changes, preserve old external URLs and original photo identities, run relative-link/documentation regressions, and never silently weaken scientific checks or claim browser tests that were not run.

## Documentation lifecycle

`README.md`, `architecture.md`, `physics.md`, `user-guide.md` and this page are the **current entry points**. [Research archive](research-archive.md) documents recovery of removed CPU/WebGPU experiments. [Historical records](historical-records.md) inventories 71 retired migration/patch-note documents and explains how to recover them from Git; selected older scientific notes and test contracts remain tracked intentionally. Prefer updating current guides when implemented behavior changes instead of adding a new “plan” for every patch.
