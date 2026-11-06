# Modern profile transition — #140.12.96

## Research: what can and cannot be obtained by changing temperature

The existing `standard` is **already exponential** and *decreasing*:

`n_std(h) = 1 + 0.000293 exp(-h / 7350 m)`.

The existing `exponential-occlusion` from the inverse geometric optics experiment is
**increasing**: `n_occ(h) = n0 exp(h/R)` (the Modern UI uses `n0 = 1`,
`R = occlusionRadius`). These **must not be called the same limit** of
hydrostatic meteorology. For example, at `h = 0` the engineered profile has
`n=1`, while the fixed Standard model has `n=1.000293`.

For dry air with `n−1 ∝ p/T`, `dp/dh = −p g/(Rd T)`,
`Rd = 287.05 J/(kg K)` and `g = 9.80665 m/s²`,

`d(n−1)/dh = −(n−1) [g/Rd + dT/dh]/T`.

The density/refractivity gradient changes sign only if the local temperature
gradient is below `−g/Rd ≈ −34.16 K/km`, outside the existing supported
`−20…+20 K/km` range. This sign reversal alone does not reproduce the
engineered exponential. If one artificially uses `n0=1.000293` at the
surface and asks for its engineered derivative with `R=6371 km`, the needed
local gradient is about **−188.6 K/km** at `T0=15 °C`; holding that constant
would make T fall below zero kelvin before 2 km. The actual engineered UI
sets `n0=1`, i.e. vacuum-like `n(0)=1`, which a positive-density dry-air
hydrostatic model cannot realize. A global increasing index of the form
`exp(h/R)` is not a realistic hydrostatic dry-air profile.

**Isothermal check:** At temperature gradient zero the existing
`temperature-lapse` model becomes an exact isothermal pressure/density
exponential. At `T0 = 288.15 K`, its scale height is
`H = Rd T0 / g ≈ 8434 m`, not the project's fixed Standard 7350 m.
They should not be silently equated. The nonzero existing temperature-lapse
gradient is an exponentially relaxing **surface** gradient, not a constant
full-height lapse rate. No old atmospheric formula is modified here.

## Implementation: clearly marked *mathematical* interpolation

Select `Profile transition · experimental` under Atmosphere in Scene or
Compare. This controls the actual forward ray tracer `n(h)` and `dn/dh`, **not**
just colors, compositing or a camera transform. Choose an initial profile:

- **Standard:** exact existing standard model at 0%.
- **Temperature gradient:** existing dry hydrostatic boundary-layer profile
  at 0%; its surface temperature, pressure and gradient remain editable.

Choose **Engineered-profile blend** `w` from 0% to 100%:

`n_w(h) = (1−w) n_start(h) + w exp(h/R)`

`dn_w/dh = (1−w) dn_start/dh + w exp(h/R)/R`.

At the exact 0% and 100% endpoints, Scene, ground guides and the
traced horizon dispatch to the **unchanged original** named solver, retaining
its numerical optimizations; intermediate values use the same generic RK4 ray
tracer. This is a continuously differentiable, **non-meteorological** interpolation
between two independently specified refractive-index fields. At 100%, the
existing `exponential-occlusion` is reproduced exactly; at 0%, the selected
original start profile is reproduced exactly. For a hydrostatic start,
the gradient affects rays while `w < 1` and ceases to affect rays at 100%.
The colored T(h) column shows the hydrostatic **start component**, not a
physical temperature underlying the whole interpolated n(h).

The engineered endpoint can be very different from real atmospheric
refractive indices and can create nonphysical scene results. The interpolation
is a tool for exploring the forward problem, **not evidence that a
plausible temperature field can produce the endpoint**.

### State, caching, and compatibility

Scene and Compare A/B store independent `{source, weight}` pairs as
`transitionProfile`; their thermal inputs are independently retained.
These are optional, allowlisted fields of existing version-1 experiments:
older JSON, links and presets load with `{source:'standard',weight:0}`.
`Standard`, `temperature-lapse`, `exponential-occlusion`, `vacuum` and Legacy
remain unchanged.

The optical cache distinguishes transition source, weight, and (when active)
thermal inputs. The same interpolated `n, dn` is passed to towers, metric
ground guides and traced horizon through `OpticalRayTracer`. The slider
commits the expensive ray recomputation on change/release, while its numeric
readout updates immediately during dragging.

### Sources and checks

- [A. T. Young, Hydrostatic equilibrium](https://aty.sdsu.edu/explain/thermal/hydrostatic.html)
- [UCAR COSMIC refractivity / meteorology](https://cdaac-www.cosmic.ucar.edu/cdaac/doc/about.html)
- [US Standard Atmosphere constants](https://www.crnslab.org/util/atmo.php)
- Local source of truth: `src/optics/OpticalRayTracer.js` and
  `docs/temperature-gradient-modern.md`.
- `node --test tests/ModernProfileTransition.test.js`
- `node --test tests/*.test.js`

Browser visual checks in Opera remain necessary after applying the patch.
