# Optical turbulence in the inverse atmosphere — research plan

**Status:** research hypothesis and conditional order-of-magnitude calculations; **not** a validated prediction of image distortion.
**Scope:** documentation and future numerical study only. No turbulence physics, UI, or rendering changes are implied by this note.

## Question and existing boundary

The engineered flat-ground atmosphere is designed to reproduce aspects of spherical horizon occlusion through a prescribed vertically stratified refractive index. Its dry-hydrostatic inverse temperature is computed in [inverse temperature](inverse-temperature-modern.md), and the stability calculation is documented in [atmospheric inverse physical requirements](atmospheric-inverse-physical-requirements.md).

The *new* question is what time-dependent **image motion, differential image deformation, blur, and scintillation** might accompany the convection of an atmosphere attempting to maintain that profile along a long sight line, e.g. 40 km over Lake Pontchartrain. These observables are different. A large angular blur estimate is not automatically a large displacement or shape change of a tower.

Modern's existing [atmospheric shimmer](modern-atmospheric-shimmer.md) is a controllable **screen-space visual effect**, not a meteorological prediction. Likewise an editable display grid is not an independently validated quantitative diagnostic of turbulent distortion. Neither should be used as evidence for the numbers below.

## Established input: an exceptionally unstable conditional background

For the **100% engineered inverse-temperature** dry-air profile, using the default near-surface values `T0 = 288.15 K`, `P0 = 1013.25 hPa`, `R_ref = 6,371 km`:

- Surface temperature derivative: `dT/dh ≈ −0.18857 K/m` (`−188.57 K/km`). This is a **local** derivative, not a constant gradient over the ray path.
- Dry adiabatic rate: `g/cp ≈ 0.00977 K/m`.
- Under local dry, adiabatic parcel and idealized Boussinesq/linear assumptions,
  `N_BV² = (g/T) [dT/dh + g/cp] ≈ −0.0061 s⁻²`.
- Nominal linear e-folding time `1/sqrt(−N_BV²) ≈ 12.8 s`. It is **not** a mixing time, mature eddy lifetime, or image fluctuation period.

The strongly negative `N_BV²` supports vigorous *linear instability of this assumed background*, not a unique turbulence spectrum, amplitude, or stationary `C_n²`. Convection would tend to modify the very smooth `n(h)` on which the engineered ray model relies; externally maintained heating, advection, boundary conditions, layer depth and moisture would all affect the resulting flow. An unforced equilibrium should not be silently assumed.

## Conditional Tatarskii estimate: a sensitivity exercise, not a prediction

For a representative dry optical refractivity coefficient, define the gradient of **potential** refractive index (rather than just the gradient of `n`):

```text
M ≈ −(79e−6 P_hPa/T²) [dT/dh + g/cp]  [m⁻¹]
```

At the specified surface boundary this gives `|M| ≈ 1.72e−7 m⁻¹`. A **selected** Tatarskii-style parameterization is

```text
C_n² ≈ a L_0^(4/3) M²,   a = 2.8  (illustrative choice)
C_n² ≈ 8.3e−14 (L_0 / 1 m)^(4/3) m^(−2/3).
```

**Important qualifications:** the coefficient is model-dependent (commonly expressed with a turbulent-Prandtl-number factor in the temperature-structure formulation); `L_0` is not known from the inverse atmospheric profile. The length parameter in Tatarskii's derivation is not automatically interchangeable with an arbitrary outer scale of a von Kármán spectrum or the size of a convective cell. The dry potential-temperature conversion and frozen locally homogeneous turbulence are assumptions. `C_n²` is *not* inferred uniquely from the prescribed mean lapse rate.

The following reproduces the earlier **hypothetical** calculation for a uniform horizontal `L = 40,000 m` optical path at `λ = 550 nm`. For a point source / spherical wave, the standard Kolmogorov-style Fried integral under the stated convention is

