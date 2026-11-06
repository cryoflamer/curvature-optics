# Inverse temperature atmosphere · #140.12.97

## Scope and physical interpretation

The new `Inverse atmosphere · required temperature` mode is a controlled
**inverse dry-hydrostatic problem**, not a model claiming the engineered
atmosphere is meteorologically possible. It does not alter the earlier
`standard`, `temperature-lapse`, `profile-transition`, `inverse-spherical`,
or `exponential-occlusion` profiles, the Legacy renderer, or the ray solver.

The existing engineered exponential in Curvature is `n_old(h)=exp(h/R)`.
Its `n_old(0)=1` cannot be produced at nonzero dry-air density, because
`n−1` is proportional to `p/T`. **Multiplication of all n(h) by a positive
constant does not change geometrical-optics ray paths**: the ray curvature
in the integrator depends on `d ln(n)/dh = (dn/dh)/n`. The new target is
therefore `n_target(h)=(1+N0) exp(h/R)`, with the refractivity `N0>0`
calibrated to the user's surface temperature and pressure:

```
T0 = temperatureC + 273.15 K
N0 = 0.000293 × (pressureHpa/1013.25) × (288.15/T0)
```

This ensures the endpoint agrees with the legacy **ray trajectories**, while
its absolute refractive-index values are different. The same `n_target`
is NOT identical to the old `n_old`, only its normalized gradient is.

## Exact inverse solution

For a dry, ideal-gas, plane-parallel hydrostatic model with fixed
`a = g/Rd = 9.80665/287.05 K/m`, `N = n−1 = C p/T`, and
`dp/dh = −g p/(Rd T)`, differentiation gives

```
(N(h) T(h))' = −a N(h)
T(h) = [T0 N0 − a J(h)]/N(h)
J(h) = integral from 0 to h of N(s) ds
T'(h) = −a − T(h) N'(h)/N(h)
```

No numerical solution of the inverse ODE is needed. Both start profiles
have analytic or closed-form integrated refractivity:

- **Standard (calibrated):** `N_start(h)=N0 exp(−h/7350 m)`,
  `J_start(h)=N0×7350×(1−exp(−h/7350 m))`. At the default
  `T0=288.15 K` and `p0=1013.25 hPa` this is the **exact existing**
  Standard optical profile. If T0/p0 changes, the reference amplitude is
  recalibrated; the unchanged named `standard` profile remains fixed.
  The corresponding *inverse-derived* standard temperature gradient is
  approximately **+5.04 K/km**, not −6.5 K/km. A Standard refractivity
  exponential and a hydrostatic temperature law are not interchangeable.
- **Existing temperature-lapse:** the original `T_start(h)` and
  `N_start(h)` are used; dry hydrostatic equilibrium gives an exact
  integral `J_start(h) = [N0 T0 − N_start(h) T_start(h)]/a`.
- **Engineered target:** `N_target(h)=(1+N0) exp(h/R)−1`,
  `J_target(h)=N0 h + (1+N0) R [expm1(h/R)−h/R]`.

The transition parameter `w∈[0,1]` specifies a family of *required*
refractivities for which the inverse solution is computed:

```
N_w = (1−w) N_start + w N_target
J_w = (1−w) J_start + w J_target
T_w = [T0 N0 − a J_w] / N_w
L_w(h) = 1000 × [−a − T_w N'_w/N_w]  (K/km)
```

At **h=0** every member has `N_w(0)=N0`, so its **surface temperature
gradient is affine in w**. This makes the new surface-gradient input an
exact alternative parameterization of the slider:

```
L_surface(w) = (1−w) L_start + w L_target
w = (L_surface−L_start)/(L_target−L_start)
```

Changing this surface value selects the mathematically corresponding
**entire required temperature profile**, not a constant lapse rate applied
at every height. The existing exponential-occlusion parameter R is retained
as `Refraction scale radius (km)`.

## Example at +15 °C, 1013.25 hPa, 6371 km

For the hydrostatic starting profile (`−6.5 K/km`) the 100% inverse
engineered target requires about **−188.57 K/km** at the surface. The
required temperature reaches **0 Kelvin around 4.05 km** above the
reference height. For the engineered endpoint the temperature at 2 km is
around **−184.7 °C** (88.4 K). This is an extreme hypothetical profile,
not a realizable steady atmosphere over those heights.

At and above the first `T=0` altitude, the UI deliberately reports
**invalid** temperature and gradient; it never clamps to positive Kelvin
or silently invents a thermodynamic continuation. The optical profile
`n_w(h)` remains defined beyond the boundary solely as a mathematical
ray-field target. Ray output above that altitude must **not** be
interpreted as refraction through physical air. The derived boundary is a
limit of the chosen dry hydrostatic idealization, not a general statement
that real atmospheres reach absolute zero.

## UI and test procedure

