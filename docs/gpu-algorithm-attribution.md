# #140.12.35 — Algorithmic Error Attribution (GPU-grid / visibility topology)

## Research question

In #140.12.34, the real CPU A / GPU-assisted B frames differed in 3.16–6.45% of their pixels. That experiment used **GPU f32 RK4 predictor + interpolated grid**, not the independent GPU DS shooting of #140.12.32–33. The algorithm audit identified a **nearest-weight status decision** across mixed visibility cells, out-of-grid clamping, and the bypassed CPU adaptive smooth-cell gate.

This experiment compares **actual B images under a fixed shared GPU node grid**, with deliberately different status-handling policies, and independently tests renderer query coordinates with CPU f64 and direct GPU. It is a first **controlled attribution experiment**, *not* a complete causal decomposition or production redesign.

## UI and output

Open `CurvatureModern.html` → Compare → CPU/WebGPU → **Audit algorithm attribution · baseline / strict / direct GPU**. Requires an aligned Globe/standard model, Canvas 2D, WebGPU, and turbulence disabled for A and B. The result automatically downloads `curvature-compare-140.12.35-algorithm-attribution.json` (or a JSON error report).

### Three B variants for each of four real camera views

All variants use the **same independently prepared, scene-derived 4096-node GPU f32 RK4 (500 m) predictor grid**. The four actual Canvas views are tilt-up, tilt-down, narrower FOV and current camera, exactly as #140.12.34.

1. **`baseline`**: existing bilinear correction and highest-weight node's visibility in mixed cells. The control is intentionally unchanged.
2. **`strict`**: retains the *same interpolated angle* but maps any mixed status, non-finite/failed/uncertain node, or out-of-grid/clamped request to `indeterminate`. Uniform valid in-grid `visible/blocked` cells remain as the baseline. This is a **no-guessed-visibility policy**, not a prediction that the physical ray is blocked. `strictRejected`, `strictMixed`, `strictInvalid`, `strictOutOfDomain` are measured independently.
3. **`strictDirect`**: same strict policy with up to **192 direct GPU f32 predictor results** at **precisely selected actual B renderer queries**. These replace only those exact `(d,h)` coordinates, not an entire neighboring cell. Unknown or failed GPU results are not promoted to visible. Neither this nor the control invokes CPU fallbacks.

The selected queries are stratified from the baseline **actual-camera B** field (within `d <= 6000 m`, `h <= 20 m`) and reused for the other three viewports. No reference CPU pixels, CPU ray-status or CPU oracle output determine the sample selection. The resulting finite selection is **not exhaustive** across queries from other camera/strict modes.

### Independent CPU f64 oracle

Only **after all GPU variant frames** are painted, independently render the four CPU A frames, with a cold repeat to reject instability, and independently solve the **same selected query targets** using the standard CPU f64 first-forward-x shooting contract. Compare the CPU f64 statuses with both original **interpolated grid** and direct **f32 GPU predictor** on exactly those same coordinates.

Report status confusion matrices (CPU × grid, CPU × direct GPU, direct GPU × grid), classification disagreement counts **only for CPU robust visible/blocked**, 2D query provenance via `(d,h)`/risk flags and explicit `sampleCalls`/`exactCalls`, and actual-camera pixel displacement for **status-agreed** angles. `indeterminate` and failed CPU references are excluded from robust mismatch counts, not silently counted as errors.

### Rendered full-frame outcomes

For every camera/variant, export white-composited significant RGB pixel counts (>8/255), background/painted occupancy, lower-right and eye-level band, contrast-edge proxy, frame times, field stats, and geometry: contours, fill triangles, unresolved outline segments, **fillUnresolved** and its reasons. Also export each candidate's difference **from baseline GPU B**. Changing visibility also changes adaptive subdivision and the number/order of downstream solver queries, therefore these percentages are **not additive independent cause contributions**.

## Invariants and safety

- CPU A is not used for constructing the GPU grid, choosing GPU refinements or modifying any B variant.
- Only experimental `gpuFirstRayField({strictVisibility:true})` instances activate the conservative gate; the existing preview and production default are untouched.
- Sparse GPU direct answers are mapped by exact physical `(d,h)` keys, order-checked against `surfacePoint2(d,h)`; failed answers remain uncertain.
- The same Canvas 2D renderer paints A and B, GPU only computes optical field values; this is **not GPU rasterization or a DS frame**.
- The gate can **increase omitted geometry and render time**. This is intentional to surface ambiguities; it is not automatically an accuracy improvement.
- `unresolved` and `fillUnresolved` are separately captured; painted/white and zero-elevation proxies are not semantic terrain/horizon classifications.
- Any report is observational and scene/camera-specific; does not establish topology certification, mathematical error bounds, ray-branch completeness, or production parity.
- No new WGSL is introduced. Local Node tests confirm JS semantics and real optics transformation. **Actual WebGPU compilation and rendering must be checked in a WebGPU-enabled browser**, followed by review of the exported JSON.

## Interpretation of likely patterns

- **Direct GPU status matches CPU more often than grid**: evidence consistent with interpolation/status selection being more problematic on sampled queries, but does not isolate the contribution of contour building from full images.
- **Direct GPU still disagrees with CPU on robust statuses**: some errors precede interpolation (GPU shooting/event classification or differing numerical tolerances). Must further compare fine-step GPU and DS contact evidence, not assume interpolation is the only cause.
- **Strict raises blank/uncertain pixels**: expected result of refusing to invent visibility; it measures uncertainty exposure, not a failed correctness test.
- **Strict + direct reduces missed pixels or unresolved geometry**: evidence that sampled direct queries help; the selected 192 points may cover only a small subset of a large adaptive query set.
- **No visual improvement in strict + direct**: cannot rule out the approach without measuring selected-target hit counts and query coverage, or after checking the physical event qualifier.

## Run tests

```sh
node --test tests/ModernGpuAlgorithmAttribution141235.test.js
node --test tests/*.test.js
```

The tests include a synthetic 2×2 status boundary, strict in-grid/out-of-grid/failed-node classification, exact coordinate-only sparse GPU injection, tri-way CPU/GPU confusion and angle comparisons, an actual physical optics geometry transformation with mixed statuses (no CPU fallback), and UI/JSON wiring. Actual WebGPU still requires a user browser run.
