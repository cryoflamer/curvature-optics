# Compatpatch 98 — independent geometry and vacuum-physics regressions

This patch adds `tests/CurvaturePhysicsRegression.test.js`. The tests exercise
**the existing independent world-space engine and its primary-Canvas composition**;
there are no changes to the physical model, UI, or painting algorithms. They
compare output against deliberately separate geometric/analytic references,
**not** against screenshots or the legacy drawing path.

## What is checked

1. **Spherical tangent horizon:** multiple Earth radii and observer heights;
   tangent-circle vertices remain on the spherical surface and sight rays to
   them are normal to the local surface radius (vacuum line of sight). Radius,
   depth, slant range, and observer-height monotonicity are verified.
2. **Globe versus Flat:** the tower's independent world placement is checked
   against spherical and planar coordinates at multiple distances, including
   geometric sagitta. Globe grid vertices lie on the sphere; projected and
   Flat guides lie on the observer-relative plane.
3. **Analytic visibility oracle:** a finite *straight* ray segment from the
   observer to a point is checked against the sphere by closest approach. For
   an observer 15 m above a 6,371-km-radius sphere, a 23 m tower at 25 km has
   a hidden foot but visible top; at 40 km both are hidden. The Flat model has
   no curvature horizon for ground-level or elevated objects in vacuum.
   Checks cover both sides of the analytic tangency boundary for several
   target heights.
4. **Composition invariants:** Globe uses a painter-order white horizon mask,
   whereas Flat does not. The Pontchartrain-style 85+2 tower groups are both
   present in both modes; scene ranges and world-frame indices remain valid.
   Globe's *ground-object* before/behind partition is cross-checked against
   the independent finite-ray oracle away from the tangent singularity.
5. **Effective-radius semantics:** for a positive legacy `k`, the *geometric
   effective-radius proxy* has a longer apparent horizon than the same
   geometry at `k=0`. This does **not** assert that atmospheric rays were
   numerically integrated, or that the proxy is equivalent to a physical
   index-of-refraction profile.

## What the tests do **not** prove

- No pixel-by-pixel equality with GraphX3DX/Legacy is claimed or required.
- The current painter mask is an **ordered visual occluder**, not a physical
  surface mesh or a per-pixel physical visibility oracle. The analytic segment
  tests verify geometry independently; they do not prove every tower pixel is
  correctly hidden by the painter.
- The vacuum tests use **straight rays**. Atmospheric refraction, arbitrary
  `n(h)`, the paper's inverse-profile solution, multiple-ray paths, and
  numerical ODE integration are **not** validated by these tests.
- The suite does not certify all object shapes or the Z-buffer renderer as a
  full replacement for Legacy.

## Commands

From the repository root, after applying compatpatches 97, 97.1 and 97.2:

```sh
node --test tests/CurvaturePhysicsRegression.test.js
node --test tests/*.test.js
```

These checks are deterministic and require Node.js, not a browser. There is no
necessary manual browser check for patch 98: the primary Canvas has not been
modified. Keep using the Legacy/Independent selector for optional visual
smoke tests when subsequent patches change rendering.

## Next steps

Future work can add a forward ray integrator and compare its vacuum limit to
these straight-line analytic results before testing atmospheric profiles.
That is a **separate** step from this regression-only patch.
