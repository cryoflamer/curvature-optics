# Interactive rendering migration — Canvas Direct

**Status:** Stages 1–3 complete (user reported normal, very fast and smooth Opera interaction after repair C; no instrumented FPS measurement). Stage 4A pointer/wheel/keyboard accepted by the user in Opera. Stage 4B camera sequences implemented; manual acceptance pending.
**Baseline:** `8e6897f` (Canvas Direct diagnostic cleanup, following Thin outlines).
**Scope:** Modern Scene, Compare, camera interactions, and Animation Studio live preview.
**Not in scope:** Legacy Demos, offline PNG/video export, authoritative physical optics,
experiment URL/project schemas, and unrelated diagnostic tools.

This is the **active, resumable implementation plan**. `PROJECT_STATE.md` has the
short handoff and links here. After *every* implementation compatpatch, update
both files with the completed stage, any changed assumptions, verification,
known limitations, and the next action. Inspect the actual Git history and
source before treating a planned step as implemented. Do not put patch numbers
or version suffixes in repository filenames.

## Goal and observed motivation

Promote the already-working Canvas Direct painter from an optional Animation
Studio experiment to the **default interactive approximation** where its
physical assumptions are supported. During camera movement, prioritize smooth,
low-latency feedback; after interaction, restore the configured authoritative
Scene/Compare result. Keep the distinction clear to users.

The browser investigation isolated a sharp Canvas stroke-rasterization
performance threshold in a moving Soundly scene: RAF callback gaps were about
15–16 ms with 0.25–1.0 backing-store pixel outlines, but roughly 70 ms at
1.125 px. This is a *measured correlation*, not a verified Chromium/Skia root
cause or a guarantee of presented FPS. The user subsequently reported smooth
playback reaching approximately 160 FPS with Auto and Thin outlines enabled;
this was a manual observation, not a recorded cross-browser performance gate.
See `docs/modern-render-performance.md` and the repository's Git history.

The target default is **at most 1 physical Canvas backing-store pixel** for
Canvas Direct outlines. That means capping a computed width, not changing
modeled geometry, authoring widths, full-quality rasterization, or exports.
`Preview FPS = Auto` is already the Animation Studio UI default.

## Source-backed inventory (at baseline)

| User action / view | Current implementation | Planned change |
| --- | --- | --- |
| Animation Studio Play / seek / paused preview | `ModernApp.js` → `ModernAnimationPreview.js` → `CurvatureCanvasDirectPreview.js` for explicit `canvas-direct`; optical quality defaults to `auto`, and `Thin outlines` is unchecked. FPS Auto, completed-preview FPS meter already exist. | Make Canvas Direct the default *new live preview* choice where supported and cap outlines to 1 backing pixel by default. Preserve explicit quality choices, prior saved preferences and offline export. |
| Scene/Compare left drag (Pan/Nick) | `ModernApp.js` → `ModernCameraInteraction.js`. `auto`/`fast` with supported Fast profile updates the model and throttles physical Fast redraw. Otherwise `ModernCameraDragPreview.js` transforms already-painted canvases (perspective/translate CSS) until an authoritative redraw on release. | Replace eligible intermediate drag pictures with Canvas Direct frames; preserve gesture math, pointer capture, Compare shared pose and final accurate redraw. |
| Scene/Compare Shift + left drag (East/North/Height) | Same pointer transaction; translation uses `ModernCameraInteraction.translate()`, with shared A/B observer pose. Same Fast-or-CSS preview split. | Use the same direct-preview mechanism as rotation, including limits and interrupted gesture behavior. |
| Scene/Compare Shift + wheel (FOV) / Alt + wheel (dolly) | `bindFocalWheel()` → `scheduleCameraWheelRedraw()`; Auto uses throttled Fast preview then settles to exact redraw, other qualities use ordinary redraw. Unmodified wheel is page scroll. | Reuse shared Canvas Direct interaction where eligible; preserve wheel modifiers, idle settle and keyboard focus behavior. |
| Scene/Compare keyboard W/A/S/D, Q/E, arrows | `navigationTick()` mutates camera via `ModernCameraNavigation.js`, requests throttled Fast preview when supported; `stopCameraKeyboard()` redraws on release. | Reuse the same direct-preview scheduler and settle path without changing camera speeds or bounds. |
| Scene/Compare camera sequence | `startCameraSequence()` / `cameraTransitionTick()` use Fast optical preview for motion and restore normal rendering afterward. | Evaluate direct-preview reuse once pointer/wheel/keyboard semantics are stable; do not change sequence timing or persistence. |
| Scene/Compare numeric parameter and atmosphere slider edits | Some sliders display lightweight input feedback during drag, then commit and recompute optics on release; these are not camera gestures. | **Do not** route indiscriminately through Canvas Direct: physical parameter changes need separate scope/eligibility review. |
| Legacy Demos and exports | Separate Legacy iframe/storyboard; deterministic Animation PNG/video path uses Accurate rendering. | Preserve without modification. |

