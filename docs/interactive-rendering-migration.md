# Interactive rendering migration — Canvas Direct

**Status:** Stage 1 — inventory and plan recorded; Stage 2 is next.
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
2. **Eligibility first.** The current `OpticalEffectiveRadiusPreview.parameters()`
   accepts Globe with Vacuum, Standard or Temperature lapse; Flat with Vacuum
   only. It derives a **local observer-height gradient** with
   `k = -R (dn/dh) / n` and `R_eff = R / (1-k)` for Globe, rejecting unsupported
   gradients/curvature. Other atmospheric models (and invalid inputs) must
   take an explicit safe fallback; no invented k, vacuum substitution or
   automatic certification for complex/mirage profiles.
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
| **2. Studio defaults** | **Next** | For *new* Animation Studio live previews, prefer `canvas-direct` and checked Thin outlines (≤1 backing px); keep Auto FPS, actual FPS, opt-out and previously saved explicit choices. Handle unsupported Canvas Direct atmospheres with an honest fallback/status. Regression: new/existing drafts, Prepare/Play/Pause/Seek/Stop, Compare, export unchanged. |
| **3. Direct camera drag** | Planned | Add Canvas Direct previews to Scene and Compare drag (rotate + Shift-translate), preserving all camera/gesture math and pointer cancellation. Bound per-frame work, cache geometry when possible; after release render authoritative optics. Verify A/B independent physical settings and a safe, explicit fallback. Split Scene/Compare into 3a/3b if needed. |
| **4. Shared interaction pipeline** | Planned | Consolidate the preview adapter/scheduler across eligible pointer, wheel, keyboard and camera sequence movement. Keep existing movement timings, throttling, settle behavior, no stale RAF, and one ownership boundary; remove only proven-redundant CSS/Fast preview wiring after replacement passes tests. |
| **5. Effective-curvature qualification** | Planned | Centralize support checks/fallback and validate observer-height gradient, radius, surface and atmospheric changes. Sample representative supported and unsupported profile cases against Accurate for quality warnings; **do not promise pixel/physical equivalence** or globally replace ray tracing. |
| **6. Cleanup & regression closure** | Planned | Retire superseded interaction code after real usage tests; update docs/tests. Run the full feasible Node suite and Legacy/Modern isolation audit, plus manual Opera/Chromium motion, image and FPS checks. Document any unverified gates rather than claiming success. |

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
