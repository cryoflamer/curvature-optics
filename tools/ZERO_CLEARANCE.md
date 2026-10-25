# Zero-clearance horizon regression

Run `node tools/check-zero-clearance.js` from the repository root.

The diagnostic solver now defaults to `clearanceTolerance: 0` (metres). An
explicit nonnegative `clearanceTolerance` remains supported for diagnostics.
The earlier 0.03 m allowance artificially lowered the visibility boundary by
about 4–5 cm for 20–25 km paths. Zero tolerance recovers the analytic vacuum
sphere horizon to within the finite binary-search precision in this test.

The test checks vacuum and an exponential standard atmosphere at 20 and 25 km,
with 5 and 10 m integration steps, 0.2 m offsets around the computed tangent
boundary, and an explicit comparison against the old 0.03 m allowance. The
atmospheric cases test numerical convergence and visibility monotonicity; the
effective-radius approximation remains an approximation, not an exact oracle.
The test does not establish accuracy for ducting or other atmospheric profiles.

Run `node tools/check-optics.js`, `node tools/check-effective-radius.js`, and
`node tools/compare-raytracers.js` for existing regressions.
