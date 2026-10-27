# Phase 89 — Shared full-scene diagnostic reference

The full and partial comparisons now use the **same captured legacy RGBA snapshot**, rather than reading the legacy canvas twice. `CurvatureCompositionCapture.capture()` accepts an optional `legacyReference` containing `{width, height, camera, rgba}`. The buffer is copied defensively and its dimensions are checked; `CurvatureCompositionComparison.compare()` continues to reject mismatched camera metadata. The original `captureLegacy` callback path remains supported.

This is a diagnostic consistency improvement, not a claim of full-scene parity. The primary `DrawModel()` rendering path remains unchanged.
