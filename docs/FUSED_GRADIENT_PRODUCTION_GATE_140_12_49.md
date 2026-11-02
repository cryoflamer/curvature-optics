# #140.12.49 — Fused standard RK4: promotion gate, not promotion

> **Historical scope (superseded by #140.12.50):** this document describes the pre-promotion experiment. The built-in standard atmosphere now defaults to `fused-gradient` in the prepared/physical shooting paths; use `traceOptimization: 'legacy'` to reproduce the original RK4. See `FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md`.

## Scope

`fused-gradient` is a **candidate** to become the standard RK4 gradient kernel. It combines the `Math.exp(-h/H)` shared by the standard exponential profile's `n(h)` and `dn/dh`, without altering the integration method, the original first-ground-contact detector, target-shooting tolerances or painting. The original implementation remains the **default** and is an explicit control.

Activation remains `settings: {traceOptimization: 'fused-gradient'}` in the physical-scene path; omitting `traceOptimization` retains the original behavior. The optimization is limited to the built-in `standard` atmosphere. The `vacuum`, `custom`, `inverse-spherical` and `exponential-occlusion` profiles are not opted in. `fused-preflight` and `scalar-rk4` remain separate experiments because the previous full-frame test reported eleven pixels with a one-channel difference (1/255) in those variants.

## Verification

- `node --test tests/OpticalFusedProductionGate141249.test.js` validates raw traces, point-to-point shooting and four complete CPU tower-scene classifications without comparing nondeterministic duration counters.
- `node tools/benchmark-fused-multiscene-140-12-49.js --rounds=4` compares CPU composition times with alternating order; these numbers **are not** browser Canvas measurements.
- In **Modern Compare**, select **Globe** and the built-in **standard** atmosphere in A, then select **Gate fused gradient · 4 Globe scenes × baseline/fused · 4 hot frames · PNG + JSON ZIP**.

The new browser audit renders four scenes with independent cold optical sessions (warmup + four timed frames *per mode per scene*):

1. Unmodified authored scene and camera.
2. Eye height 2 m, two groups of near tower foundations at 50 m and 3.5 km.
3. Eye height 15 m, foundations at 9 km and 22 km (horizon-adjacent).
4. Eye height 100 m, foundations at 25 km and 65 km (long range).

Baseline/fused run order alternates between rounds. The report includes times, RK4 calls, counts, strict **any-channel** pixel differences, and per-scene structural parity. Each scene exports real baseline and fused PNGs plus a magenta strict difference image; `results.json` contains `strictParityAcrossScenes`, but that flag is not by itself a scientific proof of correctness.

## Promotion criteria

Do **not** change the default to fused gradient automatically. Before promoting, inspect the browser ZIP:

- Every measured scene has `strictParity: true` and matching structure, with no unexpected unresolved region.
- Median full Canvas frame time improves consistently enough across repeat exports to outweigh run-to-run variance, rather than only on the original 817×544 scene.
- No differences arise in ground-contact/horizon and custom-profile regression tests.

The gate cannot certify different viewports, multi-path optical branches, arbitrary meteorological profiles, or every possible scene. Keep the old path available as an explicit fallback for any future production promotion. The benchmark touches no WebGPU path and does not create a new HTML page.
