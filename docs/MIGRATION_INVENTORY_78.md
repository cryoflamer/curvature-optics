# DrawModel migration inventory — compatch 78

Scope: static, source-anchored inventory of `CurvatureApp.html`; **no production rendering changes**.
Run `node CurvatureMigrationInventory.test.js` to detect missing/renamed anchors. For machine-readable, line-numbered inventory:

```sh
node -e "const fs=require('fs'); const a=require('./CurvatureMigrationInventory'); console.log(JSON.stringify(a.inspect(fs.readFileSync('CurvatureApp.html','latin1')),null,2))"
```

## Ownership and proposed migration sequence

| Priority | Existing owner | Content | Independent destination | Gate |
| --- | --- | --- | --- | --- |
| 1 | `DrawModel` | viewport, camera, clipping | immutable camera/viewport in `SceneFrame` | equal projection, independent camera snapshots |
| 2 | `DrawShape`, `SetTrans`, `DrawShapeVariants` | object types and variant placement | `CurvatureGeometryEngine` | vertex correspondence for each `(objIx, ObjType)` |
| 2 | `DrawObjectsBehindHorizon`, `DrawObjectsBeforeHorizon` | far/near passes and white horizon occluder | scene layers and explicit visibility | occlusion regression, including empty/fully hidden towers |
| 2 | `DrawModel` | globe horizon circle and tangent | horizon geometry + annotation | globe/flat and altitude cases |
| 3 | `DrawModel` | flat reference circles, concentric/radial grid | flat-grid generator | radius and step/count correspondence |
| 3 | `DrawModel` | spherical and comparison-flat lat/long grids | world-space grid generator | numerical world-coordinate checks |
| 4 | `DrawModel` | eye-level and tangent annotations | screen/world annotation layer | independent text/line placement |
| 5 | `DrawModel` | split-screen labels and half-screen clipping | renderer viewport/overlay | both modes together, left/right swapping |
| 5 | `DrawModel` | optical/P4 diagnostics and frame | separate overlay integration | async stale result handling and visual parity |

## Specific source dependencies / pitfalls

- `DrawModel` reads live `CurveApp`, initializes `g.SetViewport`, `g.SetCamera`, `g.SetCameraZoom`, and sets clipping. It mutates graph state (`MaxCurveSegments`) and draws viewport labels.
- Flat reference circles use `rFEarth` and `2*rFEarth`; the comparison flat horizon on globe uses `rDisk`. They are different visual elements and must not be merged.
- Globe grid paths use `PointOnEarth`; projected-flat comparison grid uses `PointOnPlane`. Their loop limits use `aDip`, `aDelta`, `hDisk`, and `geometryRadius`.
- `DrawShape` uses **both** `objIx` and `ObjType`: `ObjType=3` selects Tower Type 1 for Objects 1 and Type 2 for Objects 2.
- `DrawObjectsBehindHorizon` may paint a white occlusion disk; `DrawObjectsBeforeHorizon` changes styles and visibility. Preserve draw order separately from 3D coordinates.
- `DrawModel` conditionally calls `CurvatureProjectionCalibration`, `CurvatureTowerOverlay`, `CurvatureInverseOpticsBridge`, and `CurvatureRenderedVertexAudit`. These are side-effectful hooks, not geometry primitives.
- `showModel=3` uses half-screen canvas clipping and labels. A single full-frame render is not a substitute.

## Non-goals of this compatch

No geometry is ported; no legacy drawing is removed; no claim of complete static/dynamic dependency coverage. The inventory is a change-detection aid and planning gate. Next: implement Type 1 and remaining object shapes **after** reviewing the inventory and confirming shape branches and their transformations.
