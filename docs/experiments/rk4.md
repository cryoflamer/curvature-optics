# CPU RK4 optimization — gated production decision

**Decision at baseline #140.12.50:** the built-in **standard exponential atmosphere** uses `fused-gradient` by default in eligible prepared/shared physical shooting and ray tracing. `traceOptimization: 'legacy'` preserves the original derivative evaluation as a controlled rollback. Other atmospheric profiles and the raw `OpticalRayTracer.atmosphere('standard')` diagnostic are **not silently promoted**.

## Hypothesis and experimental modes

The standard profile evaluates `n(h) = 1+N exp(-h/H)` and `dn/dh = -(N/H) exp(-h/H)`. They share the same exponential factor. Reusing that factor in each RK4 derivative can reduce redundant `Math.exp` calls while retaining the existing mathematical recurrence, division ordering, renormalization, target tolerance and first-ground event detector.

| Mode | Mechanism | Baseline status |
| --- | --- | --- |
| `legacy` | Original standard RK4 derivative path; distinct evaluations | Explicit regression reference and rollback, not the default for eligible standard profiles |
| `fused-gradient` / omitted | Shared exponential for `n` and derivative within eligible standard paths | **Production default** after four-scene gated user-browser evidence |
| `fused-preflight` | Fused factor plus conservative no-RK4 ground-clearance bound, fallback if uncertain | **Experimental**; not production default |
| `scalar-rk4` | Fused factor plus scalar/low-allocation RK4 kernel | **Experimental**; not production default |

The preflight's segment-wise lower bound was constructed to fail closed rather than replacing actual first contact; see [#140.12.48](../CPU_TRACE_OPTIMIZATION_140_12_48.md). Distinguish a mathematically proven conservative segment check *under its assumptions* from a proof of total-scene renderer parity. The experimental preflight and scalar variants had an earlier report of **11 differing pixels with a one-channel (1/255) delta**, motivating a narrower promotion; see [gate record](../FUSED_GRADIENT_PRODUCTION_GATE_140_12_49.md).

## Three-stage evidence and decision

1. **#140.12.48 — candidate modes:** Node microbenchmark `tools/benchmark-trace-140-12-48.js`, raw trace tests, and specified Modern Compare **8 hot frames × four modes**. CPU timing without a browser cannot substitute for full-frame measurements. [Primary report](../CPU_TRACE_OPTIMIZATION_140_12_48.md).
2. **#140.12.49 — explicit promotion gate:** `tools/benchmark-fused-multiscene-140-12-49.js --rounds=4` is Node-only. Separate Modern Compare browser gate draws **four Globe scenes**: authored; near foundations at **50 m / 3.5 km, eye 2 m**; horizon-adjacent at **9 / 22 km, eye 15 m**; far field at **25 / 65 km, eye 100 m**. Each has a warm-up and four timed reference/fused frames with alternating order. Strict means **any channel** RGBA difference, not merely a >8 visualization threshold. [Gate specification](../FUSED_GRADIENT_PRODUCTION_GATE_140_12_49.md).
3. **#140.12.50 — recorded user-browser result and promotion:** four scenes had **zero strict RGBA differences** and matching structural status in the reported gate, with **faster median complete Canvas frames in all four**. That justifies the **restricted built-in standard** default, not arbitrary scenes/profile equivalence. Raw browser timing samples and the original ZIP are not contained in this checkout; no invented millisecond values are quoted. [Production decision](../FUSED_GRADIENT_PRODUCTION_PROMOTION_140_12_50.md).

## Protected behavior contract

- Eligible: standard atmosphere **without an explicit supplied profile** in `OpticalSharedRayField.create()` and `OpticalTargetProjection.preparedOptions()`; applies to supported physical Flat and Globe shared-field paths.
- Ineligible: `vacuum`, `custom`, `inverse-spherical`, `exponential-occlusion`, and explicit profiles. Don't transform these accidentally when cleaning the code.
- Explicit rollback: `settings: {traceOptimization: 'legacy'}` through the physical renderer, or `traceOptimization:'legacy'` on a new shared field. Use **new optical field/cache sessions** when comparing variants; otherwise a cached field can conceal the requested mode.
- Historical #140.12.48 and .49 scripts force a **genuine legacy reference** following promotion; otherwise a benchmark could incorrectly compare fused against itself.
- The painter, ground-event handling and shooting model were **not** replaced by the fused-gradient change. Strict RGBA parity on four sampled scenes does not prove universal equivalence for all cameras, profiles, caustics or grazing contacts.

## Reproducibility and retirement

- Tests: `tests/OpticalTraceOptimization141248.test.js`, `tests/OpticalFusedProductionGate141249.test.js`, `tests/OpticalFusedProductionPromotion141250.test.js`; confirm exact names in the checkout before execution.
- Scripts: `node tools/benchmark-trace-140-12-48.js` and `node tools/benchmark-fused-multiscene-140-12-49.js --rounds=4`. These measure CPU work; for **Canvas** parity/performance follow the Modern Compare browser audit in the reports and preserve its raw ZIP.
- Keep the original `legacy` path as a diagnostic/rollback **unless a new, explicitly accepted decision supersedes it**. Do not discard the regression oracle or replace the numerical/ground classification contract merely to reduce unused controls.

**Disposition:** `fused-gradient` retained in production; `legacy` retained for explicit comparison/rollback; `fused-preflight` and `scalar-rk4` remain opt-in research and may be separately assessed after archiving their measured evidence.
