# #140.7 — Forward-x shooting bracket repair and post-fix qualification

## Scope and change

The production `OpticalTargetProjection.solve()` now bounds the **angular
bracket-search probes** to the solver's pre-existing forward-x launch-angle
domain, `abs(angle) < pi/2 - 0.001`. No ray ODE, RK4 stepper, initial target
estimate, numerical tolerance, atmosphere, surface arithmetic, or ground-event
classifier was changed.

At a near-observer target below the observer, the straight-ray direction can be
very close to the lower angular boundary. Previously, the initial bracket span
was always `initialSpan` (default `0.02 rad`). If the required search direction
pointed toward the lower bound, the very first probe could be rejected for
being nearly vertical, and the solver returned `solver_failed` despite a valid
forward-x ray. #140.6 demonstrated this for 16 of 56 close targets and checked
them against independent Flat Snell-invariant calculations.

#140.7 keeps the same shooting/bisection algorithm, but computes the available
angular room **in the direction of the bracket search**. Only if the requested
first span would cross that limit does it start with one-quarter of the
available span. Subsequent doubling is capped at an interior bound
`available * (1 - 1e-9)`. Lack of a valid sign-changing bracket **still returns
`solver_failed`**; the cap must never be interpreted as evidence of visibility.
Trajectories outside the forward-x launch-angle contract remain unresolved.

This preserves the original probe sequence when already admissible. Predictor,
warm start, and the `engineered-experimental` opt-in are untouched; production
Scene and Compare continue to use bracket-first shooting by default.

The two HTML entry points version the changed physics script as
`OpticalTargetProjection.js?v=140.7` to avoid a stale cached implementation.

## Fixed regression

The existing #140.6 diagnostic has been made forward-compatible: it preserves
the known **historical** angular-overshoot classification but now verifies that
the production result is resolved. It still compares the default solver, the
opt-in predictor, a bounded-span reference, two finer RK4 step sizes, and the
independent Flat monotone-ray Snell invariant where applicable.

| #140.7 short-range diagnostic | Result |
| --- | ---: |
| Near-eye targets | 56 |
| Historical overshoot risks | 16 |
| Correctly repaired historical cases | 16 |
| Current default-solver failures in this grid | 0 |
| Independent Flat oracle comparisons | 28 |
| Unqualified local comparisons | 0 |

The separate regression tests cover the forward-x angle threshold (including
unsupported `0.001 m` targets), the 16 previously failed cases, and fixed-angle
fixtures from the #140.6 production solver for **already successful** rays.
They also check a historical nonmetric legacy-grid mismatch case.

## Post-fix CPU qualification

The unchanged #140.5 offline qualification was rerun against the modified
bracket-first reference using its **full** suite. The finite-sample outcomes
are:

| Check | Post-fix result |
| --- | ---: |
| Target-ray comparisons (near horizon + short range) | 1064/1064 |
| Active warm-start sequence checks | 3600/3600 |
| Paired full scenes (metric + legacy; Flat + Globe) | 72/72 |
| Nonmetric legacy scene mismatches | 0 |
| Baseline ray-grid RK4 calls | 59,194 |
| Opt-in experimental ray-grid RK4 calls | 37,197 |

The six nonmetric legacy-guide scene differences observed in #140.5 disappear
without changing the grid renderer. This is consistent with them being
**downstream effects of the previously unresolved short-range rays**. It is
not an independent proof that all legacy guide interpolation is physically
correct, and the legacy geometry mode itself was not rewritten.

### Reproduce

```sh
node tools/audit-shooting-bracket-1407.js --suite=smoke > bracket-1407-smoke.json
node tools/audit-shooting-bracket-1407.js --suite=full > bracket-1407-full.json
node --test tests/OpticalShootingBracket1407.test.js tests/OpticalShortRangeBranch1406.test.js
```

The audit emits `qualifiedInFiniteSample`, `globalBranchCertified`, and
`defaultPredictorPromotionAllowed` **separately**. A failing sample exits
nonzero; a passing sample does **not** promote the engineered predictor.

## What remains unproven

- The solver still searches only one forward-x shooting branch and does not
  enumerate multipath solutions, particularly near caustics and grazing rays.
- The analytic/single-quadrature Flat oracle checks **monotone downward**
  paths, not globally complete optics.
- Globe has fine-step numerical convergence checks but no independent
  multipath branch oracle.
- Rays too close to vertical for the solver's documented angular domain are
  still marked `solver_failed`, never silently inferred visible or blocked.
- A finite grid of numerical and scene comparisons cannot establish universal
  correctness; sample qualification is not permission to change defaults.
- These are **CPU** tests. No GPU timing, numerical f32 equivalence, or
  WebGPU compute implementation is claimed.

**Decision:** accept the bounded-bracket production bug fix, continue to leave
engineered predictor/warm start opt-in only, and defer default promotion until
branch-focused evidence justifies it.
