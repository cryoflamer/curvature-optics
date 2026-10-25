# Ground-clearance tolerance diagnostic

Run `node tools/check-clearance-tolerance.js`.

This is a **vacuum-only** test against the analytic spherical tangent height
for a 15 m observer at distances 20 and 25 km. It varies the allowable
negative ray clearance (0.1, 0.05, 0.03, 0.01, 0.001, 0 metres), and repeats
with 10 m and 5 m integration steps.

`CurvatureTowerDiagnostics.solveAngle()` now accepts optional
`clearanceTolerance` (metres, finite and nonnegative). Omitting it preserves
the existing default of **0.03 m**. The diagnostic script never changes
production rendering or UI defaults.

The difference between numeric and analytic *boundary target height* is not
equal to the clearance tolerance: a small penetration at the ray's tangent
point can shift the target boundary by a larger amount. Near-zero bias at
zero tolerance in vacuum does not guarantee that zero tolerance is robust
for refracted rays or for every integration step. Avoid changing the default
without broader numerical stability and occlusion tests.