```text
k = 2π/λ
r_0^(-5/3) = 0.423 k² ∫[0,L] C_n²(s) (s/L)^(5/3) ds
uniform C_n² => r_0 = [0.423 k² C_n² L (3/8)]^(−3/5)
ε_FWHM ≈ 0.98 λ/r_0                 [radians]
L ε_FWHM                              [metres, angular-width equivalent]
```

This is an **idealized long-exposure point-spread width**, not an RMS tower displacement or a shape-distortion amplitude. `s` is measured from the source in the chosen spherical-wave convention; reverse the weighting if reversing the coordinate. Real rays curve and traverse changing heights, so constant `C_n²` along the path is an additional assumption.

| Assumed `L_0` | Conditional `C_n²` (m⁻²/³) | Formal `r_0` | `L ε_FWHM` on 40 km |
| --- | ---: | ---: | ---: |
| 0.01 m | 1.8 × 10⁻¹⁶ | 5.0 cm | 0.43 m |
| 0.03 m | 7.8 × 10⁻¹⁶ | 2.1 cm | 1.04 m |
| 0.10 m | 3.9 × 10⁻¹⁵ | 7.9 mm | 2.73 m |
| 0.30 m | 1.7 × 10⁻¹⁴ | 3.3 mm | 6.58 m |
| 1.00 m | 8.3 × 10⁻¹⁴ | 1.3 mm | 17.24 m |

Numbers here are calculated using `g=9.80665 m/s²`, `cp=1004 J/(kg K)`, `P=1013.25 hPa`, `T=288.15 K` and `dT/dh=−0.1885719 K/m`, rounded to 2–3 significant figures. They are **conditional extrapolations**, not an uncertainty interval or expected range for the actual scene.

### Why the preceding table cannot be promoted to a physical forecast

1. **Buoyancy dominates:** the classical Tatarskii closure is not a justified closure for this extraordinarily unstable, buoyancy-driven flow. Basu & Holtslag (2022) revisit its derivation, distinguish relevant scales, and motivate a different turbulence-budget approach. Do not equate the coefficient `2.8` with universal validity.
2. **Unspecified scales and turbulence energy:** neither `L_0` nor temperature variance, dissipation rate, velocity field, and boundary forcing is calculated by the inverse temperature solver.
3. **Finite-scale and imaging assumptions:** the usual unbounded-inertial-range Fried/seeing relation may be inappropriate with a finite outer scale, an aperture not much larger than `r_0`, or short exposures. In the 1 cm example `r_0 > L_0`, a particularly explicit warning sign. Validate the applicable spectrum, aperture, source geometry, and exposure before reporting a PSF.
4. **Long path and strong fluctuations:** weak-fluctuation/Rytov perturbation formulas may fail on 40 km; the path is not homogeneous and might include near-ground layers, nonstationary cells, multipath or caustics. Rytov variance and imaging geometry need separate regime checks; a failed weak-Rytov criterion does not by itself invalidate all wave-optics methods.
5. **Observables differ:** a point-source long-exposure FWHM does not specify coherent image wander, relative displacement between two tower points, differential warping, or frame-to-frame time scales.

## Independent random-cell ray estimate (also only a scenario)

To develop intuition without assigning a `C_n²`, suppose **independent** index-gradient cells of characteristic longitudinal/transverse size `ℓ` produce temperature contrasts `δT` at roughly fixed pressure. Near the reference state,

```text
|∂n/∂T|_P ≈ (n−1)/T ≈ 1.0e−6 K⁻¹
δn ≈ |∂n/∂T|_P δT
σ_angle ∼ δn sqrt(L/ℓ)                [radians, order of magnitude]
```

This assumes a transverse refractive-index gradient of order `δn/ℓ` within each independent cell, small-angle propagation, uncorrelated signed kicks, and the same typical `δn` along the path. Numerical coefficients, correlations and anisotropy are unspecified. **It is not a bound** and must not be used for a claimed probability distribution or directly inserted into a screen-space shimmer amplitude. For comparison, `δT = 0.1 K`, `ℓ = 10 m`, `L = 40 km` gives `σ_angle ~ 6e−6 rad` (about 1.2 arcsec), with `L σ_angle ~ 0.24 m` as a **ray-angle equivalent**, *not* a predicted tower deformation.

