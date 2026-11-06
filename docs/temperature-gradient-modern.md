# Modern temperature-gradient atmosphere — #140.12.94

## Research decision

Legacy `CurvatureModel.Update()` computes a **local effective-refraction coefficient** from air temperature, pressure and a local `dT/dh` (K/m):

`k = 503 × p[hPa] / T[K]^2 × (0.0343 + dT/dh)`.

This does **not** supply an altitude-dependent refractive-index profile or numerically trace a ray. The Modern Physical renderer, by contrast, integrates `n(h)` and `dn/dh` with its existing RK4 first-ground-contact solver. Applying Legacy's `k` directly to the Modern geometric radius would silently replace the Physical model. We **do not** do that.

Instead, a *new selectable* `temperature-lapse` atmosphere uses a dry-air ideal-gas/hydrostatic approximation. It does not alter Modern's existing `standard` exponential `n(h) = 1 + 0.000293 exp(-h/7350 m)`, any engineered inverse profiles, or the Legacy renderer.

## Explicit physical model

Let `T0 = 273.15 + temperatureC` (K), `p0 = pressureHpa`, `L = gradientKPerKm / 1000` (K/m), boundary-layer length `ell = 1000 m`, `g = 9.80665 m/s²`, and dry-air gas constant `Rd = 287.05 J/(kg K)`.

For `h >= 0`:

- `T(h) = T0 + L × ell × (1 − exp(−h/ell))`.
- `dT/dh = L × exp(−h/ell)`.
- `ln(p(h)/p0) = −(g/Rd) × [h + ell × ln(T(h)/T0)] / [T0 + L × ell]`.
- `n(h) − 1 = N0 × [p(h)/p0] × [T0/T(h)]`, where `N0 = 0.000293 × [p0/1013.25] × [288.15/T0]`.
- `dn/dh = −(n(h)−1) × [g/Rd + dT/dh] / T(h)`.

Below the surface, short RK4 event-probe excursions use a linear continuation of `T(h)` and an analytically integrated hydrostatic pressure. Probes lower than −1000 m are clamped; this extension is numerical infrastructure, **not** a subsurface atmospheric claim.

The lapse rate **is the local surface value**, not a constant gradient over the full atmosphere; its exponential relaxation deliberately avoids unrealistically negative Kelvin temperatures at great heights. This is an *idealized boundary-layer experiment*, not a weather forecast, standard meteorological sounding, full mirage/multipath model, humidity model, or reconstruction of measured local conditions. It currently supports `temperatureC` −30…40°C, `pressureHpa` 800…1100 hPa, and `gradientKPerKm` −20…20 K/km. `Standard` remains the fixed calibrated baseline for older results.

### Optical path and caching

`CurvaturePhysicalSceneOptics` passes the complete temperature parameters into the **same Physical ray field** used by towers and ground guides; the traced horizon diagnostic receives them too. The optical cache key includes these parameters only when the temperature atmosphere is selected. Changing the temperature profile requires a fresh RK4 optical computation. Changing **Show temperature column** affects presentation and experiment persistence only, and does not request another optical trace. Compare A and B retain independent temperature profiles; their airlight/extinction control remains shared.

### Color column

A separate DOM overlay in Scene/A/B samples `temperatureCAt(h)` from the *actual ray-tracing profile* at 0…2000 m. It labels the temperatures at 0 m and 2 km; colors use the same **absolute** −40…60°C scale in all views (not per-column auto-normalization). The overlay occupies no Canvas pixels and does not modify physical rays or affect camera/field of view. It is an **altitude legend**, not a pixel-by-pixel map of projected world height. It appears only for viewports using `temperature-lapse` when Display → Show temperature column is enabled.

`ModernExperimentState` adds optional `scene.temperatureProfile`, per-model `compare.A/B.temperatureProfile`, and `display.showTemperatureProfile` fields to version 1. Old URLs and JSON files default to the disabled column and benign profile defaults, preserving their previously selected atmospheric models.

## References

- A.T. Young, [Atmospheric Temperature Profiles](https://aty.sdsu.edu/explain/thermal/thermal.html) — why refractivity depends on pressure, temperature and hydrostatic equilibrium.
- Walter Bislin, [Deriving Equations for Atmospheric Refraction](https://walter.bislins.ch/bloge/index.asp?page=Deriving+Equations+for+Atmospheric+Refraction) — the local coefficient formula used by Legacy and the role of the temperature gradient.
- `src/app/CurvatureModel.js`, `src/optics/OpticalRayTracer.js`, `src/optics/CurvaturePhysicalSceneOptics.js` — source of truth for their distinct optical models.

## Verification / limitations

- Run `node --test tests/ModernTemperatureGradient.test.js` for analytic derivative, physical-ray changes, Compare independence, saved-experiment migration, cache invalidation and DOM wiring checks.
- Run `node --test tests/*.test.js` and `node tools/check-refactor-closure.js` for regressions.
- Browser visual tests (especially multi-column legibility, very small heights and Opera) require inspection outside Node. No browser or WGSL compilation is claimed in this patch.
