# Headless Legacy numerical reference

Historical work item: **#140.12.58**. Status: **six reproducible, same-code numerical regression snapshots**. This is **not** an independent physical oracle, a ray-tracing comparison, a pixel baseline, or proof of parity with Modern.

## Provenance and execution boundary

The input is the data-only [TransLine / Bedford source-state fixture](legacy-reference-scenarios.md), extracted from `src/animation/CurvatureDemos.js` in the previous step. The Node-only [headless adapter](../tools/legacy-headless-reference.js) runs the **existing** `CurveAppClass` and `CurveApp.Update()` from `src/app/CurvatureModel.js`. It also runs the actual `BaroConst`/`BaroModel` calculations from `src/app/CurvatureAtmosphere.js`.

The adapter creates a fresh Node `vm` context for each state. The vector operations required by `CurvatureModel.js` are supplied as small, explicit mathematical helpers. The two atmosphere **panel-registration** calls receive inert control-panel objects; no DOM, canvas, animation, event loop, URL routing, browser storage, Modern renderer or WebGPU is used. The original model/atmosphere equations are **not** reimplemented in the adapter. A change to their external dependencies that the adapter cannot satisfy should fail rather than be silently ignored.

The loader accepts only JSON objects and fields declared by the original `CurveAppMetaData` (matching scalar/array types). It copies the fields onto a newly constructed model, marks `AllStatesChanged` and invokes `Update()`, following the same **model update convention** as the Legacy JSON-restore path. This is *not* an implementation or verification of `DataX.FromStream`, `?state=`, Legacy animation playback, or all UI-specific side effects. Do not treat the `vm` wrapper as a security boundary for arbitrary JavaScript source; it executes the trusted, checked-in project scripts. Fixture *data* is never evaluated as code.

## What was measured

The immutable [numeric fixture](../tests/fixtures/legacy-headless-numerics.json) contains six `demo`/`sourceIndex` keyed snapshots (TransLine 0, 4, 7; Bedford 0, 3, 6). Each snapshot stores derived observables, with units:

- **Refraction:** Legacy `refractionSync`, effective-radius coefficient `k`, radius factor and effective radius (metres); temperature (°C), pressure (hPa), gradient (K/m), standard barometric temperature (K) and pressure (Pa).
- **Horizon:** observer height, physical Earth radius, effective geometry radius, dip (radians), horizon surface arc/radial/line-of-sight distances (metres), legacy horizon refraction-angle diagnostic (degrees).
- **Camera:** field of view (degrees), panning angle (radians), direction/up vectors and original scene-size field (Legacy world units).
- **Object:** original model's first-object angular size/refraction angle (degrees), view distance and absolute/relative lift diagnostics (metres). These are `CurveApp.Update()` computed fields, **not** a full sequence rendering of 85 towers or 49 markers.

The Legacy `legacy-k` mode uses an *effective curvature radius*. Its outputs must **not** be mistaken for the currently promoted CPU physical RK4 atmosphere solver. The old model's `refractionSync = 1` with explicit `k = 0` in the final TransLine state is a no-refraction case; `refractionSync` by itself is not a boolean “refraction on/off” indication. `BaroModel` computes standard pressure/temperature even when the selected Legacy effective-radius coefficient is zero.

| Demo / source index | Height (m) | Legacy k | Derived horizon arc (approx. km) | Status |
| --- | ---: | ---: | ---: | --- |
| TransLine / 0 | 100 | 0.1693943 | 39.167 | Standard-atmosphere Legacy effective-radius mode |
| TransLine / 4 | 15 | 0.1704565 | 15.179 | Standard-atmosphere Legacy effective-radius mode |
| TransLine / 7 | 15 | 0 | 13.825 | Explicit no-refraction coefficient |
| Bedford / 0 | 7 | 0 | 9.444 | Marker scene; geometry/model fields only |
| Bedford / 3 | 4.04 | 0 | 7.175 | Marker scene; geometry/model fields only |
| Bedford / 6 | 4.04 | 0 | 7.175 | Dense marker scene; geometry/model fields only |

Rounded values above are for orientation; the fixture stores full JavaScript double outputs. These results come from one program implementation and are **regression observations**, not independently measured ground truth.

## Reproduce and validate

From the repository root:

```sh
node tools/extract-legacy-demo-fixtures.js --check
node tools/legacy-headless-reference.js --check
node --test tests/LegacyHeadlessReference.test.js tests/LegacyReferenceScenarios.test.js
```

`--check` recomputes all six results and compares each numeric field with the **committed** JSON, failing on missing fields, changed metadata or values exceeding **absolute + relative tolerance**, each set to `1e-12` for the snapshot comparison. It does not silently update the reference.

Only if a review *intentionally accepts* changes in the original Legacy model, regenerate the numeric snapshot:

```sh
node tools/legacy-headless-reference.js --write
```

Review the JSON diff and explain why each changed observable is correct **before committing**. Do not use freshly generated values to claim independent validation. The companion tests also check separate geometric identities, atmospheric consistency, input immutability, invalid-field rejection and the expected distinction between standard effective-radius and `k = 0` cases. Their comparison against an algebraically equivalent line-of-sight formula uses a looser `1e-10` relative tolerance because the legacy `sin(acos(...))` calculation loses precision near the horizon; this does not change the underlying implementation.

## What is still missing before Legacy retirement

1. Browser-observed Legacy output for every relevant sample: viewport/DPR, exact applied defaults, rendered pixels/screenshots, ray/visibility traces and their file hashes.
2. An independently implemented physical/numerical oracle (or separately established analytical solution), with predeclared units/tolerances. The same-code JSON snapshot alone cannot establish correctness.
3. A documented translation or explicit refusal of unsupported Legacy geometry/state into Modern, with a separate parity test where possible. No automatic `?state=` / `?experiment=` conversion is provided.
4. Preservation or replacement of diagnostics on the actual renderer path (tower 21, optical occlusion, geometry and frame output). These measurements are not a renderer substitute.

For those reasons, `CurvatureApp.html`, legacy routing, reference drawing code and existing visual validation requirements **remain in place**.
