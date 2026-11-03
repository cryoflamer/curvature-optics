# #92 — Independent full-frame decorations and geometry-only parity

## Evidence: diagnostic archive (33)

The four controlled scenes compared the *complete* legacy `DrawModel()` raster
against a composition that previously omitted presentation. Inspection of the
unmatched-pixel maps exposed the missing camera-frame outline (all viewport
borders) and two lines of `DemoText`/`Description` at the top of the frame.
These elements are emitted **after** physical geometry by `DrawModel()`.

Raw dark-foreground IoU from diagnostic (33), **before** this patch:

| Scene | Raw IoU | Ref-only pixels | Candidate-only pixels |
| --- | ---: | ---: | ---: |
| Globe near | 0.8139 | 13,956 | 0 |
| Globe far | 0.7934 | 14,044 | 2 |
| Flat near | 0.7601 | 15,900 | 690 |
| Flat far | 0.7390 | 15,992 | 307 |

For investigation only, excluding 9 pixels on all frame edges and a fixed
440x57 region around the captions on **both** images leaves ~100% dark-pixel
IoU in Globe and ~95.2–95.4% in Flat. This is **not** a full-frame score or
proof of pixel-perfect surface geometry: it reveals how much missing viewport
presentation distorted the earlier global metric. The production implementation
uses camera/model-dependent exclusion rectangles instead of those fixed
investigative cutouts.

The remaining Flat-only unmatched segments in this cropped comparison lie
almost entirely on two straight horizontal rows (y=427 and y=605 at
1218x812). They are consistent with camera-dependent tessellation differences
between legacy `CircleOnPlane` / `ArcOnPlane` and fixed-angle world polygons,
not an error in tower world coordinates. The patch deliberately does **not**
move lines to match one reference screenshot or hide them as decorations.

## Implementation

- `CurvatureFullSceneDecorations` independently projects and paints the
  camera-aligned rectangular frame following the legacy camera basis and
  draws viewport captions using Canvas font metrics. It never invokes a
  mutable `GraphX3DX` drawing operation.
- `CurvatureCompositionCapture` now takes a snapshot *before* decorations,
  then draws them after the independent geometry. Existing `foreground`,
  `edges`, and `rgba` scores continue to compare **complete** images.
- `CurvatureRegionComparison` adds a **separate** geometry-focused dark pixel
  metric, ignoring only explicit frame/caption rectangles in both images.
  It reports the excluded rectangles and pixel count, and states that the
  exclusion might cover parts of physical geometry as well.
- Both the current-frame `independentCompositionComparison.fullComposition`
  and each controlled preset's `fullComposition` report now include
  `geometryForeground` and `decorations` statistics.
- `CurvatureApp.html` loads the presentation modules before the capture bridge.
  Main `DrawModel()` and the production main Canvas path are unmodified.

## Remaining limitations / verification

- Geometry-focused IoU intentionally differs from full-frame IoU; compare
  like with like and never present masked numbers as full parity.
- Legacy data annotations, optical overlays and unsupported objects remain
  unported; curves and Canvas text rasterization can still differ.
- Browser-level rerendering of all four presets remains the necessary next
  empirical validation. Do **not** assume this patch already achieves any new
  full-frame IoU percentage before exporting a new diagnostic ZIP.
