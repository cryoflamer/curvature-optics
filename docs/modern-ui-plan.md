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
Physical renderer. `src/ui/modern/ModernSceneState.js` is a small, pure,
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

## Patch 132 — paired Physical viewports (initial Compare)

Patch **132** implements **two real Physical render calls** side by side in the
Modern Compare workspace. Both A and B have their own GraphX3DX Canvas,
backing store, viewport transform and raster clipping, and both invoke the
existing `CurvatureMainCanvasRenderer.renderPhysical` rather than reusing a
screenshot or legacy `Globe+FE` path. No physics routines have been forked.
The new `ModernCompareModel` clones the shared authored `CurveAppClass`
state (copying its object arrays) to isolate per-model changes.

The **initial fixed pair** is A = current Scene curvature and B = exact
flat (`showModel=2`, κ=0), with the **same** atmosphere and atmospheric
comparison/occlusion radius. Both use the observer-fixed Eye-level camera
(`viewcenterHorizon=3`) regardless of any curvature-dependent horizon aiming
selected in Scene, and retain identical observer position, Pan/Nick/Roll,
FOV, object coordinates, counts, dimensions and grid settings. The source
Scene model is not mutated by switching to Compare. **Arbitrary independently
configurable A/B atmospheres, surface radii, presets and cache policy are
reserved for patch 133.**

Each Compare canvas has an equal aspect ratio, equal physical pixel dimensions
and **equal angular field of view**, hence equal *pixels per degree within
Compare*. A half-width comparison viewport has fewer pixels per degree than
full-width single Scene; that is an explicitly documented UI choice, not
asymmetric camera or geometry. The `visibility:hidden` positioning before
activation is intentional: GraphX3DX creates canvases via parser-time
`document.writeln` and requires measurable container widths. On activation
both graph backing stores are resized before redrawing. Each canvas clips
strictly to its own HTML viewport.

Patch 132 also eliminates duplicate native `title` tooltips from custom
`?` help controls; contextual text explains physical effects instead of
repeating labels. The Modern-only unused legacy command `SceneFrame` script
was removed because its unsatisfied `LegacySceneAdapter` import raised a
browser exception; the actual independent physical `CurvatureRenderFrame`
remains present. Legacy entrypoint and diagnostics are unchanged.

Acceptance: renderer is invoked **twice**, once per distinct Canvas;
A/B object geometry and observer-fixed cameras agree; B has truly zero
curvature; Scene state survives entering/exiting Compare; both viewports show
finite nonzero equal backing dimensions and complete independent outlines;
no unresolved pieces for the reference scene; all older regression tests pass.

## Patch 133 — independent A/B physics with the same camera/scene

Patch **133** removes the fixed-pair limitation while keeping the 132 dual
Canvas and shared Physical renderer. `ModernCompareState.js` owns two
**validated, ephemeral descriptors** (`A`, `B`): surface kind (`globe` or
`flat`), radius in kilometres, atmosphere name, and independently editable
engineered-atmosphere comparison radius (metres). Editing a descriptor leaves
Scene untouched. `ModernCompareModel.clone` creates a fresh physical model
for each side, forces the **same Eye-level observer-fixed camera**, and runs
`CurveAppClass.Update()`; no optics formula is implemented in either UI adapter.
Both sides use the original `CurvatureMainCanvasRenderer.renderPhysical`.

At patch 133 the Compare sidebar showed a separate physics-pair editor,
replacing Scene's tabs; Camera, objects, observer and display could then only be
changed after switching to Scene. This limitation was removed in patch 134.2. Returning to Compare preserves independently edited A/B physics.
The first Compare activation defaults to **A = current Scene surface and
atmosphere; B = exact flat with the same atmosphere**, preserving the visual
baseline from 132. A named pair preset explicitly overwrites both A/B physics;
all manual edits mark the pair Custom. Presets: Globe vacuum / Flat vacuum,
Globe standard / Globe vacuum, Globe standard / Globe inverse spherical, and
Globe standard / Flat inverse spherical. Engineered atmospheres are deliberately
marked as engineered models, not measured equivalence claims. The stored radius
for an exact flat model remains a finite **reference** for the physical optics
backend and does not introduce surface curvature.

