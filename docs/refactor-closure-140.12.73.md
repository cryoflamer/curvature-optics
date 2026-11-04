# #140.12.73 — Cleanup closure and acceptance gate

## Decision: stop routine dead-code scavenging

This patch closes the **planned** controlled-cleanup sequence, rather than
starting another numbered investigation of tiny private fields. Removing
unreferenced code is useful only when backed by evidence and proportionate to
risk. There is **no remaining mandatory sequence of cleanup compatpatches**.
Future deletions must be motivated by a specific maintenance, correctness,
performance, or architecture need—not by the next available patch number.

The completed work has established:

- Legacy animations and their route/state behavior are a separately preserved
  experience; Modern is not required to reproduce their interactive frame rate.
- Six original Opera Canvas frames are archived with verifiable checksums, as
  **Legacy regression observations**, not scientific/Modern-parity ground truth.
- Legacy/Modern script reachability, historical bundle sources and dead-code
  candidates are documented with reproducible static inventories.
- Historical Legacy source files and the independent WebGPU research page are
  **retained**; a static search is not proof that either is expendable.
- Selected obsolete Modern CSS, handlers and private state have been removed,
  while the working CPU RK4, WebGL2, Compare, Legacy demos and standalone WebGPU
  research path were intentionally preserved.
- `runConformalFrameParity141245()` no longer initializes an unused local
  `started`; the frame export, pixel comparison and diagnostic phase handling
  are unchanged.

## Single command for the automated regression baseline

From the repo root, or using the tool's absolute path:

```sh
node tools/check-refactor-closure.js --list
node tools/check-refactor-closure.js
```

The gate uses Node's built-in test runner, **Python standard library** for the
six captured PNGs, and the existing static audits. It does not rewrite a
fixture, modify a tracked file, run a build, or require Playwright. Exit code
is nonzero if any constituent check fails. The selection is a **representative
regression gate**, not a claim that every test file passes.

## Last acceptance step (manual, not another cleanup patch)

Before closing the refactor branch, open the **actual Opera browser** and
check the following behaviors on the current branch:

1. `CurvatureApp.html`: select a few Legacy demos (including TransLine and
   Bedford); start and stop animation, step forward/back, reset and verify
   a bookmarked `?demo=...&pos=...` state. Confirm visual continuity.
2. `CurvatureModern.html`: open Scene and Compare, verify the independent A/B
   viewports, camera drag, CPU optics research controls and **Check GPU** panel.
   Record any unexpected console error.
3. `tools/webgpu-optics.html`: verify the archived research page still opens.
   If WebGPU is available, compile its actual WGSL and try a baseline run;
   if not, record the limitation rather than claiming GPU coverage.
4. Keep the Git tag `optics-baseline-2026-11` available as a recovery point;
   check its existence in the **actual** target repository, because archive
   exports do not necessarily preserve tags.

If all pass, finish the cleanup/refactor task and transition to regular
maintenance or documentation. If one fails, make **one targeted repair** with
an explicitly reproduced defect. There is no need to iterate patch numbers
for further speculative code hunting.

## Limits

The automated gate cannot prove runtime reachability of dynamically injected
scripts, the smoothness of Opera animations, the numerical fidelity of all
Modern scenes, or browser-level WebGPU/WGSL compilation. CPU vs GPU parity and
performance claims require separate measurement. It is intentionally not a
substitute for the manual acceptance step above.
