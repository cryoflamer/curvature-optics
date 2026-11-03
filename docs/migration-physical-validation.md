# Compatpatch 115 — reproducible optical and painter validation

## Intent and acceptance contract

This patch is a **validation milestone**, not a new optical solver or Canvas renderer. The physically projected tower foundations now have the per-tower far-to-near ordering of patch 114.1, so the remaining goal is to measure physical consistency and document the known boundaries of the implementation. New CLI validation and regression tests execute directly against the shipping modules, using the same source tower geometry and shared `CurvatureFrameRenderer`.

Run from the unpacked repository:

```sh
node --test tests/PhysicalValidation115.test.js
node tools/validate-physical-scene-115.js
node tools/validate-physical-scene-115.js --full --json > physical-validation-115.json
```

A nonzero CLI exit code indicates a measured validation failure. The JSON output includes every test section's failures, sampled angular errors, diagnostics, cold vs cached optical preparation times, and per-scene unresolved counts. `--full` adds Flat/Globe + Standard at **200 + 2** towers to the default smaller and 85 + 2 tower scenes. Run the script without `--full` for faster iteration.

## Scope, independently measured invariants

1. **Vacuum world/camera geometry.** Check 24 world positions on Globe/Flat against their independently calculated straight-line angles; no Legacy horizon mask or `legacy-k` is involved. A numerical roundoff of the reconstructed Globe surface height is clamped only in the oracle test, matching the physical adapter's existing epsilon policy.
2. **Analytic boundary visibility.** Across two radii (`500000`, `6371000` metres), observer heights `2`, `15`, `100` metres and target heights `0`, `65` metres, compare Globe vacuum's exact tangent distance against the engineered Flat `inverse-spherical` physical ray solver on both sides of the analytical visibility limit. The `exponential-occlusion` profile is separately tested against **its own**, slightly different, tangent formula. This is a statement about the *grazing/visibility boundary*, not the complete image or an arbitrary multipath field.
3. **Standard atmosphere convergence and sense of bending.** On both geometries, compare RK4 steps `2000` and `200` metres at distances `3`, `10`, `15` km for heights `0`, `65` m; require the same valid visible status, an angle difference below `0.05` pixels under the validation 1920px/60-degree angular scale, and expected upward apparent displacement relative to vacuum for these cases. This is a finite numerical sample, not a global RK4 truncation bound.
4. **Adaptive shared-field accuracy.** Sample **off the grid qualification locations** for Flat/Globe Standard and two engineered Flat profiles. Compare status and angle with independent direct 200-m shooting. For visible samples require measured deviation below `0.5` angular-equivalent pixels; numerical ambiguities are recorded rather than promoted to visibility. Report maximum measured difference, the field's interpolation/fallback counters and status mismatches.
5. **Complete scene and painter contract.** Use the actual optics-neutral `CurvatureIndependentComposition` to build and physically project 85 + 2 towers (also 200 + 2 with `--full`). Check that *all authored towers* occur in `perObject` metrics, that rendered batches are contiguous from far to near, fills precede their own strokes, every emitted vertex is finite, the shared painter accepts the frame at two camera angles, and the optical composition cache survives a model Pan/Nick turn with a freshly recomposed source. Fully hidden towers correctly emit **no commands** and must not be mistaken for omitted objects. Report fill triangles, boundary leaves and explicit numerical/budget failures separately.

## Representative measurements

One local Node run after patch 114.1 (machine- and JIT-dependent):

| Scene | Cold optical composition | Outline unresolved | Known interpretation |
|---|---:|---:|---|
| Flat + Standard, 87 towers | ~0.25–0.35 s | 0 | No finite physical ground horizon inferred |
| Globe + Standard, 87 towers | ~0.85–1.0 s | **130** | Narrow horizon/boundary leaves, no solver/budget failures |
| Flat + inverse-spherical, 4 towers | ~0.15–0.2 s | 12 | Narrow horizon/boundary leaves |
| Globe + Vacuum, 4 towers | ~0.01–0.02 s | 12 | Narrow horizon/boundary leaves |
| Flat + Standard, 202 towers | ~0.25–0.5 s | 0 | Complete authored tower metrics |
| Globe + Standard, 202 towers | ~3.2–3.5 s | **276** | Boundary leaves and legitimately fully occluded towers |

The tested off-grid adaptive-field maximum angle difference was approximately **0.015 angular-equivalent px** at 1920px/60°, but this does **not** establish a global maximum or real Canvas pixel difference. Cold composition time is **not** browser full-frame paint time. Run `--full --json` for the current local values; no timing has been baked into pass criteria.

## Browser acceptance (manual)

1. Use `TrnsmLine`, `Physical optics · shared scene`, 85 towers, observer height 15 m. Test **Flat + Standard**. The tower banks and opaque foundations should remain in the same painter order as patch 114.1, with `0 unresolved` and `0 fill uncertainty` for this baseline. Change `Pan` both ways: the picture moves, and `optical geometry cached` appears.
2. Switch to **Globe + Standard**, keeping height and tower count. Expect an optical ground horizon of approximately **16.00 km**. A small `horizon/boundary` count (historically ~130) is still expected and is NOT a successful proof of full silhouette completeness; `solver` and `sample-budget` should be zero.
3. Switch to **Globe + Vacuum**. The 15 m observer horizon should be approximately **13.825 km**. Compare the near-horizon visible sections at the same viewpoint; the optical edge moves with the medium.
4. Switch to **Flat + inverse-spherical**, `Comparison R = 6371000 m`. The *grazing* ground horizon should be approximately **13.825 km**, matching Globe vacuum; the projected image angles may still differ. Flat + Vacuum and Flat + Standard should not acquire an artificial finite horizon from the 100 km **drawing-only** ground-grid extent.
5. Test 200 towers, `Pan` changes and foundation overlaps. Watch for any visible polygon ordering regression, missing fill, stutter and outstanding boundary leaves. A fully ground-hidden distant tower is not supposed to be drawn.

## Not yet solved / what does not pass as visual completeness

- ~130 horizon/boundary outline leaves in the 87-tower Globe Standard case and ~276 for 202 towers remain **explicit**. Neither is evidence of a solver failure, and neither is silently filled.
- Scene painter commands are validated, but **no real browser screenshot or pixel-level image comparison** has been performed by this CLI. A virtual painter with two camera poses is not an automatic browser acceptance test.
- A fixed 0.5-pixel angular-equivalent qualification on selected samples cannot prove maximum raster error across arbitrary surfaces, viewing FOVs, angles or multipath caustics.
- Individual-tower painter sorting is adequate for separated structures but not a replacement for per-pixel Z-buffering of intersecting 3D faces.
- Physical ground is still shown with wireframe guides, not a solid ground surface; the renderer has no global multipath completeness guarantee.

Suggested follow-up: prioritize near-horizon boundary leaves and any manual browser discrepancies before declaring physical image equivalence. If the remaining visible image is accepted, consolidate the diagnostics UI (the single-line statistics are now very dense) and consider asynchronous progress for high-density Globe scenes. Do not relax first-ground-hit verification to make the report look clean.
