# Browser-native Legacy reference export

This is a browser-first alternative to the optional Playwright capture described in [legacy-browser-reference.md](legacy-browser-reference.md). It does not require Chromium, Linux Playwright, Python or a browser automation bridge. It works in an ordinary desktop browser such as Opera, provided the original Legacy page is served over `http://localhost`.

## How to use in Opera

From the project root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/CurvatureApp.html?ui=legacy` in Opera (the bare entry now routes to Modern). In the toolbar directly under **Canvas engine** and **Optical comparison**, use **Legacy reference capture**:

- **Export current PNG + JSON (ZIP)**: export the presently displayed original Legacy Canvas and its current demo position plus numerical and browser metadata. This is an ad hoc observation, not one of the fixture-backed six references unless explicitly reviewed; stop playback first and select **Legacy** / **Original (legacy k)**.
- **Export all 6 references (ZIP)**: read the existing six selected states from `tests/fixtures/legacy-reference-scenarios.json`, create six fresh temporary same-origin Legacy frames in a small visible capture preview at the lower-right of the window, select each state with the original `Demos.SetDemo(demo, false, sourceIndex)`, and export one ZIP containing six Canvas PNGs and `manifest.json`. The visible page's current model and demo are not changed. A failure cancels the entire download rather than publishing a partial archive.

Each capture checks applied stable camera/geometry fields, waits for fonts and two animation frames after original synchronous `graph.Redraw()`, refuses empty/uniform canvases, and hashes the raw canvas RGBA pixels and resulting PNG bytes with browser SHA-256. A second raw-pixel hash after PNG encoding rejects a frame that changes during capture. An automated state capture can retry a blank, pending or changing frame up to **six** times with short pauses; the manual **Export current** path still makes a single capture. An original-renderer exception, invalid state or wrong mode is reported instead of being silently accepted. It records browser user agent, DPR, dimensions, old-model horizon/k/camera values, original input states and any fields recomputed on application. The ZIP reuses `src/diagnostics/GeometryDiagnosticsZip.js` (uncompressed/store). Large images can make an archive large.

The small live preview replaces an entirely transparent iframe: Opera may defer or optimize painting of fully invisible content. It is temporary and removed on both success and failure. The main page's selected demo, camera and render mode remain unchanged. While capturing, the toolbar shows the exact demo, zero-based state index, and retry count. Failures include the failing sample, canvas dimensions, sampled-color/opacity counts when available, graph drawing/pending status and the number of attempts. No partial ZIP is published.

The ZIP is generated *inside the browser*. Opera may prompt to allow a download. Do not switch away from the tab during the six-capture operation. Only a completed archive with six records and six matching PNG entries should be considered a complete browser-native run. Keep exported artifacts outside the repository pending review.

## What this does **not** assert

- This exports the original **Canvas** only; there is no full-page browser screenshot (web pages cannot capture their complete browser viewport using standard Canvas APIs). The Playwright tool can separately capture page PNGs.
- This is not equivalent to the earlier Python Chromium capture's fixed isolated viewport/DPR/browser environment. The in-page export records actual rendered Canvas sizes and DPR; compare only captures with compatible dimensions, renderer state and browser settings.
- No PNG captured via Opera is bundled into this patch, and no Modern/Legacy visual parity or independent physical truth is asserted. Inspect generated files and qualify them before establishing accepted visual goldens or deleting Legacy.
- SHA-256 requires `crypto.subtle` in a secure context; `http://localhost` is treated as trustworthy by browsers. Opening the HTML directly as `file://` is not the supported workflow (the fixture fetch may fail).

## Regression scope

`node --test tests/LegacyBrowserReferenceExport.test.js` validates the fixture mapping, wiring, ZIP structure, field checks, renderer gating, retry/recovery after blank frames, Canvas consistency during encoding, swallowed drawing exceptions and preview cleanup with browser API mocks. It does **not** execute Opera, capture a real PNG, or validate the actual visual quality of generated images. Browser acceptance is a separate manual gate.

## Browser acceptance still required

The earlier **single current** export in Opera succeeded for TransLine, but the six-state
batch initially failed on a blank/uniform Canvas. The cause has not been
reproduced in an actual Opera run here. The visible frame, retry and diagnostics
are a targeted mitigation and investigation aid, **not** evidence that all six
states now export correctly. After applying this change, reload the page and
click **Export all 6 references (ZIP)**. A successful browser run should deliver
`legacy-browser-references.zip` containing six unique nonblank Canvas PNGs and
`manifest.json` (`complete: true`, `sampleCount: 6`). If it still fails, retain
the full toolbar error (demo/state/attempt/graph status) to identify the fault.
Do not commit or approve new image goldens before reviewing the actual files.
