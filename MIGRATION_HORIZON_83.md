# Independent object horizon partition — patch 83

`CurvatureGeometryEngine.objectHorizonPartition(model, objIx, globe)` now partitions
all supported types (Bedford, M-Rod, Ship, T-Tower) by the legacy horizon cutoff.
`createHorizonPartitionedObjectScenes` returns independent behind/before layers,
and `createObjectHorizonComposition` inserts the white globe mask and horizon
outline in painter order.

`CurvatureIndependentComposition.compose` now uses this general composition.
Legacy tower-only APIs remain available and reject non-tower object types.
The `objectsOnly` option suppresses auxiliary horizon outlines while retaining
the globe occlusion mask (`towersOnly` remains an alias).

This is a painter-order classification, not analytic polygon clipping. No
Canvas, DOM or GraphX3DX dependency was added to the geometry engine. The
primary DrawModel UI path remains unchanged. Pixel-identical rendering and
migration of the remaining unsupported scene elements are not claimed.
