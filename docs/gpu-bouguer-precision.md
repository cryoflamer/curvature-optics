# 140.12.30 — Fixed-angle GPU Bouguer target-angle precision recheck

This is an **isolated research-only** WebGPU / CPU comparison. It does not change
production optics, the solver, the GPU ray-shooting kernel, classification, or
painting. It is enabled through Compare → CPU / WebGPU and requires Globe with
standard exponential refraction. Export the JSON for measurements made on an
actual WebGPU adapter.

## Experimental control

One independent GPU predictor batch shoots the original #140.12.27 48-point
near-ground ladder (six distances, eight target heights). Its 48 selected
angles are fixed for the entire audit; no CPU angle is substituted or used to
select a ray. The exact #140.12.27 256-node f32 Bouguer shader is executed as
`legacy_f32`, and then three new kernels execute with **identical input rays,
log-invariant, atmosphere, integrand, midpoint nodes and compensated sum**:

| GPU mode | Target polar-angle calculation | Margin computation |
| --- | --- | --- |
| `legacy_f32` | `atan2(k*x,1+k*y)` from rounded Cartesian target | `(theta - phi) / k` |
| `direct_f32` | `distance_hi * k` (`k` is the original packed f32 inverse radius) | `(theta - phi) / k` |
| `classic_ds` | `dsDiv(distance_hi+lo, radius_hi+lo)` | `((theta_hi - phi_f32) + theta_lo) / k` |
| `integer_residual_ds` | Same DS division with integer residual arithmetic | Same low-part margin |

**Important:** Even in the DS modes, the 256-node Bouguer quadrature and its
`phi` are unchanged **f32**, and the final difference and scaling still use
f32 operations. The two-limb angle is not an f64 ground-angle computation, nor
an error-bounded visibility certificate. This deliberately isolates the
contribution of the target-angle calculation and its final subtraction.

The CPU reference is computed **only after all four GPU modes and the fixed
GPU RK4 contact audit have completed**. It uses the original CPU f64
2048-node Bouguer quadrature, diagnostic 256-node f64 quadrature and separate
same-angle CPU RK4 replay, preserving the #140.12.27 reference formulation.

## Reading the exported JSON

`summary[mode].contactDisagreements` is the number of differing contact signs
for the same shooting angle. `outside1cm` counts sign differences when the
CPU f64 margin is more than 1 cm from zero. The margin is **surface arc length**,
not ray path length or target vertical residual.

`maxAbsoluteTargetAngleErrorSurfaceMetres` is the reconstructed **hi + lo**
GPU target angle compared with the CPU target polar angle, multiplied by R.
Both limbs are recorded by the shader and read back independently, including
when the shader takes a no-ground or unresolved branch.
`groundAngleDeltaFromLegacyMetres` should be identically zero on compatible
backends, because the integrand is unchanged; a nonzero value flags a
comparison confound (e.g. compiler math differences) rather than a successful
precision repair. `maxAbsoluteMarginDifferenceMetres` includes errors from the
original f32 integral, so it must not be interpreted as the target-angle-only
error. The separate CPU f64 256- versus 2048-node difference reminds us that
quadrature error is also non-negligible in some grazing regimes.

The report retains all 192 mode/target rows and a separate subset of 24
near-surface mode/target rows. Each measurement includes the original GPU
shooting status and CPU f64 shooting status **for context only**: a contact
along a non-solving GPU angle does not settle target visibility. No ground
contact, shooting status, or production renderer output is altered.

## Constraints and follow-up

- GPU compilation and real elapsed times must be checked on a browser/WebGPU
  adapter; Node mocks validate packaging, order and readback, not WGSL math.
- `classic_ds` remains subject to WGSL reassociation; `integer_residual_ds`
  has a limited finite-normal contract and is not IEEE binary64.
- A repaired target angle does not repair the f32 integrand or the f32 GPU
  shooting angle. Any remaining contact disagreements should be decomposed
  into target-angle, quadrature and shooting sources before the next patch.
- This patch is **Globe-only**; the Flat refractive invariant requires its own
  later implementation and independent CPU reference.
