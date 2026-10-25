# Scene separation: phase 1 inventory and contract

This document records the *existing* rendering path before moving any behavior.
No production draw path is changed in phase 1. `CurvatureSceneContract.js`
is a passive, versioned contract and does not claim that either engine already
implements it.

## Current execution and ownership (CurvatureApp.html)

1. UI / controls call `UpdateAll(stopAnimation)` (around line 1243).
2. `UpdateAll` invokes `CurveApp.Update()`, synchronizes the optics UI,
   updates `ControlPanels`, calls `graph.Redraw()`, and requests
   `ScheduleOpticalP4Refresh()`.
3. The graph is created with `DrawFunc: DrawModel` (around line 1276).
4. `DrawModel(g)` owns camera, viewport, Earth/flat-Earth rendering, horizon,
   objects and overlay ordering. It reads the live `CurveApp` object.
5. The legacy objects are emitted by `DrawObjectsBehindHorizon` and
   `DrawObjectsBeforeHorizon`, via `DrawShapeVariants`, `SetTrans`, `DrawShape`.
   The legacy painter traversal runs from far to near. The globe path also
   paints an occluding horizon disk between the two object passes.
6. `DrawShape` emits `g.LineOnPlane` / `g.PolygonOnPlane` calls; `GraphX3DX.js`
   transforms and draws the primitives. This is **not** a clean compute/draw
   boundary: shape generation and drawing share a mutable graph transform.
7. Optical P4 calculation and drawing are currently coupled in
   `CurvatureInverseOpticsBridge.js`. Its overlay is invoked by `DrawModel`;
   it uses captured legacy tower vertices and a separate apparent projection.
8. Current tower suppression temporarily overrides `g.LineOnPlane` and
   `g.PolygonOnPlane` in `DrawShape`. It is a migration workaround, **not**
   a suitable permanent engine switch.

## Contract defined in CurvatureSceneContract.js

- `captureState(CurveApp)` takes a *defensive snapshot* of selected, original
  model properties. No refraction conversion is performed; missing fields
  remain absent. More fields will be added after the control dependencies
  are inventoried during adapter implementation.
- `createScene(source, primitives, metadata)` validates and copies a scene.
  `source` is `legacy` or `optical-p4`.
- Each primitive has `type: 'line' | 'polygon'`, 3D `points`, and may carry
  `mode`, `visible`, `style`, `tower`, and other engine-independent metadata.
  Primitive array order is preserved as painter order.
- `metadata` is reserved for camera/horizon/clip information. Its semantics
  are deliberately **not** frozen yet; the existing graph has nontrivial
  camera transforms and globe horizon clipping that need explicit treatment.

## Migration gates (next compatches)

1. Build a **recording adapter** for the original graph primitive calls,
   including transforms, styles, clipping and draw order. Verify that replay
   through the existing graph gives an identical reference image before
   changing the active path.
2. Introduce a shared renderer using the validated recording format.
3. Adapt Optical P4 to the same format, retaining the legacy renderer as a
   selectable, independent control.
4. Only then bind the lower control-panel sliders to both adapters. Cancel
   stale asynchronous P4 computations before applying results.

## Regression matrix

- Original Globe/Flat Earth, vacuum and standard atmosphere.
- Tower #21 and the full 85-tower scene, foundations and steel.
- Far-to-near painter ordering, outlines, water/ground horizon masking.
- Camera height, zoom, pan, pitch/nick, roll; fast engine switching.
- Empty/invalid P4 data must never blank the legacy reference scene.

Do not equate the legacy `k` refraction approximation with Optical P4's
index-of-refraction model; only the external scene contract is shared.
