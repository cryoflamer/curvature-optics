# #140.12.48 — standard RK4 trace: fused exponential and clearance preflight

> **Historical scope (superseded by #140.12.50):** this document describes the pre-promotion experiment. The built-in standard atmosphere now defaults to `fused-gradient` in the prepared/physical shooting paths; use `traceOptimization: 'legacy'` to reproduce the original RK4. See `FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md`.

## Scope and default behavior

The default renderer, shooting predictor, integration recurrence, opaque-ground event detector, painter, and existing WebGPU/conformal experiments are unchanged. Two **opt-in** modes are available only when the shared ray field builds a **standard exponential** atmospheric profile; custom, vacuum, engineered and inverse profiles do not opt in:

- `settings.traceOptimization: 'fused-gradient'`: reuse one `Math.exp(-h/H)` per RK4 derivative for the original `n=1+N0*exp(-h/H)` and `dn=-N0*exp(-h/H)/H`, preserving the same `dn/n` arithmetic and validation. Applies to RK4 shooting and final finite-ray trace.
- `settings.traceOptimization: 'fused-preflight'`: the fused exponential plus a conservative, **no-RK4** ground-clearance proof before the existing chord/event check. A failed proof always uses the original clearance/event path. No ground-contact classification is inferred from shooting residuals.
- `settings.traceOptimization: 'scalar-rk4'`: same fused standard exponential and RK4 staging, but a scalar, allocation-reduced integration kernel instead of four intermediate derivative arrays and three temporary state arrays per step. The original event detector is still used and geometry is computed by the same stable surface metric. This is **separate** from the clearance preflight to measure its cost/benefit independently.

The preflight uses the 1-Lipschitz property of physical height along a unit-speed ray, the upper bound on `|d log(n)/dh|` already supplied by the standard profile, and a bound for the derivative of the spherical surface normal. With initial height `h`, local altitude slope `a`, path step `ds`, and curvature bound `C`, the whole segment satisfies

`h(s) >= h + a*s - C*s*s/2` for `0 <= s <= ds`.

A concave quadratic is lowest at an endpoint, so the step is certified clear only when `h + min(0,a*ds) - C*ds*ds/2 > 0.001 m`. For the sphere, `C` includes the maximum reciprocal radial distance along the step, bounded using `h_min >= h-ds`. A nonpositive radius, undefined bound, near-ground or uncertain segment conservatively falls back to existing logic. The original RK4 step still advances the ray. This proof is **not** a substitute for the event detector or a multipath solver.

## Diagnostics and interpretation

In Modern Compare, on **standard Globe A with positive observer height**, press:

**Audit production RK4 trace · baseline / fused / preflight / scalar · 8 hot frames · ZIP**

The experiment renders the real physical Canvas frame with independent cold optical sessions in 8 order-rotating warmed rounds per mode (32 measured frames). It exports `results.json` (all samples, per-stage shooting times, RK4 calls, preflight vs chord and full ground checks, exact pixel parity, structural counters), four real PNG frames, three PNG difference maps and a README. The difference images flag channel changes >8; the **strict pixel difference count** is in JSON.

`tools/benchmark-trace-140-12-48.js` repeats the experiment over a deterministic small physical scene in Node, with no Canvas. It provides a **diagnostic**, not a browser speedup or production promotion gate.

Acceptance requires the same visible/blocked/indeterminate status, first ground event, finite integrated ray and physical frame parity. Independent tests compare bitwise equivalent RK4 outcomes and the original/opt-in traces on both Flat and Globe. A single identical frame does not prove all possible profiles, ground contacts or optical branches. Even fewer calls to the ground detector do not guarantee better total frame time; both variants remain **disabled by default** until real browser results are reviewed.