The ambient lapse rate cannot simply be multiplied by `ℓ` to assign `δT`: an adiabatically displaced parcel develops a contrast approximately `|Γ−Γ_d| Δh` **during the linear displacement**, but the amplitude `Δh` and its subsequent nonlinear evolution are unknown. The hydrostatic assumption also becomes questionable during vigorous convection. For actual apparent target motion, account for the longitudinal lever arm of each perturbation and the boundary-value ray-shooting problem, not merely `L×σ_angle`.

## Proposed research sequence (no implementation approved here)

1. **Define observables and baselines.** Fix observer/target geometry, angular and pixel scales, camera aperture, wavelength, exposure, and tower sample points. Compare engineered flat background versus standard spherical atmosphere, without turbulence first. Record static image differences separately from time-dependent statistics.
2. **Select physically constrained flow scenarios.** Specify the vertical layer, source of heat/forcing maintaining the extreme profile, horizontal winds, humidity assumptions, integral scales, and temporal duration. Distinguish transient unstable evolution from a statistically stationary forced turbulent state. Do not infer fluctuation strength solely from `N_BV²`.
3. **Start with controlled stochastic fields.** Generate reproducible `δn(x,z,t)` (or full `δn(x,y,z,t)` if image distortions require it), with explicit spatial covariance/spectrum, inner/outer scales, anisotropy, and advection; vary temperature contrast and correlation lengths. These are *scenarios*, not dynamically derived turbulence. Do not silently reinterpret a 2D screen warp as a 3D optical calculation.
4. **Solve optics with appropriate geometry.** Trace rays through `n_background(h)+δn` with controlled spatial/time resolution. For each source point solve the observer-directed boundary problem; use full wave/phase-screen propagation for scintillation, diffraction and PSFs where ray optics is insufficient. Check caustics, occlusion, and multiple branches.
5. **Measure statistics, not screenshots.** Report RMS image-centroid wander, differential angular displacement for specified tower-point separations, local angular magnification/shear, PSF FWHM where well-defined, temporal correlation time, and percentile envelopes. Convert angular observables to pixels or transverse equivalents only with stated geometry.
6. **Verify numerical convergence and scientific sensitivity.** Hold random seeds fixed for A/B tests; vary resolution, step size, realization count, spectra, forcing, boundary conditions and path length (e.g. 5, 10, 20, 40 km). Include a zero-fluctuation control that reproduces the existing ray tracer and a small-perturbation test against a known analytic limit.
7. **Only then consider dynamics.** If a sensitivity study suggests material distortion, evaluate a buoyancy-aware turbulence closure or LES with validated thermal boundary forcing, and couple its output to optics. Do not present a stochastic demo as a first-principles prediction.

### Acceptance / reporting rule

A defensible *order-of-magnitude* claim must declare the assumed `δT`, spatial scale/covariance or `C_n²` spectrum, path weighting, time averaging, camera aperture, and definition of **distortion**. Report outputs as conditional sensitivity results and show how they change under plausible alternative assumptions. The current documentary conclusion is only that the inverse background is exceptionally unstable and that trial turbulence parameterizations **can** yield substantial angular image degradation; the magnitude of actual convection-induced distortion remains open.

## Literature and code boundaries

- S. Basu and A. A. M. Holtslag, *Revisiting and revising Tatarskii’s formulation for the temperature structure parameter (C_T²) in atmospheric flows*, Environmental Fluid Mechanics **22**, 1107–1119 (2022). https://doi.org/10.1007/s10652-022-09880-3 — discussion of assumptions, length-scale choice, and turbulent-budget formulations.
- Existing repo background: [physical requirements](atmospheric-inverse-physical-requirements.md), [inverse temperature calculation](inverse-temperature-modern.md), [physics and validation limits](physics.md), [illustrative atmospheric shimmer](modern-atmospheric-shimmer.md).

This document is a scientific research backlog. It does **not** claim that a quantitative turbulence model, calibrated distortion renderer, or physically validated `C_n²` calculation has been implemented in Curvature.
