# #140.12.50 — Standard-atmosphere fused-gradient production promotion

## Decision and scope

The user-supplied #140.12.49 browser gate reported strict zero-difference RGBA images on four Globe scenes (authored, near foundations, horizon and far field), with faster median full frames in all four scenes. This motivates a **narrow promotion**, not a claim of universal equivalence.

The default in `OpticalSharedRayField.create()` and `OpticalTargetProjection.preparedOptions()` for a built-in `atmosphere: 'standard'` **without an explicit profile** is the previously tested `fused-gradient`: one `Math.exp(-h/H)` per derivative instead of separate identical exponentials for `n(h)` and `dn/dh`. It retains the same floating-point ordering of `n`, `dn`, division, RK4, renormalization, first-ground-contact detection, solver tolerances and painter. The default applies to supported Flat and Globe physical shared fields.

| `traceOptimization` for built-in standard | Kernel |
| --- | --- |
| omitted / `fused-gradient` | **Production default** fused RK4 derivative |
| `legacy` | Original RK4 derivative using separate `n(h)` and `dn(h)` |
| `fused-preflight` | Experimental fused gradient + clearance preflight |
| `scalar-rk4` | Experimental fused gradient + scalar RK4 |

Pass through the physical renderer as `settings: {traceOptimization: 'legacy'}` to roll back, or into `OpticalSharedRayField.create({...,atmosphere:'standard',traceOptimization:'legacy'})`. These options are scoped to a *new optical field/session*: use a separate cache session when comparing modes. Explicit `profile` overrides all modes; `custom`, `vacuum`, `inverse-spherical` and `exponential-occlusion` retain their previous paths. Direct raw `OpticalRayTracer.atmosphere('standard')` is not promoted and remains the original diagnostic reference.

## Regression/audit contract

- `node --test tests/OpticalFusedProductionPromotion141250.test.js` asserts default/mode selection, rollback, nonstandard/custom isolation, standard constant preservation, exact raw trace parity and physical rendering structure.
- Existing #140.12.48 and #140.12.49 full-frame browser audits now **force** `traceOptimization:'legacy'` for their reference mode, so they cannot silently benchmark fused against itself. The production mode still uses implicit fused when no override is supplied.
- No WebGPU/WGSL code has changed. The four-scene #140.12.49 gate cannot prove behavior for all possible atmospheres, cameras, multi-branch optics or grazing contacts; retain explicit legacy rollback.
