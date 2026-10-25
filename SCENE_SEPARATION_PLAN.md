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

## Phase 2: opt-in legacy graph command recording

`LegacySceneAdapter.record(graph, drawCallback)` wraps selected graph methods
for the duration of a *normal* drawing callback. It forwards every call to
the original graph, records argument snapshots, and restores the graph even
if drawing throws. `replay(freshGraph, trace)` reissues the recorded commands.
The recorder is loaded in the page but is **not activated** by default.
It does not yet capture direct canvas/driver calls, graph property writes,
transforms not exposed through recorded methods, or nested calls with
non-plain arguments. Therefore a trace is **not yet guaranteed** to reproduce
a complete DrawModel frame: this is a tested adapter foundation, not a claim
of pixel-identical browser replay. Next phase must audit actual traces and
add missing state/commands before replacing any live drawing path.

This command stream is intentionally distinct from the physical 3D primitives
in `CurvatureSceneContract`: the former captures graph API operations, while
the latter describes the desired engine-independent scene.

## Phase 3: actual API surface inventory and diagnostic frame capture

`LegacySceneAudit.js` is a **passive** source/trace auditor. It inventories
explicit `g.Method(...)` call sites in the original HTML and compares them
against `LegacySceneAdapter.METHODS`. It can also capture a diagnostic drawing
callback with `captureFrame(graph, draw)`, which performs the normal draw and
returns a trace and per-method counts. The audit helper is loaded in the page but is not wired into `DrawModel` automatically. For an explicit diagnostic capture in the browser console, use `LegacySceneAudit.captureFrame(graph, DrawModel)` (this draws a frame as a side effect).

The inventory exposes important gaps in the phase-2 recorder, including
`SetAlpha`, `CircleOnPlane`, `RectOnPlane`, `SetCamera`, `SetClipRect`,
`SaveTrans3D` / `RestoreTrans3D`, and graph reads/transforms. In addition,
`DrawModel` assigns `g.MaxCurveSegments` directly. Neither this assignment nor
other internal canvas/driver state is captured by the current recorder.

**Do not use these traces as complete frames.** A replay verification gate
requires capturing the full stateful API (including non-method state), then
comparing original and replay images for globe/flat, atmosphere/vacuum and
multiple camera positions. The static inventory cannot prove full coverage,
and `replayVerified:false` is deliberately returned by the diagnostic helper.

Next: instrument a *real* `DrawModel` invocation in an opt-in browser harness,
compare actual invoked operations to this inventory, and define a deterministic
frame boundary including graph initialization and clipping. Keep the legacy
production draw path unchanged until replay is demonstrably equivalent.

## Phase 4: one-shot browser frame audit

Open `CurvatureApp.html`, expand **Advanced diagnostics**, and click **Capture
legacy frame audit**. This requests exactly one pass-through capture at the
actual `DrawFunc` boundary; the normal `DrawModel(g)` still paints the frame.
The browser downloads `legacy-frame-audit.json` with method counts, not the
full command arguments (which may contain scene data). The same report is
available as `window.LastLegacyFrameAudit` for inspection. Send the downloaded
JSON when comparing actual executed graph methods with the phase-3 inventory.

**Limitations:** capture counts only the adapter's allowlisted outermost graph
calls. Unrecorded methods, direct graph property assignments (including
`MaxCurveSegments`), internal graph mutations and canvas calls remain outside
this report. `replayVerified` is always `false`; this step does not enable
replay or replace the legacy rendering path. If capture throws, a normal
`DrawModel` call is attempted and the error is displayed in the diagnostic UI.

## Phase 5: JsgPolygon argument snapshots

The 1631 browser audit found four `PolygonOnPlane` calls with a `JsgPolygon`
argument. The recorder now snapshots the active `Size` vertices (X/Y and
optional Z) with a tagged JSON representation. Replay reconstructs an actual
`JsgPolygon` instance using the browser global constructor or the explicit
`{JsgPolygon: Constructor}` option. This is deliberately restricted to this
known graph type; arbitrary class instances remain unsupported.

The audit's `captureComplete` can now be true for this scene, but it is **not**
a guarantee of replay completeness: graph property writes, non-allowlisted
methods, and internal canvas state remain outside the capture boundary.
`replayVerified` must remain false until visual equivalence is tested.

## Phase 7: isolated replay dispatch preflight (NOT visual replay)

The browser audit now includes `isolatedReplayPreflight`. It round-trips the
complete JSON command stream and dispatches every command onto an isolated
shadow graph. This validates serialization, supported methods and dispatch
order without touching the active canvas. It does **not** establish image
identity, graph-state equivalence or completeness of the capture boundary.
`replayVerified` remains `false` regardless of the preflight result.

For deeper investigation, check **Export full command trace (large JSON)**
before clicking the audit button. This downloads `legacy-frame-commands.json`
in addition to the summary. It can be large and may contain scene parameters;
share it only when needed. The active renderer is unchanged. A subsequent
phase must create a properly initialized independent graph/canvas and compare
its output against the original before enabling real replay.