1. Open `CurvatureModern.html` in Opera and select **Compare**. Choose
   `Model B`, `Atmosphere`, `Inverse atmosphere · required temperature`.
   For A keep `Standard` and the original globe surface; B may be Flat.
2. Select **Starting atmosphere → Hydrostatic temperature gradient** and
   check T0 = 15 °C, surface gradient = −6.5 K/km, p0 = 1013.25 hPa.
   At 0% the required gradient input should be `−6.5 K/km`.
3. Use **Display → Show temperature column (0–2 km)**, choose
   `Outside image · left` or `Outside image · right`.
   The colored bar must appear only alongside the inverse-thermal model;
   if A has no temperature profile it reserves a blank strip for alignment.
4. Change **Inverse target strength** through 0%, 25%, 50%, 75%, 100%.
   Confirm that the actual towers, horizon and bar update, and that the
   numerical surface gradient becomes increasingly negative. A/B remain
   independently configurable.
5. At 100% check around **−188.57 K/km**, **T(2000 m) ≈ −184.7 °C**,
   **0 Kelvin at ~4.05 km**. Enter `−100` directly in the **Required surface
   gradient (K/km)** field: the slider should move to roughly 51% and the
   optical image recompute. Outside the allowed gradient range an error
   should be displayed, not a silent extrapolation.
6. Try Starting atmosphere = `Standard exponential (H=7350 m)`:
   the beginning gradient at 0% is approximately **+5.04 K/km** for the
   default T0/p0; the 100% endpoint remains −188.57 K/km.
7. Copy experiment URL, open another tab, verify B mode/gradient/column
   placement and A/B settings survive. Reset a saved older experiment and
   ensure the original atmospheric profiles retain their previous behavior.

The standard `node --test tests/*.test.js` suite and
`node --test tests/ModernInverseTemperature97.test.js` cover the inverse
identity, original endpoints, exact normalized engineered ray gradient,
finite physical domain, persistence and optical cache.

### Caveats

The model is dry, plane-parallel, constant g, fixed gas constant, and
uses the same density-refractivity proportionality as Curvature's
existing hydrostatic model. Humidity, variable g, absorption, atmospheric
stability, turbulence, convection, energy transport, real equations of
state, and radiative transfer are not solved. The new **temperature bar
is visualization of the required inverse T(h)**, not a measured weather
profile. The separate legacy `Profile transition` remains a purely
mathematical n(h) interpolation with no inferred full T(h).

## Prepared inverse ray kernel — performance without relaxed tolerances

Modern's shared-field shooting now prepares the built-in `inverse-temperature`
profile with a factory-owned **single-pass optical gradient**. The raw tracer
`atmosphere('inverse-temperature')` still exposes its original independent
`n(h)` and `dn(h)` functions for diagnostics and scientific reference.

The production RK4 only requires `q(h) = (dn/dh)/n`:

- At **100% engineered target**, `q(h) = 1/R` is constant. Evaluating the
  full inverse Kelvin/J-integral model at every RK4 derivative was wasted work.
- At **0–99%**, the prepared kernel evaluates the starting atmospheric
  refractivity/slope only once per derivative, combines it with the engineered
  `n,dn`, and does **not** compute the temperature or its integral `J`.
- The required temperature, lapse-rate readouts and physical-validity boundary
  are still evaluated by the original inverse formula when the UI requests
  them. No physical interpretation has been discarded.

`step`, the RK4 recurrence, normalization, shooting brackets, ground-event
checks, cache qualification, accepted error tolerances, and Scene/Compare
interfaces are unchanged. Arbitrary custom profiles cannot opt into the
private built-in gradient marker, and the unprepared diagnostic oracle is
available for comparison.

### Reproducing the CPU benchmark

From the repository root:

```
node tools/benchmark-inverse-optics.js --towers=200 --weight=1
node tools/benchmark-inverse-optics.js --towers=200 --weight=0.5
node --test tests/InversePreparedGradient.test.js
```

In the Linux/Node test environment used during implementation, cold optical
composition for 200 towers and a 2000 m maximum RK4 step improved from roughly
**5.4 s to 0.67 s** at 100% (about **8×**), and **6.3 s to 2.0 s** at 50%
(about **3×**). These are *local Node measurements*, not promises for Opera:
CPU, JIT warm-up, scene state and browser overhead affect wall times.

Full scene comparisons against the unmodified implementation on independent
Node processes covered 200-tower Flat at 50%/100%, 85-tower Globe at 50%, and
additional source/endpoint configurations. Primitive types, styles, counts,
fill counts, unresolved status and topology were unchanged. The largest
observed projected-coordinate difference was below `1e-14` in the renderer's
unit-direction geometry. Regression tests independently compare ray endpoints,
shooting classification, gradients and ground contacts over both surfaces.

In Opera, switch only B's inverse slider between 50% and 100% and inspect the
existing **B optics ... ms** timing under Compare. That measured wall time is
the authoritative performance result on the user's computer. The slider's
preview and A/B partial redraw from the previous patch remain intact.
