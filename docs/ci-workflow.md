# CI verification policy

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
