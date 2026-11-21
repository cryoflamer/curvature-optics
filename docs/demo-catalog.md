# Built-in demo catalog — current design and behavior

This document describes the **shipped Modern Animation Studio catalog**, not
a work plan. Pending visual/browser acceptance, photo-backed content and
optional native Legacy parity are tracked separately by
[#33](https://github.com/cryoflamer/curvature-optics/issues/33),
[#37](https://github.com/cryoflamer/curvature-optics/issues/37) and
[#38](https://github.com/cryoflamer/curvature-optics/issues/38).
The superseded stage-by-stage implementation plan is in
[Git history](https://github.com/cryoflamer/curvature-optics/blob/aa8b2b1a94fa72432648f2ffcec8929a90601b04/docs/modern-demo-catalog.md).

## Catalog and copy lifecycle

The built-in catalog reuses the Animation Project v1/v2 and contract
validators. Original packaged projects are immutable and read-only. Opening
a built-in does not create an editable named project or overwrite the
working draft; **Create copy** makes an independent owned project and
preserves portable attachments, authoring metadata and thumbnails. My
Projects, built-ins and working drafts have distinct lifecycles.

Sample Soundly content uses a compatible Globe/Flat shared-camera
presentation; it is **not a completed photographic scientific calibration**.
The independent Demos tab continues to play all original fast Legacy
storyboards in its isolated runtime.

## Preview, presentation and transport

- Camera/Physical projects follow the existing locked contract and
  reconstructed keyframe values. Compare playback uses a single time sample
  with independent A/B physics. Selecting a prepared keyframe pauses/jumps to
  its exact arrival, followed by a successful paused-frame paint.
- Storyboard thumbnails are keyed by exact visual/project state and stored
  outside the canonical physics project. Batch capture and bounded cache
  never become an authoritative optical export or mutate the playhead.
- Presentation reuses the actual player, with title/chapters, frame
  descriptions, optional camera HUD, original linked reference photographs,
  viewer-only layout, and selected atmosphere variant where eligible.
- Photos remain original owned observation assets, not simulated frames.
  Their display at holds, crop/contain and provenance are separate from
  numerical camera fitting. Safe deletion is pending cross-workspace usage
  inventory (#26).
- Standalone animation v1/v2 and linked-observation v2 portable bundles
  preserve original photo bytes, metadata and collision-safe remapping.
  Atmosphere switching can select a runtime variant without rewriting the
  authored project.
- Full Presentation PNG/streamed ZIP and video are deterministic output
  paths separate from live preview and must preserve resolved physical
  geometry, authored FOV, clipping, reference bytes and exact timestamps.
  #1 covers adaptive physical/photo layout; #2 and #5 cover deferred
  optimization, not basic implemented export.

## Authoring and scientific acceptance

Real photo-backed Causeway publication is a later evidence-driven task,
not implied by a built-in catalog entry or visually convincing rendered
comparison. Original bridge photo attribution, rights and capture conditions
must be verified; calibrate fixed geometry and atmosphere and report
uncertainty/held-out checks. See [calibration](camera-calibration.md),
[images](reference-images.md), [animation contracts](modern-animation-contract.md)
and [native/Legacy boundary](native-scenario-compatibility.md).

Browser acceptance gates are recorded in the respective Issues; current
documentation must not claim that automated tests equal user-reviewed Opera
results.
