# Phase 88 — Full independent composition diagnostic capture

`CurvatureCompositionCapture.capture({compositionScope:'full', ...})` renders
`CurvatureIndependentComposition.composeFull()` using the existing painter
renderer and the same supplied camera snapshot as the legacy capture.
The default `compositionScope:'partial'` remains unchanged.

The geometry diagnostics export now includes `independent-full-composition.png`,
`independent-full-foreground-diff.png` and `independent-full-edges-diff.png`.
The comparison JSON contains `independentCompositionComparison.fullComposition`
with layer audit, render statistics, difference metrics and caveats.

The reference is the actual legacy DrawModel frame, not a generated surrogate.
Only single-view frames with one supported type-2 tower series are captured
by the existing UI guard. This is not a pixel-equivalence assertion: labels,
optical overlays, unsupported objects and rasterization differences remain.
The main DrawModel rendering path is unchanged.