**Current source boundaries:**

- UI / pointer and scheduling: `src/ui/modern/ModernApp.js`,
  `ModernCameraInteraction.js`, `ModernCameraDragPreview.js`,
  `ModernCameraNavigation.js`.
- Studio playback and preview routing: `src/animation/ModernAnimationPlayback.js`,
  `ModernAnimationPlaybackControls.js`, `ModernAnimationPreview.js`.
- Direct painter / geometry: `src/renderers/CurvatureCanvasDirectPreview.js`,
  `src/renderers/CurvatureCanvasProjection.js`,
  `src/optics/OpticalEffectiveRadiusPreview.js`.
- Physical render and presentation: `src/app/CurvatureMainCanvasRenderer.js`,
  `src/ui/modern/ModernApp.js`, plus existing Scene/Compare optical adapters.
- HTML controls: `CurvatureModern.html` (`ModernAnimationPlaybackOptics`,
  `ModernAnimationPlaybackFps`, `ModernAnimationPlaybackActualFps`,
  `ModernCanvasDirectThinOutlines`).

Names above are an **inventory**, not an authorization to move or delete files.
All cited source paths were present at the stated baseline. The original
camera interaction contract is in `docs/modern-camera-interaction-baseline.md`;
see also `docs/modern-camera-navigation.md` and `docs/modern-animation-contract.md`.

## Physical and product invariants

1. **Approximation is not authoritative optics.** Canvas Direct projects
   optics-neutral geometry using straight rays on an effective sphere/plane
   and approximate horizon masking; it does not trace refracted light paths.
   It must never silently present an approximate result as RK4-accurate.
2. **Eligibility first, for the intended renderer.**
   `OpticalEffectiveRadiusPreview.parameters()` is the deliberately restricted
   standalone Effective Radius mode: Vacuum, Standard and Temperature lapse.
   The **Canvas Direct-only** `canvasDirectParameters()` accepts all seven
   already-authored Modern profiles and obtains the observer-height `n(h)`,
   `dn(h)` from the *same existing* `OpticalRayTracer.atmosphere()` profiles.
   The local approximation is `C_eff = C_surface + (dn/dh)/n` (for Flat,
   `C_surface = 0`); its dimensionless `k` on Flat is diagnostic only. Both
   positive and negative virtual Flat curvature are permitted, but **neither**
   certifies a Flat ground horizon. Unsupported/invalid or unrepresentable
   local geometry must fail closed; never invent Standard/Vacuum as a substitute
   or imply physically accurate mirage/visibility reconstruction.

3. **No data-model changes.** Browser-local interactive-preview preferences
   must not mutate authored scenes, the Animation project/History schema,
   experiment URLs, or PNG/video export parameters. Existing saved quality
   selections should remain respected; distinguish a *new default* from
   overriding existing saved choices.
4. **Restore correct rendering.** On release, cancel, focus loss, mode switch,
   failed preview or unsupported atmosphere, remove stale approximation and
   restore the expected authoritative/selected quality. Do not leave stale
   A/B frames or accidental mixed physics.
5. **One gesture, one latest pose.** Coalesce pointer/wheel/keyboard input to
   at most the latest pending RAF frame; avoid rendering stale frames, duplicate
   listeners, timer accumulation, or saving a project for each intermediate
   pose. Preserve camera bounds and cursor / pointer-capture semantics.