The Physical renderer now accepts an optional `cacheSession` provided by
Compare. The app creates **two independent instances** of the existing optical
transformation cache (`CurvaturePhysicalSceneOptics.create()`), one for each
side, so redrawing A does not evict B's optically different result. Within each
session the established key includes model geometry, source scene, atmospheric
kind and engineered radius; there is no new independent optical algorithm.
Scene continues to use its original optical cache. Neither the Legacy document
nor its controls, state or persistence have changed.

Patch 133 deliberately does **not** implement experiment save/restore, URL
serialization, arbitrary UI preferences, or full end-to-end image matching;
these belong to patch 134 or the engineering suite. Acceptance is covered by
`tests/ModernIndependentCompare.test.js` plus the full existing tests.
Manual browser review remains necessary for viewport layout, visual contrast
and real-world performance on different presets.

## Patch 133.1 — Compare eye-level reference

The optional green Eye-level line displays the shared zero-elevation direction
for both Compare canvases. It is a presentation-only angular reference, not
an optical ray, a visible surface edge, or evidence of a horizon.

## Patch 133.2 — finite first-contact optical horizon (research diagnostic)

`src/optics/OpticalRayHorizon.js` measures an **angular first-ground-contact
boundary** with the existing `CurvatureRayTracer.trace` and its real surface
event detector. Angular launch directions are scanned, then bisected between
a confirmed ground hit and a confirmed escaping ray with an **interior minimum
of altitude above the surface**. The latter is essential: reaching the end
of the finite integration range is not proof that a ray escapes, much less
proof of a horizon. No analytic horizon law, geometric tangent distance,
grid extent, screenshot contour, or sphere-to-flat substitution is used by
this diagnostic. The closest-approach distance is estimated directly from
the integrated escaping ray.

Compare displays the signed elevation angle relative to shared Eye level
(negative = below 0°), positive dip for a downward horizon, approximate
first-contact tangent distance, and an optional dashed orange guide. Both
models have **separately keyed diagnostic caches**; changing eye-level or
horizon overlay visibility does not re-trace, and neither measurement changes
the Physical renderer's optics or its object/shadow visibility. The orange
guide uses the same screen-angle mapping as the green Eye-level guide. For
nonzero camera Roll the horizontal overlay is suppressed: a correct rolled
isoline needs a separate camera-space projection.

**Scientific scope:** this is a finite 100 km, forward-RK4 first-contact
search, with 200 m outer integration steps and a 0.00005° angular target. It
can detect a *locally supported* tangent branch and is **not** a proof of
global uniqueness, arbitrary atmospheric ray topology, absence of a horizon,
or true multipath visibility. Flat Vacuum and Flat Standard are reported
**unresolved** by this detector, not as demonstrated horizon-free models.
Extreme radius/observer profiles and range-limited or ambiguous rays are
also left unresolved rather than forcing an answer. The independent analytic
spherical-vacuum horizon formula is used ONLY in regression tests, never in
the diagnostic implementation.

Full Modern and Legacy integration are still based on the shared optics
engine. Versioned experiment saving remains scoped to patch 134.

## Patch 133.2.1 — Compare angular-guide sign correction

The traced first-contact horizon angle was correctly measured in patch 133.2,
but its orange screen-space guide previously reflected the sign of its signed
elevation: negative angles were plotted **above** the green 0° eye-level.
This was a presentation error, not an RK4 horizon-search or optics error.

`compareAngleY` now projects an arrival direction's signed elevation relative
to the physical camera's actual optical-axis elevation `Nick - aimDip`.
Canvas y increases downward, so a negative elevation plots below eye-level,
and a positive one above. The existing eye-level guide is unchanged. Both
markers still share the same camera/FOV and remain overlay-only, without any
additional ray tracing. Nonzero Roll suppression for the orange marker is
unchanged.

`tests/ModernAngularGuide.test.js` checks both signs and several camera
Nick values against the independently implemented perspective camera/painter
projection, including an off-axis Pan. The scientific scope and limitations
of the forward-traced first-contact diagnostic remain unchanged.

## Patch 134 — versioned Modern experiment state and URL persistence

A Modern experiment is a validated, allowlisted **version 1** object managed by
`src/ui/modern/ModernExperimentState.js`. It includes shared observer/camera,
surface and object-group geometry, scene atmosphere, scene preset and its reset
reference, independent Compare surface/atmosphere/engineered radii for A and B,
active model selector, workspace mode and eye-level/horizon display options.
Numbers are finite and bounded before any mutation; unknown fields or versions
are rejected. Runtime optical caches, derived rays, canvas pixels, graphical
result counters and Legacy controls are intentionally excluded.

