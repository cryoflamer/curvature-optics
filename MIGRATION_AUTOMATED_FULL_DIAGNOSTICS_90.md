# Phase 90 — One-click Globe/Flat full-scene diagnostics

`Export geometry diagnostics (ZIP)` already runs four controlled scenarios (Globe/Flat × near/far) and restores the live model after each reference capture. It now also runs `CurvatureCompositionCapture.capture({compositionScope:'full'})` for **each** controlled scenario, using the actual controlled legacy full-frame pixels and camera as a shared reference. No manual mode switching or separate ZIP downloads are needed.

For each scenario the ZIP includes `controlled-<id>-full-composition.png`, `...-foreground-diff.png`, and `...-edges-diff.png`. `geometry-audit.json` stores these paths and metrics under `controlledPresets[].fullComposition`, including per-scenario failures. The preexisting current-frame partial/full comparisons and tower-only comparisons remain available. Differences remain expected where legacy graphics are not yet independently implemented.