6. **Protect Legacy and exact paths.** Preserve separate Legacy Demos,
   Scene/Compare independent atmosphere and surface settings, accurate RK4,
   physical regression tests, and deterministic export.
7. **Performance is a testable outcome.** Preserve actual FPS telemetry and
   compare real moving scenes at matched viewport size/browser/device, not just
   synchronous JS callback timing. The ~160 FPS observation is a baseline
   anecdote, not a universal acceptance threshold.

## Compatpatch roadmap

Each stage should be **one Git commit → one `git format-patch` in a ZIP**,
validated with `git am --3way` on a clean copy of the *actual* input pack.
If a stage proves too large, split it into a clearly named substage and update
this roadmap **before** proceeding. Never assume a previous ZIP is part of a
new pack until its Git history or a clean application confirms that fact.

| Stage | Status | Deliverable and acceptance gate |
| --- | --- | --- |
| **1. Plan & inventory** | **Completed in this documentation compatpatch** | This document, `PROJECT_STATE.md` handoff, source-backed interaction inventory; no runtime changes. Verify Markdown links, documented source references, diff and patch application. |
| **2. Studio defaults** | **Completed** | For *new* Animation Studio live previews, prefer `canvas-direct` and checked Thin outlines (≤1 backing px); keep Auto FPS, actual FPS, opt-out and previously saved explicit choices. Handle unsupported Canvas Direct atmospheres with an honest fallback/status. Regression: new/existing drafts, Prepare/Play/Pause/Seek/Stop, Compare, export unchanged. |
| **3. Direct camera drag** | **Completed** | Add Canvas Direct previews to Scene and Compare drag (rotate + Shift-translate), preserving all camera/gesture math and pointer cancellation. Bound per-frame work, cache geometry when possible; after release render authoritative optics. Verify A/B independent physical settings and a safe, explicit fallback. Split Scene/Compare into 3a/3b if needed. |
| **4A. Shared pointer/wheel/keyboard pipeline** | **Completed; user confirmed in Opera** | Reuse one direct scheduler and owner, retain fallbacks and input math, verify idle/release/interruption. |
| **4B. Camera sequences** | Implemented; Opera acceptance pending | Reuse shared preview while preserving absolute sequence timing, Stop/Cancel and persistence. |
| **5. Effective-curvature qualification** | Planned | Centralize support checks/fallback and validate observer-height gradient, radius, surface and atmospheric changes. Sample representative supported and unsupported profile cases against Accurate for quality warnings; **do not promise pixel/physical equivalence** or globally replace ray tracing. |
| **6. Cleanup & regression closure** | Planned | Retire superseded interaction code after real usage tests; update docs/tests. Run the full feasible Node suite and Legacy/Modern isolation audit, plus manual Opera/Chromium motion, image and FPS checks. Document any unverified gates rather than claiming success. |

## Stage 2 implementation notes (2026-11-18)

- New Animation Studio previews and new/wizard drafts now select Canvas Direct;
  the HTML checkbox starts with `Thin outlines` checked, capping Canvas Direct
  strokes to one backing-store pixel, and `Preview FPS` remains Auto. The
  checkbox is an **in-session display option**: toggling it does not alter
  a project, library record, or exported media. Its unchecked state is not
  saved across reload; a fresh page starts with thin outlines enabled.
- Existing autosaved workspaces and named Library records retain their explicit
  optics quality, including `auto`, `fast` and `accurate`. Checkpoint quality
  validation was extended to `canvas-direct` and `effective-radius`, matching
  the already-supported Library quality choices. This does not change the
  animation project format or the offline Accurate export pipeline.
- At Stage 2, Canvas Direct checked the restricted effective-radius parameter
  calculation. The later signed-Flat and all-existing-profile follow-ups replace
  this with a Canvas Direct-specific local-gradient check. Invalid/unrepresentable
  geometry still falls back to Accurate RK4 **without changing the user's selection**;
  the actual renderer and fallback reason are displayed. Compare re-renders
  the other side in Accurate rather than presenting mixed-quality A/B frames.
  Errors unrelated to recognized unsupported parameters remain visible.
