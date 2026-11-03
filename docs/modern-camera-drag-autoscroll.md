# 137.2.1 — Modern camera drag cursor / autoscroll follow-up

This is a narrow follow-up to the camera gesture preview in 137.2. No
physics, camera-angle math, redraw scheduling, or stored-experiment format is
changed.

## Observed behavior

- In Opera on Windows the three `.modern-camera-draggable` canvases were
  present, but `getComputedStyle(canvas).cursor` initially returned `auto`.
  The stylesheet contained `cursor:grab!important`, so stale CSS is one
  plausible explanation; the exact cause has not been established.
- Directly setting `grab` and even forcing `crosshair!important` in DevTools
  did not change the reported on-screen four-direction symbol.
- A dot surrounded by four directional arrows is also the characteristic
  Chromium/Opera **autoscroll** indicator after a middle-mouse click. This
  diagnosis is likely, **not browser-verified** in the reported session.
  An already active autoscroll mode needs to be cancelled once (typically
  **Esc** or another middle click); CSS cannot dismiss the browser UI.

## Changes

1. The Modern stylesheet URL now has a version parameter to bypass stale
   cached styles when this patch is installed.
2. The camera interaction explicitly applies `cursor: grab !important` to
   each real Scene/A/B Canvas at binding time and `grabbing !important` to
   both active Compare canvases (or the Scene canvas) during the gesture.
   It restores `grab` on pointer release, cancellation, and mode switch.
3. The drag cursor host receives a temporary inline `grabbing` style and
   its previous inline value and priority are restored on cleanup. This
   allows the cursor to remain consistent when pointer capture leaves the
   originating Canvas.
4. Middle-button `pointerdown`, `mousedown`, and `auxclick` defaults are
   suppressed **only** on camera canvases so a middle click cannot launch
   native browser autoscroll there. Native element `dragstart` is also
   suppressed; left-click camera drag continues to use its existing logic.

## Verification and remaining limit

- Automated Node tests cover direct cursor styles, cursor-host restoration,
  middle-button suppression on Scene/A/B, CSS cache-bust reference and the
  existing camera gesture/preview behavior.
- Node tests cannot prove the actual operating-system cursor artwork. A
  manual Opera acceptance check remains required: after pressing **Esc** to
  dismiss any existing autoscroll mode, reload the page, hover each canvas
  (`grab`), drag with the left button (`grabbing`), release (`grab`), and
  verify the gesture and Compare synchronization remain unchanged.
