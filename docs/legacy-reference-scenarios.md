# Reproducible Legacy reference scenarios

Status: **source-state fixtures** (historical work item #140.12.57). These are **not a rendered oracle or pixel baseline**, not a numerical ray-tracing oracle, and not proof of Legacy/Modern equivalence. No reference screenshots, optical output arrays or browser captures were supplied in this repository for these snapshots. Their capture status is **missing**.

## Provenance and intended use

- Source: [`src/animation/CurvatureDemos.js`](../src/animation/CurvatureDemos.js), `Demos.New('TransLine')` and `Demos.New('Bedford')` plus their literal `Demos.AddState('CurveApp = {...}')` arguments.
- Fixtures: [`tests/fixtures/legacy-reference-scenarios.json`](../tests/fixtures/legacy-reference-scenarios.json). These retain **all JSON fields as written** in the selected source states, including old fields absent from Modern. Missing fields (for example, `refractionCoeff` in early `TransLine` states) are *not* interpreted as zero or filled in with inferred defaults.
- Extraction: [`tools/extract-legacy-demo-fixtures.js`](../tools/extract-legacy-demo-fixtures.js), a deterministic, data-only Node extractor. It parses exact JSON literals; it does not load the old page, execute its scripts, or evaluate input as JavaScript.
- Validation: [`tests/LegacyReferenceScenarios.test.js`](../tests/LegacyReferenceScenarios.test.js) checks every selected field against source, source ordering, Legacy query hints, and a few important *input* invariants. It does not test optical correctness or match frame buffers.

Regenerate and check after deliberate edits to the source demos:

```sh
node tools/extract-legacy-demo-fixtures.js
node tools/extract-legacy-demo-fixtures.js --check
node --test tests/LegacyReferenceScenarios.test.js tests/LegacyMigrationPlan.test.js
```

The `legacyQuery` strings are **navigation hints** for the historical `?demo=` and `?pos=` conventions, not complete serialized `?state=` streams, and were not verified in a browser. Use them against the Legacy page, not `CurvatureModern.html`. The JSON `state` object is the parsed payload of the exact Legacy `CurveApp = {...}` literal, not a native Modern experiment and not a supported transparent URL conversion.

## Selected samples

| Demo | Source state indices (0-based) | Why selected | Evidence status |
| --- | --- | --- | --- |
| `TransLine` (8 states) | 0, 4, 7 | Introductory transmission-line layout, closer view with grid, final no-refraction/tower curvature view | Full source states captured; rendered frames and numerical ray or pixel output **missing** |
| `Bedford` (7 states) | 0, 3, 6 | Initial markers, eye-level observation, dense marker sequence | Full source states captured; rendered frames and numerical ray or pixel output **missing** |

The selected states include Legacy `ObjType` values 3 (tower) and 0 (Bedford marker). Equal integer IDs in Modern are not sufficient evidence of geometry equivalence. A geometry-specific comparison must account for both models' meanings and full camera/atmosphere semantics. Values are copied from the code without rounding; no claims are made about real-world survey accuracy.

## Capture manifest (not yet populated)

For **each** of the six samples above, future browser-based reference collection must still record at least (the separate [numeric model snapshots](legacy-headless-reference.md) do not replace these browser captures):

| Required evidence | Current state |
| --- | --- |
| Original source index, full parameter payload and query hint | **Available** in JSON fixture |
| Browser version, OS, device scale, viewport and canvas pixel dimensions | **Missing** |
| Explicitly selected atmosphere, effective model defaults and Legacy UI configuration | **Missing** (source payloads only) |
| Rendered Legacy screenshot/frame and its SHA-256 | **Missing** |
| Numeric ray/visibility observables with units and tolerances | **Missing** (same-code model angle diagnostics exist separately; no optical ray/visibility captures) |
| Comparable Modern scene representation, with documented unsupported fields and conversion loss | **Missing** |
| Review of physical-model differences and acceptance decision | **Pending** |

Do not fill missing rows with synthetic data. Where a source snapshot omits atmosphere fields, obtain the values actually applied by the Legacy loader and record that separately. Capture dimensions and tolerances should be decided **before** comparisons; do not select thresholds after looking at mismatches. Any new renders must be treated as measurements, not automatically accepted goldens.

## Retirement impact

This is the first narrow *source-fixture* portion of [Legacy migration planning](legacy-migration-plan.md); it does **not** satisfy the full Legacy-retirement gate. Keep `CurvatureApp.html`, Legacy state serialization, scientific comparison tools, CPU reference methods and WebGL2 until browser captures, numerical oracles, compatibility behavior and actual Modern semantics have been verified. These fixtures allow headless source regression checks. The follow-up [same-code numerical adapter](legacy-headless-reference.md) now records six horizon/camera/atmosphere calculations, but does not provide a ray, image or independent physical oracle.