- Targeted Node regression: 110/110 passed for default wiring, checkpoints,
  unsupported profiles, Compare fallback, pacing, and Canvas Direct outlines.
  A wider run of 595 Animation, Camera, Compare, Canvas and export regressions
  plus 17 documentation/isolation checks also passed. An attempted full suite
  exceeded the execution budget and is **not** claimed as fully green.
  Browser/Opera visual testing and real FPS measurements after this change
  are still required; do not infer 160 FPS in all scenes.
- **Completed next:** Stage 3 implements supported direct pointer previews
  without moving wheel/keyboard/sequence rendering. See Stage 3 notes.
- **Next:** Stage 4 — evaluate shared scheduling and settle behavior for wheel,
  keyboard and camera sequences before retiring any older preview pipeline.

## Stage 3 implementation notes (2026-11-18)

- On a *supported* Scene or Compare pointer drag, Canvas Direct now paints the
  latest provisional camera pose directly to the existing physical viewports.
  `ModernCameraCanvasDirectDrag.js` coalesces pointer samples to **one pending
  RAF**; it owns no scene data. `ModernApp.js` supplies independent per-viewport
  surface/atmosphere options and uses `CurvatureMainCanvasRenderer.renderPhysical`
  with `opticalQuality: 'canvas-direct'`, `thinOutlines: true` (≤1 backing px),
  and no heavy exact overlays. Scene Pan/Nick and Shift-translate share the
  existing camera interaction calculations and safety bounds.
- Both Compare sides must qualify under the Canvas Direct-specific
  parameters **before either direct frame is drawn**. Default Globe Standard /
  Flat Standard did *not* qualify **at the time of Stage 3**: the existing Fast/CSS
  gesture preview was retained with a UI warning. The signed-curvature
  follow-up below now enables the ordinary Globe Standard / Flat Standard pair.
  A compatible Globe Standard / Globe Vacuum pair draws both viewports at one shared provisional camera pose
  without replacing their independent physics. Height-dependent curvature is
  rechecked inside each direct paint; an unexpected rendering failure aborts
  the gesture and requests an authoritative redraw, rather than leaving
  mixed-quality frames indefinitely.
- Provisional camera poses are **never written into the live model**, History,
  experiment URLs or saved preferences. Release commits the final pose once
  and redraws using the user's selected optical quality (Accurate at rest when
  Auto is selected). Cancel/lost capture restores an authoritative frame after
  a painted preview. Unchanged-return gestures also restore exact pixels;
  queued preview RAFs are cancelled on stop/interrupt. Existing pointer
  capture, hand cursor, HUD and atmospheric-presentation suspension are kept.
- Wheel, keyboard and camera sequence still use their existing Fast/accurate
  motion mechanisms. Their consolidation is **Stage 4**, not part of this patch.
- Stage 3 validation includes Scene/Compare camera transaction and fallback
  tests, direct scheduler coalescing/error/cancel tests, and the Legacy/Modern
  boundary audit. A Node harness does not establish real Opera/Chromium FPS;
  the pointer/Animation/Compare/isolation regression passed 635/635 and
  an independent physical/optical/Legacy group passed 689/689. Local headless
  Chromium navigation was blocked by the test environment policy; this is
  **not** browser verification. Test Scene and Compare manually in Opera with
  supported and unsupported atmospheres, HiDPI, Shimmer and cancellation
  before declaring visual/performance parity.

## Stage 3 corrective repair A — Flat orientation parity (2026-11-18)

- **Observed in Opera:** in Compare, Flat Standard became horizontally mirrored
  while the mouse was held; mouseup restored normal optics. Captions and
  auxiliary markings also disappeared or differed during the same gesture.
  These are separate problems: this repair addresses **object orientation**,
  not presentation decorations (repair B below).
- **Verified cause:** `CurvatureCanvasDirectPreview.objects()` built Flat
  geometry with the **Legacy Flat authoring convention**, whose local lateral
  object axis is reversed. The authoritative Scene/Compare physics uses
  `composeOpticalMain(...,{physicalWorld:true})`, which builds Flat geometry
  with `physicalSurface:true, curvature:0` and a continuous physical
  east/north basis. The two paths therefore drew objects with opposite
  horizontal handedness, independently of signed refraction or Pan/Nick.
