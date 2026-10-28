# Modern UI plan — compatibility patches 130–134

Decision date: 2026-10-28. Status: implementation in progress; **patch 130** introduces the separate Modern entry and a functional single Physical scene. This document is the design agreement, not a claim that patches 131–134 are complete.

## Purpose and separation of responsibilities

The original Curvature App grew from Bislin's demonstration into a physical-optics engineering tool. Do **not** replace or rework its interface during the UI transition. It remains the **Legacy engineering laboratory** for numerical accuracy, RK4, shooting, horizon checks, geometry/camera diagnostics, performance profiling, state exports and experimental flags.

The **Modern UI** is a focused physical-model visualization tool. It will expose a clear, large scene and a **Scene / Compare** workspace, not a duplicate diagnostics Lab. Extra physics-validation buttons and profiling readouts belong in Legacy. A possible future "Open in Legacy Diagnostics" action can transfer an explicitly serialized physical experiment without duplicating the diagnostics interface.

**Both UIs must use the same** `CurveAppClass`, `CurvaturePhysicalWorldGeometry`, `CurvaturePhysicalSceneOptics`, `OpticalRayTracer`, `CurvatureMainCanvasRenderer`, camera, shared scene composition, geometry and painting modules. Modern must not implement an alternate simplified physical formula, duplicate optical calculations, or simulate clicks on hidden Legacy DOM controls. Legacy and Modern may independently own UI layout and preferences, but their scientific semantics must not diverge.

## URL routing and startup contract

| URL | Interface |
|---|---|
| `CurvatureApp.html` | Original Legacy UI, unchanged default |
| `CurvatureApp.html?ui=legacy` or unknown `ui` | Original Legacy UI |
| `CurvatureApp.html?ui=modern` | Modern UI |

Patch 130 uses a **separate Modern document** (`CurvatureModern.html`) so Legacy's parser-time `document.write` controls and `GraphX3DX` bootstrap do **not** run in a hidden DOM. A small, early router redirects `?ui=modern` before Legacy loads. The Modern entry attempts to restore the canonical `CurvatureApp.html?ui=modern` browser address using same-origin `history.replaceState`; this is best-effort on restrictive `file://` security policies, and does not affect the rendered app. A fixed `<base>` retains asset paths after the visible URL is restored. A standalone `CurvatureModern.html?ui=modern` may also be used while debugging.

Legacy still executes its original script order and its own runtime when selected. `?ui` is a *shell selector*, not an optical model switch or a state-sharing protocol. Do not overwrite Legacy saved settings merely by opening Modern.

## Modern UI — target

### Scene

- One physical renderer/viewport, large and responsive, with a shared engine (not a second implementation).
- Camera: observer height, focal length/FOV, Pan, Nick, Roll, aim.
- Surface: continuous curvature, Earth reset, exact flat endpoint `kappa=0`.
- Atmosphere: vacuum, standard and engineered profiles with their **independent** comparison/occlusion radii.
- Objects: shared object distances, azimuths, heights, types and physical sizes.
- Display and experiment presets separated from physical parameters.
- A handful of meaningful scene status values; no wall of RK4 or diagnostic controls.

### Compare

- Two **physical** models A and B with independent surface curvature, atmospheric model and profile-specific optical parameters.
- **One** observer, object geometry, viewport angular scale and camera pose: comparisons must not reorient/move towers or automatically aim at different horizons.
- Two physically evaluated frames using separate (appropriately keyed) optical solutions. Do not fake Compare with a copied Canvas, side-dependent legacy geometry or a screenshot.
- Identical angular scale and clearly explained per-viewport field-of-view/cropping choice; accurate clipping per viewport. Prefer side-by-side before overlays.
- Independent caches where the model physics differs, and reuse only when inputs and physical results are identical.
- Suggested presets: Globe Vacuum ↔ Flat Vacuum; Globe Standard ↔ Globe Vacuum; Globe Standard ↔ Globe Inverse spherical; Globe Standard ↔ Flat Inverse spherical.
- The "inverse spherical" label refers to an engineered **atmosphere**, not a replacement Earth radius. No claim of equivalence beyond observations actually tested.

### Legacy Diagnostics and reproducibility

- Legacy retains physical sanity checks, detailed errors, RK4/shooting diagnostics, exports and older Bislin/FlatEarth comparisons.
- Future explicit save/restore/share of a **physical experiment** should cover camera, observer, objects, both model options and profile parameters; UI layout and persisted state should be versioned separately.
- Do not make Modern depend on Legacy DOM field IDs or the old controls as an API.

## Incremental delivery and acceptance

