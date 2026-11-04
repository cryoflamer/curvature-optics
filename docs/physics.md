# Physics, numerics, and validation boundaries

This is a description of the **implemented model and its limits**, not a claim that every rendered pixel is a physically validated observation. It refers primarily to Modern's physical path; Legacy keeps its separate animated presentation. The executable implementations are authoritative if a historical design note disagrees with this page.

## 1. Geometric model

The physical optics solver uses a **two-dimensional vertical ray plane** in observer-tangent coordinates: horizontal position `x`, vertical coordinate `z`, with distances and heights in **metres**, angles in **radians**. The state is `[x, z, vx, vz]` with a unit ray direction. For spherical geometry the surface center is `(0, -R)`; for flat geometry the ground height is `z = 0`. The local altitude is

- Flat: `h(x,z) = z`.
- Globe: `h(x,z) = hypot(x, z + R) - R`.

Curvature is `κ = 1/R` for finite globe radius and **exactly 0** for the flat limit. The physical scene has a ground-metric coordinate system with a fixed observer-local orientation; visual grid extent is **not** itself an optical horizon. The geometry, scene assembly, perspective projection and object fills are separate from ray integration. See `src/geometry/CurvatureSurfaceGeometry.js`, `CurvaturePhysicalWorldGeometry.js` and `src/optics/OpticalRayTracer.js`.

This is **not** a general three-dimensional atmospheric ray solver or a complete terrain-mesh visibility simulation. Two-dimensional ray/target projection is coupled to authored 3D scene geometry; occlusion, grazing intersections and multiple ray branches remain limited by the implemented classification and discretization.

## 2. Refraction profiles

The refractive index is assumed to depend on **altitude**: `n = n(h)`, with derivative `dn/dh`. Examples implemented in `OpticalRayTracer.atmosphere(...)`:

| Profile | Definition / interpretation |
| --- | --- |
| `vacuum` | `n = 1`, `dn/dh = 0`: straight rays in geometric optics |
| `standard` | `n(h) = 1 + N₀ exp(-h/H)` with defaults **N₀ = 0.000293**, **H = 7350 m**: an illustrative exponential refractivity profile, **not** a complete meteorological atmosphere |
| `exponential-occlusion` | `n(h) = n₀ exp(h/Rₒ)`: an engineered comparison profile on its configured geometry |
| `inverse-spherical` | An engineered inverse-optics profile with scale `Rₒ`, **not** equivalent by name alone to the physical globe |
| `custom` | Caller-supplied functions `n(h)` and `dn(h)`; requires explicit numerical/physical qualification |

The engineered profiles are mathematical test/comparison models, **not** measured local weather. `Rₒ` (occlusion scale) is independent from the physical Earth's radius. Legacy's effective-radius/refraction controls are **not interchangeable** with Modern's `n(h)` without a reviewed mapping.

## 3. Ray equation and RK4

The code integrates a geometrical-optics direction equation in arc length `s` (the ray direction has unit magnitude). In vector notation with `v` the unit tangent and `g = ∇ln n`, the implemented derivative is

`dr/ds = v`,  `dv/ds = g - (g · v)v`.

Here `g = (dn/dh)/n · ∇h`, and `∇h` comes from the chosen flat/spherical surface geometry. The original recurrence uses classical **four-stage RK4** for `[x,z,vx,vz]`, then normalizes direction to unit length. Its step size, event substeps and target-shooting tolerances affect accuracy and classification. The first-ground-contact search examines integrated intermediate states; a step endpoint or a straight chord alone is not sufficient evidence of intersection.

Target projection/shooting chooses initial ray angles numerically (`src/optics/OpticalTargetProjection.js`), and `OpticalSharedRayField.js` reuses validated optical projections across nearby target samples. Such caches/interpolations can improve runtime, but they do not change the underlying model's physical assumptions.

### Production optimization vs historical experiments

For the **built-in `standard` atmosphere in the prepared/shared-field production path**, omitted `traceOptimization` uses **`fused-gradient`** (computes a combined `dn/dh / n` for RK4 stages). `traceOptimization: 'legacy'` explicitly selects the earlier derivative path for controlled comparisons. This default does **not** mean all custom profiles, direct `OpticalRayTracer.atmosphere('standard')` calls or Legacy animations were promoted to the same kernel. The implementation retains certain experimental option names internally; the retired user-facing CPU research panel is **not** part of Modern.

See [production promotion](fused-gradient-production-promotion.md), [qualification gate](fused-gradient-production-gate.md), `src/optics/OpticalSharedRayField.js` and `src/optics/OpticalTargetProjection.js`. Performance measurements in historical notes are **environment- and scene-specific**, not universal speedups.

## 4. Horizon and occlusion are classified, not guessed

A drawn **metric grid horizon** and a **traced optical horizon** are different quantities. The latter is displayed only when the first-ground-contact tracing and associated bracketing have sufficient evidence. A failed or indeterminate shooting calculation must **not** be converted into “blocked” or into a fabricated finite horizon. Neither a solved single branch nor a displayed horizon certifies globally unique visibility in atmospheres admitting multiple paths.

Compare deliberately uses a common, fixed eye-level camera for A and B. Changing curvature or atmosphere between them can change physical visibility; changing viewport width can change pixel scale without changing angular field of view. Atmospheric **turbulence/shimmer** in Modern is an animated *visual approximation*, not a calibrated turbulence (`Cₙ²`) prediction.

## 5. What the tests actually establish

| Evidence | Supports | Does **not** prove |
| --- | --- | --- |
| RK4 convergence and physics regression tests | Numerical invariants, selected analytic vacuum cases, changes to solver implementation | Accuracy of every real-world atmospheric scenario or untested ray branch |
| Fused-gradient production tests | Selected path equivalence, opt-in rollback and protected configuration behavior | Universal speedup, zero error for every input or physical truth |
| Modern Scene/Compare and renderer tests | State/rendering contracts and selected geometry/optical results | Identical pixels on every machine, or experimental WebGL2 superiority |
| Six archived Opera Legacy PNGs | Byte/pixel integrity and regression observations of **six Legacy Canvas scenes** | Independent measurement, Modern pixel parity or correct physical refraction |
| Manual browser smoke tests | Visible usability in the tested environment | Independent numerical or scientific validation |

Useful commands are in [development](development.md); the exact six-frame verification scope is explained in [Legacy visual reference validation](legacy-visual-validation.md). For a scientific claim, specify the geometry, atmospheric profile and constants, observer/camera, step/tolerance settings, branch assumptions, error metric, source of reference data and uncertainty **before** comparing results.
