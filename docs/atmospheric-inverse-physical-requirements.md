# Atmospheric inverse problem: physical requirements and stability

**Status:** research note / proposed work, not a validated atmospheric model.
**Patch:** 136 (documentation only).
**Scope:** identify what physical air conditions would be required to realize an optically engineered positive refractive-index gradient on a flat surface. Mirages and general multipath simulation are **not** the current objective.

## Research question

The existing engineered exponential optical profile is

\[
 n_{\rm opt}(h)=n_0\exp(h/R_{\rm ref}), \qquad
 \frac{d\ln n_{\rm opt}}{dh}=\frac{1}{R_{\rm ref}}.
\]

Here `R_ref` is the **refraction scale radius**, independent of the geometric surface radius. The current optics implementation may use `n0 = 1` as a convenient mathematical normalization. A physical-air interpretation instead needs a physically meaningful near-surface refractive index, typically about 1.000293 for a representative visible wavelength and standard conditions. Multiplication of the entire index profile by a positive constant leaves geometrical ray paths unchanged in a stationary isotropic medium; it does **not** leave the air thermodynamics unchanged. Do not substitute the engine's `n0 = 1` directly into an air-density relation.

The proposed study asks: given a target `n(h)`, a wavelength, and lower boundary values for temperature, pressure, and humidity, what `T(h)`, `P(h)`, and humidity profile could realize it? Does a positive-temperature hydrostatic solution exist throughout the relevant height interval? If it exists, is it stable, and what dynamical evolution would follow a perturbation?

## First approximation: dry ideal-gas air

At fixed visible wavelength and composition, use the approximate dry-air relation

\[
 n-1\simeq K\frac{P}{T}, \qquad P=\rho R_d T,
\]

where `K` is calibrated at the chosen reference state and `R_d ≈ 287.05 J kg^-1 K^-1`. This approximation is a starting point, not a substitute for a validated optical refractivity model including wavelength, humidity, and compressibility.

Under the **assumption** of hydrostatic balance,

\[
 \frac{dP}{dh}=-\rho g=-\frac{Pg}{R_d T},
\]

which implies

\[
 \frac{dT}{dh}=-\frac{g}{R_d}-\frac{T}{n-1}\frac{dn}{dh}.
\]

For the target exponential profile, the required local lapse rate is

\[
 \Gamma_{\rm req}\equiv-\frac{dT}{dh}
 =\frac{g}{R_d}+\frac{n}{n-1}\frac{T}{R_{\rm ref}}.
\]

**Illustrative local estimate (not a global constant gradient):** with `T0 = 288.15 K`, `n(0) = 1.000293`, `R_ref = 6,371 km`, and `g = 9.80665 m/s²`, the required lapse rate is about **188 K/km**, or **18.8 K per 100 m**. The dry-adiabatic lapse rate `g/c_p ≈ 9.8 K/km` is about **19 times smaller**. This is a strong indication of convective instability under the dry, adiabatic parcel assumptions, not proof that the hydrostatic equations have no mathematical solution.

## Hydrostatic existence: derive before claiming impossibility

Let `q(h) = n(h)-1` and `q0 = n(0)-1`. The dry-air constitutive relation implies `P/T ∝ q`. For constant `g` and `R_d`, hydrostatic balance gives

\[
 \frac{d(qT)}{dh}=-\frac{g}{R_d}q(h),
\]

so the temperature satisfying the **assumed hydrostatic equations** is

\[
 T(h)=\frac{q_0T_0-(g/R_d)\int_0^h q(z)\,dz}{q(h)}.
\]

For `n(h)=n0 exp(h/R_ref)`, the integral has the closed form

\[
 \int_0^h q(z)\,dz
 =n_0 R_{\rm ref}\bigl(e^{h/R_{\rm ref}}-1\bigr)-h.
\]

Then `P(h)/P0 = q(h)T(h)/(q0 T0)` and `rho(h) = P(h)/(R_d T(h))` where the model remains valid. Check **positive absolute temperature and pressure**, boundary conditions, and the domain of validity of the optical and ideal-gas approximations. A formally hydrostatic but convectively unstable profile is not a long-lived equilibrium without additional forcing. Do not conflate hydrostatic existence, static stability, and dynamical persistence.

