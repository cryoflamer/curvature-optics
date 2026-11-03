# 137.2 — Cheap shared camera-drag preview

## Interaction and rendering contract

- Primary pointer dragging in Scene, Compare A, or Compare B continues to use
  the single `ModernCameraInteraction` camera transaction introduced in 137.
  It changes **Pan and Nick together**, with the same FOV-calibrated mapping
  and preserves Roll and the existing Scene/Compare aim rules from 137.1.
- Hovering a draggable Canvas shows **grab**; during a captured gesture the
  cursor becomes **grabbing** (also when the pointer crosses its bounds).
  Pointer cancellation, visibility loss, window blur and mode switching reset
  the cursor and restore the original frame without changing the camera.
- A live preview now follows the pointer **without calling the physical renderer**.
  Instead of a costly `getImageData` or a new full-canvas snapshot, 137.2 uses
  the Canvas's *already-rasterized backing store* as the cached image and
  moves it via CSS `translate3d` on the compositor. Pointermove only updates
  displacement and queues at most one preview update per animation frame;
  it does not update `CurveAppClass`, reconstruct the scene, integrate rays,
  or start a new physical frame.
- Compare moves **both** Canvas elements from either A or B. Displacements
  are scaled by the relative CSS dimensions (`dx * otherWidth / sourceWidth`,
  likewise for `dy`). The two frames therefore receive the same fractional
  screen displacement and a shared camera angle rather than two independent
  camera states.
- On pointerup beyond the established 2-CSS-pixel threshold, the preview
  retains its final position while the normal, precise redraw is queued.
  Once that redraw finishes (one Scene view or both Compare views), the CSS
  transform is removed, leaving the authoritative new rendered image.
  Pointerdowns during this short pending-final-frame interval are ignored so
  that a second gesture cannot cancel the only pending precise redraw.
  Clicking without a drag or cancelling restores the previous image immediately.

## Fidelity and limitations

- This preview is **only an approximate image translation**, not a physical
  projection of a new camera. Larger rotations, nonzero Roll and perspective
  distortion can differ from the final image. Newly exposed screen strips
  show the viewport background; no artificial terrain or horizon is generated.
- Only raster pixels on the Canvas are transformed. Any independently positioned
  HTML labels rendered outside the Canvas are not remapped by this preview.
  Final output is always drawn by the unchanged original physical renderer.
- No changes were made to atmosphere, optical caches, horizon diagnostics,
  experiment persistence or serialized state. No WebGL or new dependencies.
  A later optional GPU homography can replace this preview strategy while
  preserving the same camera gesture and commit contract.

## Implementation

- `src/ui/modern/ModernCameraDragPreview.js`: shared, testable CSS transform
  controller; no Scene/Compare physics dependencies. Coalesces moves in RAF,
  supports hold-on-commit and full restoration on cancellation.
- `ModernApp.js`: the existing three Canvas pointer entrypoints are wired
  to the same controller; the normal final-render callbacks release the preview
  in a `finally` block. Compare renderer order and cache ownership are unchanged.
- `ModernApp.css`: explicit, visible grab/grabbing cursors and a neutral
  viewport background for exposed edges.

## Validation

Run `node --test tests/*.test.js`. New tests verify RAF coalescing,
normalized A/B motion, both drag directions, cursor state, cancellation,
mode changes, deferred physical paints and the second-pointerdown race.

Browser smoke checklist:

1. Open Scene: hover (grab); drag diagonally (grabbing and moving image);
   release (exact camera and numeric fields update, no jump back to origin).
2. Repeat in Compare, dragging **A** and then **B**, confirming that both
   physical images move in tandem and finish with the same Pan/Nick.
3. Cancel via a `pointercancel` event, switching mode, or window losing focus;
   image and cursor must return to their initial state without a camera commit.
4. Inspect long drags: blank newly exposed strips are expected. Compare the
   final traced horizon with a direct numeric Pan/Nick redraw; they must match.
5. Optionally compare `getRenderProfile()` before/after: during pointermove
   the renderer profiler's render count must not increase. The final render
   should behave like the 137.1 baseline.

The automated suite covers event logic and CSS transform state, not compositor
FPS on the user's GPU. Measure perceived smoothness in a real browser.