The Modern URL is `CurvatureApp.html?ui=modern&experiment=<base64url UTF-8 JSON>`.
The canonical router preserves the query while booting the separate Modern
HTML shell. Modern has **not** hijacked the historical `state` query parameter:
Legacy continues to parse its own compact DataX streams in
`src/app/CurvatureStatePersistence.js`. Old `?state=` links remain usable in
Legacy; automatic Legacy-to-Modern DataX import is **not** implied. Generating
an explicit Modern share link removes `state` to prevent two conflicting
payloads. Other query parameters and the URL fragment are retained.

**Startup priority:** valid explicit `experiment` URL > current browser
`localStorage` key `curvature-modern-experiment-v1` > initial Modern preset.
A malformed explicit experiment shows an error and leaves the default scene;
it does not silently fall back to an unrelated saved local experiment. Legacy
local settings are neither read nor written. Accepted Modern control edits
save to local storage with a 550 ms debounce. On a normal Modern entry, edits
also synchronize the visible URL via `history.replaceState` without creating
navigation history entries. An **incoming explicit share URL is immutable**
during further edits; the Copy experiment URL control produces a new link from
the *current* state, so opening an external experiment cannot silently change
the original link. Reset experiment clears Modern's saved state and navigates
to a clean Modern URL to restore defaults.

All sides reuse one shared Physical model/renderer; restoring a state merely
reassigns validated inputs and calls `model.Update()`. Compare reconstructs
its A/B clones from that shared model and the saved independent settings.
There are no serialized or trusted optical results. The saved preset reference
remains separate from the visible `custom` selection so Reset selected preset
retains its earlier semantics. JSON file import/export and a named local
experiment library remain scoped to patch **134.1**.

Tests cover complete codec round trips (including both object groups and
independent atmospheres), malformed input rejection, canonical URL behavior,
explicit-URL precedence, local restore, automatic URL updates, manual copying,
reset behavior and the continuing Legacy parameter namespace. Browser visual
acceptance remains required, especially for `file://` clipboard permission
and `history.replaceState` restrictions.

## Patch 134.2 — shared Scene/Compare parameter tabs

Both workspaces now show the same five accessible tabs: **Camera, Surface,
Atmosphere, Objects, Display**. One DOM instance and the same state handlers
serve Camera, both physical Object groups, and the metric ground Grid: editing
these from Compare updates the authored Scene model and both A/B physical clones.
Only Surface and Atmosphere substitute Compare-specific panels, which edit the
currently selected A or B descriptor without changing Scene's physics; the
physics-pair preset and Model A/B selector remain visible above the tabs.

Compare forces a common observer-fixed eye-level camera on both physical
clones. Scene-only curvature-dependent Camera aim is **disabled in Compare**
with an explicit explanation; returning to Scene restores its saved selection.
The green eye-level and orange traced-horizon guides live under Compare's
Display tab, alongside the shared grid. Switching a settings tab only updates
visibility/ARIA (including dynamic `aria-controls`) and never re-renders or
re-traces optics. Switching Scene/Compare updates the panels and the physical
viewports but does not duplicate Camera/Object inputs or override A/B physics.

All edits continue through the same `CurveAppClass` Scene state and existing
`ModernCompareState` descriptor API, so the version-1 experiment URL/JSON and
named library need **no migration** and include edits made from either mode.
Legacy and the optical renderer remain unchanged. Regression coverage:
`tests/ModernSharedCompareControls.test.js` (shared edits, independent B,
keyboard navigation, panel switching, no tab-triggered optical work) plus full
existing tests. Browser acceptance remains required for final visual layout.

## Patch 134.3 — atmospheric descriptions and historical profile visibility

Both Modern atmosphere editors now provide a small formula and physical-status
panel for the currently selected profile. `Standard atmosphere` explicitly
uses the implementation's 293 ppm near-surface refractivity and 7350 m scale
height, not a fitted weather profile. `Exponential refractive profile` is an
engineered hypothetical law, with the unchanged internal identifier
`exponential-occlusion`. Atmospheric comparison radius is independent from
surface curvature. The inverse-spherical profile is preserved for backward
compatibility, but it and its historical physics-pair presets are hidden
unless currently restored. All optics and serializable parameter names stay
unchanged. Browser visual verification is still required.
