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

## GitHub Actions CI

### CI verification policy

Working branch: `built-in-demo`. Changes are committed directly to this branch;
PRs are not part of this workflow. Before every commit, recommend a reasoning
level (1/3, 2/3 or 3/3).

## Two speeds, no silent coverage loss

**Push / fast:** `.github/workflows/ci.yml` runs automatically after each push
to `built-in-demo`. Two parallel jobs check the existing full architecture and
Legacy preservation gate (`tools/check-refactor-closure.js`) plus a reviewed set
of short Node contracts around Modern state, Calibration Projects, verified
originals, History and animation persistence. The architecture gate already
validates the protected Legacy visual references, so there is no duplicate
Python PNG validation step. A new push may cancel an obsolete fast push run.

**Full / milestone:** `.github/workflows/full-verification.yml` retains
`node --test --test-concurrency=2 tests/*.test.js`, the entire architecture
and Legacy gate, and **every** real Chromium UI test. It runs when requested
through the existing `ci.yml` manual dispatch (`scope=full`), and when the full
workflow or its browser sharding runner is modified. Full runs are never
cancelled by subsequent development pushes. A fast green run is **not** proof
that the full suite passed; require full success before closing a milestone,
changing shared optics contracts, or making a new baseline tag.

Manual full verification (with GitHub CLI authenticated for the repository):

```sh
gh workflow run ci.yml --ref built-in-demo -f scope=full
```

In GitHub Actions, select **Curvature fast verification** > **Run workflow**,
choose **built-in-demo** and **full**. If the UI (sourced from default `main`)
does not expose the new input yet, triggering the existing `ci.yml` on
`built-in-demo` with no `scope` input also selects full (the default).
For manually re-running fast checks, use `scope=fast`.

**Nightly scheduling constraint:** `full-verification.yml` declares a daily
02:23 UTC schedule, but GitHub evaluates `schedule` triggers *only* on the
default branch, currently `main`. Until the workflow definition is also placed
on `main`, this schedule is **not active**. Do not change `main` or the default
branch silently. After that separate administrative step, scheduled jobs
explicitly check out `built-in-demo`, not `main`. The manual full route above
works from the existing `ci.yml` workflow. No cron/notification service is
being claimed as active in the meantime.

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
