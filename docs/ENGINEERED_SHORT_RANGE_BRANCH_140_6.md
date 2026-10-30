> **Historical #140.6 results.** #140.7 subsequently fixed the production
> bracket-domain overshoot. Rerunning the diagnostic on #140.7 reports **zero**
> current failures and retains 16 *historical* overshoot risks as regression
> cases. See `ENGINEERED_SHOOTING_BRACKET_REPAIR_140_7.md`.

# #140.6 — Short-range bracket diagnosis and independent branch cross-check

## Finding

The #140.5 qualification suite encountered **16 `solver_failed` references out of
56 short-distance ground targets**. All failures were at `0.1` and `0.3 m`,
with a `15 m` observer height, across both engineered refractive models, Flat
and Globe surfaces, and two atmospheric comparison radii.

The target direction is almost vertical. The production solver starts its
sign-changing bracket search at `initialSpan = 0.02 rad` and rejects any shooting
angle with `|angle| >= pi/2 - 0.001`. At these two distances the *remaining
angle margin* is only approximately `0.005667` and `0.018997 rad`; the first
probe exits the supported forward-x domain. This is a **search-step limitation**,
not evidence that there is no physical forward-x path.

No production logic, shooting selection, atmosphere, UI, or scene cache is
changed by this patch. The diagnostic reuses the production solver with its
**existing** `initialSpan` option adjusted to
`min(0.02, (pi/2 - 0.001 - abs(directionAngle))/4)` for each test target.
The reference bracket-first solver then solves all 16 formerly failed cases.

## Independent numerical and geometric checks

The offline tool `tools/diagnose-short-range-shooting-1406.js` runs the 56
near-observer cases from #140.5, recording:

1. The **untouched** original bracket-first result and its failure reason.
2. The unchanged predictor solution for comparison.
3. A bracket-first solution with the domain-aware **test-only** first span.
4. The same bounded reference with **500 m** and **125 m** RK4 step limits
   (default **2000 m**), with launch-angle, residual, status and first-ground
   event comparisons using #140.5's fail-closed ray gate.
5. For **Flat** monotone downward rays only, an independent shooting-free
   refractive-index invariant cross-check.

In flat stratified optics, horizontal optical momentum `p=n(h)cos(theta)` is
conserved along a ray. For a monotonically descending segment, the horizontal
range is

```
  x = integral(h_target..h_eye) p / sqrt(n(h)^2 - p^2) dh.
```

In the exponential atmosphere `n(h)=n0 exp(h/R)`, this is evaluated with a
**closed-form antiderivative**:

```
  x = R [asin(p/n(h_target)) - asin(p/n(h_eye))].
```

In the inverse-spherical engineered profile, Simpson quadrature integrates
the same conserved-momentum equation **without RK4 ray shooting**. Bisection
finds `p` and hence `theta_eye = -acos(p/n(h_eye))`. This oracle is intentionally
restricted to the monotone downward segment (`p < min(n)`); it neither checks
turning/multipath rays nor proves other branches cannot reach the same target.
For Globe geometry, the diagnostic currently provides only the three-level
RK4 convergence cross-check; it does **not** claim an independent analytic
branch oracle.

## Reproduce

```sh
node tools/diagnose-short-range-shooting-1406.js > short-range-1406.json
node --test tests/OpticalShortRangeBranch1406.test.js
```

The default diagnostic concludes:

| Quantity | Value |
| --- | ---: |
| Short-range target cases | 56 |
| Original bracket-first failures | 16 |
| Recovered by bounded initial span | 16 |
| Unexplained original failures | 0 |
| Independent Flat invariant checks | 28 |
| Cases passing local cross-checks | 56 |
| Global branch certification | **No** |
| Production predictor promotion | **Not allowed** |

`--step=2000 --fine-step=500 --ultra-step=125` may be changed; the CLI requires
`0 < ultraStep < fineStep < step`. A mismatch or unresolved case generates a
nonzero exit code with detailed failures in the JSON.

The #140.5 *full* suite still correctly fails its **original** strict gate:
it compares the unmodified reference solver to the predictor, and its six
nonmetric legacy-guide scene discrepancies remain unresolved there. #140.6's
local recovery does **not** retroactively certify that full suite.

## Decision

The 16 reference failures have a specific reproducible mechanical explanation,
and both bracket-first recovery and Flat independent invariant checks support
the proposed near-vertical branch locally. **This is not a universal proof of
branch uniqueness.** All engineered predictor/warm-start use remains opt-in
and offline only. A production policy change requires separate examination of
multipath/grazing cases, the near-vertical boundary, Globe-specific branch
oracles, and the legacy guide interpolation differences.