- **Repair:** Canvas Direct now requests the exact **physical-world Flat
  object placement** (including local silhouettes and connected object meshes)
  but keeps the existing signed `flatRefractionPoint()` for the approximate
  atmospheric bending. Globe's existing effective-radius geometry path is
  untouched. No change to Accurate RK4, authoring, History, exports, or
  non-gesture quality selection.
- **Tests:** `tests/ModernCanvasDirectOrientationParity.test.js` uses
  independently authored physical Flat polygons and physical camera
  projection as its pixel reference. It compares actual Canvas Direct stroke
  endpoints across nine combinations of atmosphere (Vacuum, Standard, Inverse
  temperature) and Pan/Nick/Roll/translation. The original mirrored placement
  **failed** the test; the corrected placement passes. Three regression shards
  passed **1248/1248 tests**. Browser rendering and FPS still require user
  verification. The isolation audit's source/HTML
  boundaries are unchanged; only newly added test dependencies were recorded.
- **Completed in source — repair B:** the painter now uses the same metric
  distances and the same Auto/manual drawing extent as the physical metric
  surface. Rings and 24 radial spokes use the Canvas Direct local-curvature
  projection, with seven camera-aligned supplementary spokes and metric labels.
  The paths are batched into at most two strokes and remain display-only;
  globe linework is clipped to the *approximate* local virtual ground horizon,
  while Flat gains no invented physical horizon. Extremely strong Flat
  gradients clip only the drawing range to the finite approximation domain.
  Source grid topology and curved ray paths remain *approximate*, not RK4
  pixel parity or independent optical visibility.
- Drag now passes the actual caption-mode preference, geometry summary and
  frame through existing `CurvatureFullSceneDecorations`; a preference of
  `off` still hides captions. The configured eye-level line is repainted after
  each direct frame. A previously resolved optical horizon is drawn at the
  moving pose *only* if the cached RK4 diagnosis matches the same physics;
  otherwise the overlay is omitted until the final accurate redraw. No RK4
  diagnoses occur inside the pointer RAF. The existing Roll convention is
  respected for the traced-horizon line (omitted when rolled), pending a
  proper curved/sloped optical isoline in a separate guide-specific change.
  The live state/History/export paths and selected final optics are untouched.
- **Verification (automated):** all 303 test files ran in three Node shards,
  **1735/1735 assertions passed** (558 + 563 + 614). The Legacy/Modern
  isolation audit `--check` and the independent Modern boundary audit
  `--check` passed; the frozen isolation fixture was updated only with the
  explicitly added physical-world grid import and direct-preview test caller.
  Targeted Canvas Direct / pointer / orientation tests passed after the final
  drawing-domain guard. These are code regressions, not Opera raster or FPS
  certification.
- **Corrective repair C — atmospheric visibility and physical grid palette
  (2026-11-18):** Opera testing after B exposed two intermediate-frame differences:
  Visibility & haze was ignored during drag, and Flat metric rings/spokes
  turned black until the accurate settle repaint. The Canvas Direct painter
  now reuses `CurvatureAtmosphericVisibility.validate()` / `blend()` for
  object fills and strokes, including strokes whose black fallback color was
  implicit. Its approximate observer-relative distance is derived from each
  cached object package's authored vertex centre; only the current observer
  translation and visibility range are evaluated each frame. Per-object
  palette memoization avoids repeated extinction math for dense meshes. The
  extinction presentation never changes geometry, horizon masks, guide colors
  or project data. The metric grid now uses the same `GlobeGridCol ||
  FEGridCol || 'blue'` palette as the Physical metric guide composer on
  **both** Globe and Flat; the black `FEGridCol` continues to belong to
  Legacy Flat. Scene/Compare drag continues passing the selected visibility
  settings (shared by Compare), while authored atmosphere/refraction profiles
  remain independent A/B. No extra optical/RK4 computations are introduced.
  Haze distances are a representative approximation, not exact optical-path
  integration; Canvas Direct retains its existing painter-order/occlusion
  limitations. Browser look/FPS after C is not yet certified.
  **Verification:** the full 304-file Node regression suite passed in six
  shards (1739/1739 tests), the architecture/refactor closure passed
  (136/136 focused tests) and the Legacy/Modern source boundary audit
  `--check` passed with its updated dependency inventory. No Opera frame or
  actual FPS test was performed for this repair.