The locally estimated `188 K/km` is **not** to be extrapolated as a constant over hundreds of metres: the exact hydrostatic solution changes its lapse rate with altitude. The equations above, not a fixed gradient, should drive any future diagnostic plot.

## Stability and timescales

For a dry ideal-gas atmosphere in the local, adiabatic, small-displacement approximation,

\[
 N^2=\frac{g}{T}(\Gamma_d-\Gamma),\qquad
 \Gamma_d=\frac{g}{c_p}.
\]

At the illustrative surface conditions, `N² ≈ -6.1 × 10^-3 s^-2`: the assumed profile is locally convectively unstable. The corresponding idealized **linear perturbation e-folding time** is

\[
 \tau_{\rm linear}=\frac{1}{\sqrt{-N^2}}\approx 13\ \mathrm{s}.
\]

**Do not label 13 seconds as the time for temperature to equalize or the entire layer to mix.** Actual evolution depends on layer depth, perturbation wavelengths and amplitudes, viscosity, turbulent transport, moisture, boundaries, horizontal flow, and heat sources. Convective adjustment tends toward a profile closer to an adiabat (roughly constant potential temperature), not necessarily constant ordinary temperature. A quantitative mixing time requires a separately specified dynamical model and validation.

## Humidity and observational constraints

After establishing the dry reference calculation, adopt an appropriate **optical** (not radio-frequency) refractivity model with explicit wavelength, total pressure, water-vapour partial pressure, and temperature. Relative humidity alone is insufficient without temperature and a saturation-vapour-pressure relation. Investigate whether humidity gradients can materially change the required temperature lapse rate, and state the assumptions and feasible ranges. Do not treat arbitrary humidity profiles as automatically physically realizable.

For the Lake Pontchartrain comparison, define the height interval actually sampled by the optical rays and the horizontal extent over which the proposed profile must persist. An extreme local lapse rate at one location is not equivalent to a coherent refractive field across the full scene. Compare predicted atmospheric conditions with independent measurements where available.

## Proposed visualization (future patch; not implemented)

- For a model with an atmosphere, show a vertical colour strip or side plot of **required `T(h)` and/or local `dT/dh`**, computed from the selected `R_ref`, reference conditions, and the chosen thermodynamic assumptions.
- Clearly mark `Γ_d ≈ 9.8 K/km`, the ratio `Γ_req/Γ_d`, and intervals where `N² < 0` or the assumed physical solution becomes invalid.
- Show assumptions, units, altitude range, wavelength, and whether the result is a *required inverse profile* or a *forward-predicted atmosphere*.
- **Vacuum:** no temperature, pressure, humidity, or stability plot; do not invent thermodynamic quantities for an absent atmosphere.
- Scene/Compare display semantics should remain consistent; geometry radius and atmospheric refraction scale radius must remain independent.
- Defer dynamical evolution/mixing animations until an explicit, tested dynamics model exists.

For conditional numerical estimates of optical turbulence and a proposed simulation path, see [optical turbulence research](atmospheric-turbulence-research.md). Those estimates are **not** a calibrated prediction of image distortion.

## Work sequence / acceptance questions

1. Validate the dry-air optical refractivity coefficient and units at a declared wavelength and reference state; document uncertainty.
2. Implement/test the analytic hydrostatic inverse solution independently of the renderer, including limiting cases, positivity bounds, and numerical consistency of `n(h)`.
3. Calculate lapse rate and `N²(h)` from that solution, and compare with dry adiabatic values. Keep *existence*, *stability*, and *time evolution* separate.
4. Add a physically grounded temperature/gradient diagnostic alongside the optical comparison, with explicit `not applicable` for Vacuum and `not physically admissible` when assumptions fail.
5. Add humidity as a subsequent research increment; only then consider forced, time-dependent dynamics and observational comparisons.

## Scientific caveats

The engineered exponential profile is an optical construction. Similar rendered images do not establish a unique atmospheric inverse solution or equivalence of every ray path. A local, hydrostatic dry-air inference is conditional on its constitutive model and boundary conditions. The approximate numbers in this note are **illustrative calculations**, not measured atmospheric profiles or claims of absolute physical impossibility.
