# #140.12.43 — CPU f64 conformal Globe shooting feasibility

This is an **opt-in, diagnostic-only** Modern Compare benchmark. It does not alter the CPU renderer, Canvas painter, adaptive geometry, normal shooting, WebGPU or the canonical `tools/webgpu-optics.html`.

## Mathematics and reference

Assume a two-dimensional spherical Earth, spherical radius `R`, standard vertically stratified refractivity `n_s(h)=1+N exp(-h/H)`, and radial coordinate `r=R+h`. Set `x=R φ` and `u=R ln(r/R)`. The optical line element transforms exactly into a *flat* stratified medium `m(u)=(r/R)n_s(h)`. The Earth surface is `u=0` and observer and all target coordinates **must** be transformed, not just the index. The exact-conformal relation assumes radial symmetry, geometric optics, and a meridional section. The numerical *two-step* predictor is not an exact ray solve.

For near-surface `u`, match `m(0)=1+N` and `d ln m/du|0=1/R - N/[H(1+N)] = 1/R_eff`; this gives `m_inv=(1+N) exp(u/R_eff)`. This inverse-exponential approximation gives an analytic **launch-angle estimate** using `q=x/R_eff` and `Δu=u_target-u_observer`: `tan(α0)=[cos(q)-exp(-Δu/R_eff)]/sin(q)`. A cancellation-resistant implementation uses `-2sin²(q/2)-expm1(-Δu/R_eff)`. It is **not** mathematically equivalent to the spherical atmosphere except in a local approximation. The classical `4R/3` choice is separately reported for comparison.

The exact conformal *medium* is used in a second predictor: integrate `u'=tan α`, `α' = d ln m/du` together with launch-angle sensitivities (`v'=w sec²α`, `w'=g'(u)v`) via two large RK4 steps and apply two Newton updates. **This coarse predictor alone has no certified ground/contact/visibility status.** Both candidates are handed to the preexisting, unchanged Globe `OpticalTargetProjection.solve()` with `shootingWarmStartAngle`, `shootingPredictor:true`. Its original residual check, forward-x contract, ground detection, and normal fallback decide the result. No global multipath guarantee is added.

## Browser procedure and ZIP

1. Open `CurvatureModern.html`, enable the existing Compare diagnostics, select **standard** atmosphere for Compare A. The test reuses the same 48 authored physical metric object-edge targets as #140.12.42, never fabricated pixels or a synthetic replacement for the timing set.
2. Press **Benchmark Globe CPU f64 · effective radius vs conformal predictor · ZIP**.
3. Inspect the automatically downloaded `curvature-compare-140.12.43-cpu-f64-conformal-globe.zip`:
   - `results.json` includes original Globe RK4+predictor baseline, approximate inverse-exponential + strict RK4, coarse exact-conformal + strict RK4, per-round times, per-target candidate errors, original ground status and fallback/acceptance counts.
   - `authored-globe.csv` contains the 48 physical real scene cases and all three methods, with effective-radius and `4R/3` angle errors reported in arcseconds.
   - `stress-globe.csv` contains **8** additional cases at ground height and observer height, at 1/3/10/20 km.
   - `envelope-eye-15m.csv` and `envelope-eye-100m.csv` contain **40 total** independent cases (observer 15/100m, target heights 0/15/100/500m, distances 1/10/25/50/100 km). These may be blocked or require fallback. They are *excluded* from the main performance medians.
   - `performance.svg` charts the **three full** 48-target shooting times, and `README.txt` states data provenance and limitations.

Each timing pipeline runs after a warm-up; five timed rounds measure the 48-target population. **Total hybrid time includes candidate generation and strict RK4 verification/fallback.** The exact-conformal predictor must beat the pre-existing `shootingPredictor` to be useful. An accurate angle or faster predictor *alone* is not a performance win.

## Scope / writing

This provides reproducible, scene-specific evidence about inverse-exponential approximation accuracy as a function of range and altitude and a preliminary CPU performance measurement. The conformal transformation and effective-Earth-radius concept are established ideas (see, for example, Feng, Huang and Yi 2021, DOI `10.1109/ACCESS.2021.3103750`). A potential paper contribution would be this specific inverse-exponential angle formula, error envelope, and measured optimization trade-off, *not* the invention of conformal flattening. No claim of global branch completeness, weather-generalized refractivity, independent pixel parity, or full-render speedup should be inferred.