- **Verification gate remains open:** re-check Opera drag for Visibility & haze
  ON/OFF and 1–500 km range, Globe/Flat metric blue color, caption settings,
  Pan/Nick/Shift and distinct A/B atmospheres. Check actual FPS in a dense
  Soundly or Pontchartrain scene before Stage 4.


## Signed Flat refraction follow-up (2026-11-18; completed before Stage 4)

- **Physical reasoning:** the local effective curvature of the surface relative
  to a nearly horizontal refracted ray is `C_eff = C_surface + (dn/dh)/n`.
  Consequently a physical **Flat** surface (`C_surface = 0`) under the normal
  *negative* refractive-index gradient becomes a **negative-curvature virtual
  surface**, while the authored physical surface stays exactly Flat. This
  follows the relative-curvature effective-Earth construction; the standard
  positive-radius globe and negative virtual-curvature flat use the same
  observer-height atmospheric sampler. References: [American Meteorological
  Society, effective Earth radius](https://glossary.ametsoc.org/wiki/effective-earth-radius/),
  [NBS Radio Meteorology](https://www.govinfo.gov/content/pkg/GOVPUB-C13-275c5c72c4680347c482b03045a8698b/pdf/GOVPUB-C13-275c5c72c4680347c482b03045a8698b.pdf).
- **Implementation:** `OpticalEffectiveRadiusPreview.parameters()` now reports
  signed `effectiveCurvature` and signed `effectiveRadius` (negative for
  ordinary refracted Flat). On Flat, the dimensionless `k` uses a fixed nominal
  radius **only for diagnostic reporting**; physical Flat curvature is
  independent of the model's unused Globe radius. The analytic Effective
  Radius ray predictor also handles the signed Flat chord angle. Canvas Direct
  bends the already-authored Flat object coordinates and approximate guide
  rings relative to the moving observer using a signed virtual-surface
  embedding. Neither `CurvatureSurfaceGeometry` nor `CurvatureCameraTranslation`
  gains negative *physical* curvature; the RK4 and export paths are unchanged.
- **Acceptance:** default Globe Standard / Flat Standard Compare may now draw
  **both** direct preview frames; cases unrepresentable by the preview must
  still reject *before* drawing either, and release restores the selected accurate/fast result. Flat
  Vacuum is still exactly flat and is preserved without a negative radius.
- **Limitations:** this is a **local, single-gradient, nearly horizontal ray
  approximation**, not a certified mirage or visibility solver. At the time of
  this signed-Flat patch, only non-positive effective curvature was qualified;
  the all-existing-profile follow-up below also permits positive virtual Flat
  curvature. Extremely long
  baselines beyond the local signed embedding's half-turn or anomalous
  gradients still fall back to Accurate. There is **no virtual Flat ground
  horizon mask** for ordinary downward bending; painter/depth-order errors
  are possible. Compare positions, appearance and FPS in Opera separately.
  Tests compare Flat Standard and temperature-lapse launch angles against
  production RK4 over 1–40 km; for a ground target viewed from 15 m the
  difference is under `3e-7` radians (0.3 µrad). An expanded sample of
  observer heights 5/15/100 m and target heights 0/10/100 m at 1/10/40 km
  remains under `5e-6` radians (5 µrad). Both thresholds are sample-specific,
  **not** universal optical error guarantees.
- **Next:** Stage 4 shared wheel, keyboard and camera-sequence pipeline; do not
  treat this follow-up as a completed Stage 4.

## All existing atmosphere profiles — interactive Canvas Direct follow-up (2026-11-18)

- **Scope:** only the existing seven Modern profile identifiers: `vacuum`,
  `standard`, `temperature-lapse`, `profile-transition`,
  `inverse-temperature`, `inverse-spherical`, `exponential-occlusion`.
  No new profile, physics, RK4 ray path, authoring schema, export format,
  or universal optical accuracy claim. During pointer drag and Animation Studio
  live preview, a single **local effective curvature** is enough for the fast
  approximation; after interaction, the existing configured quality is restored.
- **Implementation:** `canvasDirectParameters()` uses the production
  `OpticalRayTracer.atmosphere()` for the selected profile at `model.Height`,
  forwarding the *actual* scene/Compare temperature, transition, inverse and
  comparison-radius parameters. `C_eff = C_surface + n'(H)/n(H)` is converted to
  the signed virtual geometry. Positive `C_eff` on physical Flat is legitimate
  for upward-refracting engineered profiles and is rendered without inventing
  a physical ground-horizon mask. Shared eligibility is used by Scene/Compare
  pointer previews and the Animation Studio Canvas Direct renderer, including
  independent Compare A/B settings. The standalone `effective-radius` quality
  stays limited to its original three qualified profiles.
- **Validation:** Globe and Flat were rendered for **all seven** profiles,
  with finite Canvas paths, ≤1 backing-pixel stroke widths and immutable scene
  data; the actual `n'(H)/n(H)` was checked against the tracer. The Flat inverse
  Compare preset, Animation Studio routing and invalid-local-geometry fallback
  are covered. Three Node regression shards passed **1245/1245 tests**, including
  export and Legacy checks. The Legacy/Modern isolation snapshot changed by
  one reviewed test dependency (`ModernCanvasDirectPreview.test.js` importing
  `OpticalRayTracer.js`), and the audit `--check` passed. The deterministic
  export and RK4 implementation were not modified.
- **Limitations:** a single observer-height gradient does **not** reproduce
  real inversion images, multipath, changing gradients along the ray,
  visibility or mutual occlusion. Positive virtual Flat curvature does not
  add a certified horizon, and the Globe painter's whole-object mask is also
  approximate. Extremely strong gradients or an unrepresentable signed
  embedding can still reject or revert to Accurate. Check optical appearance
  and FPS manually in Opera; Node tests alone cannot validate smoothness.
- **Next:** Stage 4, the shared interaction pipeline for wheel, keyboard and
  camera sequences. The expanded atmosphere eligibility is a separate Stage 3
  follow-up, **not** a claim that Stage 4 has been implemented.

## Required stage-by-stage verification

- **Code-level:** targeted Node tests for selector defaults, fallback,
  Canvas width cap, input transactions, RAF cancellation, A/B agreement,
  data persistence boundaries and exact exporter isolation, as relevant.
- **Repository:** no numbered filenames, clean `git diff --check`, one commit,
  one nonempty format-patch, ZIP integrity and clean-base `git am --3way` with
  resulting Git tree matching the developed commit.
- **Browser/manual (when runtime behavior changes):** test Opera/Chromium
  Scene and Compare: Pan/Nick, Shift translation, wheel, keys, camera sequence,
  motion interruption, pause/settle, high-DPI, an unsupported atmosphere,
  Flat vs Globe, independent A/B settings, and Animation Studio Auto FPS.
- **Visual/physics:** do not treat visually smooth approximate frames as
  validation of ray visibility, horizon, inverted atmospheric profiles or
  accurate PNG/video frames. Confirm a final physical frame after movement.

## Handoff protocol for a future chat

1. Open `PROJECT_STATE.md`, then **this file**, then read the latest Git log
   and source at the stated stage. The files may lag behind the branch; Git
   and actual code decide what is implemented.
2. Use the **latest full `chatgpt-pack-*` archive supplied by the user** as
   source of truth, or apply the intervening verified format-patches in order
   when continuing without a new pack. Never mix unrelated snapshots.
3. Check this status table and the `PROJECT_STATE.md` entry; do **only the
   next unfinished stage**, not the entire migration in one patch.
4. Before delivering, update both files with exact completed scope,
   verification results and the next step. A commit cannot reliably embed
   its own SHA; use `git log -1` to identify the documentation commit and
   record only the **prior base SHA** within that commit if needed.
5. Deliver one ZIP containing one format-patch and a concise Ukrainian
   summary of changes, checks, and any missing browser verification.


## Stage 4A — shared pointer, wheel and keyboard preview

- **Input baseline:** `4e50fee` (repair C). User reported normal, very fast,
  smooth Opera interaction after C; this is manual Stage 3 acceptance, not
  an instrumented FPS result.
- The existing direct RAF scheduler now has a shared application owner
  (pointer, wheel or keyboard), latest-pose coalescing, and generation checks
  to discard callbacks left over from cancelled interactions. Compare keeps
  per-side optical settings and checks both detached frames before painting.
- Shift-wheel FOV and Alt-wheel dolly use the same direct painter, with
  the existing 220 ms Auto wheel settle interval for direct motion. Ordinary
  wheel scrolling and modifiers are unchanged. The direct FOV is derived
  from the current focal length with the physical model's angle bounds.
- Keyboard retains elapsed-time movement and bounds; direct paint is
  coalesced separately from navigation ticks. Keyup/blur settles to the
  configured quality. Input takeover clears old work, and a click-only
  pointer takeover still restores the previous committed wheel pose.
- The existing fallback modes remain available. Direct frame failures
  restore both physical viewports even if the first frame partially painted.
  The approximate rendering label remains explicit; direct motion does not
  request RK4 or per-frame History capture. Pointer transaction semantics,
  shared Compare pose, authorship/exports and legacy isolation are preserved.
- Stage 4 is split deliberately: camera sequences retain existing timing,
  Fast routing and Stop/Cancel semantics until 4B. No removal of fallbacks.
- **Manual next:** compare Scene/Compare wheel and keyboard against resting
  Accurate and explicit Fast, with Globe/Flat and different atmospheres;
  test switching input, blur, mode changes, FOV, dolly and height. Measure
  FPS if desired. Only after 4A acceptance proceed to 4B.
- **Automated validation:** initial broad six-shard Node run: 1745/1746
  passed; the one History integration assertion (gallery filter count) passed
  in an isolated rerun of the entire History file (12/12). After the final
  input-handoff and partial-Compare-failure fixes, targeted tests passed
  105/105 and a wider camera, direct/fast preview, History and architecture
  suite passed 251/251. The final tree was not rerun through all 304 test
  files; no completely green full-suite claim. Both Legacy/Modern static
  audits passed (only new test dependencies added to the isolation fixture).


## Stage 4B — shared Camera Sequence preview

- Input baseline: accepted Stage 4A (`624b8ae`). User reported that wheel and
  keyboard work in Opera; no instrumented frame rate was supplied.
- Camera Animation in Scene and Compare uses the existing Canvas Direct
  scheduler under a sequence owner. Preflight uses the first keyframe pose;
  unsupported/missing direct capability retains the existing Fast path if
  supported. If neither qualifies, Play is rejected before changing the pose.
- Absolute elapsed-time sampling, travel/easing/holds, immutable keyframes,
  UI controls and experiment schema remain unchanged. Identical held poses
  skip direct paint; current FOV, height, position and angles are evaluated
  on detached per-side frames, with the Stage 3 grid, haze and decorations.
- Stop keeps the last sampled pose; Cancel restores the pre-Play pose;
  completion renders the exact last keyframe using the selected settled
  quality (Auto settles to Accurate). Runtime direct errors stop playback
  and restore physical rendering, including both Compare sides.
- Manual takeover without movement still settles the interrupted sequence.
  Mode switches, blur, edits and debounced curvature changes cancel playback;
  targeted Compare edits during playback restore both viewports. Cancelled
  sequence callbacks are bound to their original playback identity.
- Automated validation: 68/68 navigation tests (8 new sequence regressions);
  669/669 wider camera, animation, Canvas Direct, Fast, History and boundary
  tests; both static isolation audits passed. Full 304-file regression and
  actual Opera image/FPS verification remain unperformed for 4B.
- **Manual next:** Camera → Camera Animation in Scene and Globe/Flat Compare,
  add views with different height/FOV/angles, play with arrival pauses, test
  Stop/Cancel and keyboard/wheel/mouse takeover. Check selected settled
  quality returns; Stage 5 begins after browser acceptance.