| Patch | Scope | Acceptance |
|---|---|---|
| **130** | Router, isolated Modern document, working single Physical scene, basic controls and shell, this architecture plan | `?ui=legacy` and no `ui` remain Legacy; `?ui=modern` loads without legacy controls or handlers; common renderer is invoked; explicit Compare placeholder; no physics edits; unit/static checks and manual browser acceptance |
| **131** | Complete Scene controls/presets and a small reusable state adapter | Sliders/fields update one shared model, objects/presets work, save semantics are clear; UI stays readable and responsive |
| **132** | Two Physical viewports, one scene/camera and consistent clipping/scale | A/B frames each independently computed by same renderer; matched pose, geometric layout and angular scale; compare artifacts tested |
| **133** | Independent curvature and atmosphere/profile parameters, pair selection and presets | Arbitrary valid pairs, independent cache keys, engineering profiles clearly labeled, consistency across near-flat and exact-flat configurations |
| **134** | Saved experiments, migration/compatibility, visual polish and final acceptance | Reproducible state/share links; regression/interactive tests; no hidden legacy UI execution, no diagnostic pollution, and direct Legacy access |

Exact numbers may be split if an integration reveals a larger risk; tests and physics invariants outrank patch-number neatness. Recommended reasoning effort: High for 130–133; Medium/High for 134.

## Patch 130 intentionally deferred

- Compare is **not implemented**; it is a visible, explicit placeholder.
- The initial Modern scene starts with the Transmission Line demo configuration (no legacy animation scripts); other presets and full object editing are for 131.
- No automatic cross-UI transfer of the currently selected scene, and no modification of Legacy save/restore.
- Browser acceptance and visual finish can require follow-up work without redefining optics.

## Testing, compatibility and non-goals

- Preserve all existing Legacy test and numerical reference outputs.
- Use `node --test tests/*.test.js`; additionally validate URL routing, script isolation, controls and common renderer integration.
- Browser check both entrypoints (including local `file://` when used), initial Modern Physical output, curvature and atmosphere controls, and `Scene`/`Compare` switches. Report browser access restrictions rather than assuming success.
- Do **not** add React or a new build/dependency chain solely for styling; classic JavaScript, HTML and CSS are sufficient.
- Scientific precision requirements and full multipath/occlusion support are outside this UI restructuring; they remain a Legacy-engineering concern.

## Patch 131 delivery — Modern Scene controls

Patch 131 keeps the two-entry architecture and the one actual `CurveAppClass` +
Physical renderer. `src/ui/modern/ModernSceneState131.js` is a small, pure,
validated Scene-state adapter, **not** an independent scene model or optics
engine. Input events mutate the active model; `model.Update()` remains the
single calculation/normalization path. Numeric typing is debounced (420 ms),
slider dragging (300 ms) is coalesced and change/Enter flushes immediately.
Selecting a preset cancels pending edits so earlier typing cannot overwrite it.

The Modern Scene panel now offers observer height, focal length and directly
editable FOV, Pan/Nick/Roll, aim, exact-flat toggle, continuous curvature and a
finite radius in km, atmosphere, the independently set comparison/occlusion
radius for engineered optics, both physical object groups (type, count, start,
spacing, lateral offset, size and variation), and metric grid visibility. The
Physical renderer currently supports group object types 0–3 only; the Modern
selector intentionally excludes unsupported legacy-only object types rather
than displaying a working-looking but broken control. Camera FOV and focal
length are two synchronized inputs to one model, not separate camera states.

Three self-contained Scene presets are available: the known Lake Pontchartrain
transmission-line tower configuration and two **explicitly illustrative** tower
scenes, not reimplementations of Bislin's animation demos. Presets reset both
object groups and variations. Editing marks the selection "Custom (edited)";
"Reset selected preset" restores the last selected preset. No Save/Load is
implemented in 131. Changes remain in the current Modern page session and do
**not** silently overwrite Legacy saved settings; versioned reusable experiments
and share links remain scheduled for **134**.

Patch 131 acceptance: controls mutate exactly one model and drive the shared
renderer; FOV/focal and radius/curvature controls stay synchronized; presets
reset consistently; invalid input never changes geometry; numeric typing does
not repeatedly run expensive shooting; no Legacy UI initialization. Compare is
still an explicit placeholder until patches 132–133.

## Patch 131.1 — compact settings navigation and contextual help

Following browser acceptance of patch 131, the long left-hand scroll was deemed
unwieldy. Patch **131.1** changes **Modern presentation only**:

- Scene settings use five mutually exclusive keyboard-accessible tabs: **Camera,
  Surface, Atmosphere, Objects, Display**. A single category is visible at a
  time; controls keep their IDs, values, event handlers, validation and one
  active `CurveAppClass`. Switching a tab must not reset a field or recalculate
  optical paths.
- Preset selection and Reset move to the toolbar **above the physical scene**;
  their existing 131 state adapter remains the only preset implementation.
- Small `?` help controls explain the *physical meaning* of parameters on hover
  and keyboard focus, especially curvature versus atmospheric occlusion radius.
- The sidebar is wider, numeric **FOV display** is rounded to four decimals
  without reducing the internal model precision; full render diagnostics remain
  available via the status tooltip. No changes to the Legacy diagnostic UI.

Acceptance: no new physics/raster implementation, stable IDs and state binding,
no accidental optical calculation on tab switch, no hidden legacy UI execution,
all previous tests green, and a manual Modern browser layout check. Compare
remains the explicit placeholder for 132–133. Future controls should follow the
same tab-and-help conventions rather than reinstating an infinitely scrolling
sidebar.
