# Compatpatch 96 — independent world frame and renderer boundary

The project has **two different frame formats**, intentionally kept distinct:

- `src/scene/SceneFrame.js` represents recorded **legacy GraphX3DX commands**.
  `SceneFrameRenderer` replays them to a supplied graph and is unchanged.
- `src/scene/CurvatureRenderFrame.js` represents a **world-space 3D scene**
  (`CurvatureSceneContract`), a perspective camera snapshot, canvas backing-store
  viewport, and ordered layers. It contains no drawing commands or live Canvas.

Do not deserialize one as the other. The discriminators are
`scene-command-frame` and `world-scene-frame` respectively.

## Contract

```js
const composed = CurvatureIndependentComposition.composeFull(model, objIx, globe);
const frame = CurvatureRenderFrame.fromComposition(composed, cameraSnapshot,
  canvas.width, canvas.height);
CurvatureFrameRenderer.render(canvas, frame, {mode: 'painter'});
// The same frame can be rendered using {mode: 'zbuffer'}.
```

`fromScene(scene, camera, width, height, optionalLayers)` is available for
non-composed scenes. Frames have `version`, `kind`, `scene` (3D line/polygon
primitives including world points, styles and `commandIndex`), `camera`,
`viewport` and `layers` (name, role, start/end/count). They are JSON-safe
snapshots and do not alias the caller's scene or camera. Optional `undefined`
properties in legacy guide styles are omitted, equivalent to JSON serialization.

The boundary rejects invalid camera bases and viewports, duplicate/out-of-order
command indices, and overlapping/gapped/incomplete layer ranges. A generic
`geometry` layer is used when none is supplied. Before rendering, the frame is
validated and copied again; the Canvas must exactly match its viewport.

`CurvatureFrameRenderer.render(canvas, frame, {mode})` is the unified renderer
entrypoint. It provides `mode`, `statistics`, `geometryStatistics` and
`layerCounts` for either rendering method. Painter mode preserves independent
command order (and its horizon mask) and uses ear clipping for polygon fills.
Z-buffer mode depth-tests independent polygons, using its current diagnostic
flat-color rasterizer; **it does not yet reproduce painter strokes or styles**,
nor does it automatically replace the horizon mask with a physical globe mesh.
Do not treat the two renderers as pixel-equivalent.

`CurvatureCompositionCapture.capture()` now uses the unified frame and renderer
in painter mode by default, preserving existing diagnostic output. The optional
`rendererMode: 'zbuffer'` is for explicit diagnostic experiments only.

## Compatibility and rollout

- The live `DrawModel()` and primary Canvas are unchanged.
- Existing `CurvatureIndependentComposition` APIs and the legacy command-frame
  replay contract remain in place.
- `CurvatureApp.html` loads the frame after `CurvatureSceneContract`, and the
  renderer after `CurvatureEarClip`, before `CurvatureCompositionCapture`.
- Browser smoke test: reload `CurvatureApp.html`, change Height/Pan and
  Globe/Flat, then export diagnostics. Check the console for script errors.
- Next step (#97): opt-in Legacy / Independent switch for the main Canvas, while
  retaining the old renderer as default and respecting the painter/Z-buffer
  semantics explicitly.
