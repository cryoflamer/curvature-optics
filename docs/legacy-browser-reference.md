# Legacy browser reference capture contract

Historical work item: **#140.12.59**. Status: **six real Opera browser-native original-Canvas PNGs accepted as Legacy regression observations**, archived and verified by [Legacy visual validation](legacy-visual-validation.md). The Playwright-based tool described below remains an **alternative, unverified local capture path**; no full-page screenshots are committed. This is neither Modern pixel parity nor an independent physics oracle.

## Why a browser capture is needed

The [source-state fixtures](legacy-reference-scenarios.md) preserve six literal inputs (TransLine indices 0/4/7; Bedford indices 0/3/6). The [headless numerical fixtures](legacy-headless-reference.md) record old-model numbers but do not execute the drawing pipeline. The old `CurvatureApp.html` renderer has its own pixel transforms, text, objects and clipping. **Only an actual browser observation** can establish what the Legacy canvas produces for a chosen state and environment. An observation still says nothing about physical truth or semantic compatibility with Modern.

## Browser-native observations already archived

The original user-supplied six-frame Opera export is committed unchanged as `tests/fixtures/legacy-browser-references.zip`, with a SHA-256 lock, full source/effective state and decoded pixel checks. Run `python3 tools/validate-legacy-visual-reference.py` to verify it, or supply `--candidate` to compare future Opera exports. See [validation procedure and limits](legacy-visual-validation.md). The browser-native exporter records **Canvas only**, not browser full-page screenshots; it is a distinct capture path from the Playwright script below.

## Alternative local Playwright capture, no source or baseline overwrite

From the repository root, with Python Playwright and Chromium installed:

```sh
python3 tools/capture-legacy-browser.py --plan
python3 tools/capture-legacy-browser.py --out ../curvature-legacy-captures --browser /usr/bin/chromium
```

Install Python Playwright/Chromium first if necessary, following the existing `tools/check-browser.py` environment; with a Playwright-managed browser, omit `--browser`. The destination **must not exist**. Choose a fresh external directory per capture; the tool refuses overwrites and does not write generated PNGs into `tests/fixtures/`. Do not commit unreviewed screenshots as authoritative goldens. Use `--timeout 60000` if your machine needs more time for browser initialization.

`--plan` is an offline check: it validates the fixture selection and prints the six expected captures. It does **not** assert any browser test was run. Capture requires Chromium access to a local HTTP server; environments that deny both HTTP loopback and file-navigation fail instead of producing synthetic images.

## Mechanism and recording

1. Run a local server serving the unchanged working-tree application. Launch a new isolated Chromium context for **each** fixture, with `1440 × 900` CSS-pixel viewport, DPR=1, `en-US`, UTC, light color scheme and reduced motion. Record the browser version, OS, Git commit and SHA-256 hashes of the fixture and relevant original scripts.
2. Open `CurvatureApp.html?ui=legacy` (explicit Legacy diagnostics, no demo query). Wait for the real Legacy globals and canvas. Select **existing default** `MainCanvasRenderer=legacy` and `OpticsSceneComparison=original` and refuse to continue if either differs. Invoke the original `Demos.SetDemo(demo, false, sourceIndex)` in the page. This uses the **zero-based** index; `?pos=` URLs are **one-based** (`src/app/CurvatureStatePersistence.js` decrements positive positions). No auto-play or implicit query redirect is involved.
3. Check that the active demo/position are correct and not playing, and that stable camera/geometry fields match the source payload. Record **all** supplied applied fields; separately list fields recomputed by the model (e.g. coupled atmospheric settings). Wait for fonts and two animation frames, invoke the original `graph.Redraw()`, then read the real `JsGraph1-Canvas` pixels. Reject empty/uniform output and browser-script/local-HTTP errors.
4. Save a **raw original-canvas PNG**, its SHA-256, a SHA-256 of its decoded RGBA pixels, the canvas backing and CSS dimensions, and a separate full-page screenshot with its own SHA-256. The full-page screenshot documents UI context, not an additional optical oracle. An `effectiveStateFields` record, old-model horizon/k values, rendered-canvas measurements, browser user agent, DPR and original source state are included in `manifest.json`.
5. Only after **all six** states and both images per state succeed does the tool atomically publish a folder containing `manifest.json` (`complete: true`) and 12 PNG files. A failure deletes the staging directory and returns nonzero. No partial or fake manifest is advertised as complete; rerunning requires a different, initially absent target directory.

Example semantic filenames: `transline-state-0.canvas.png`, `transline-state-0.page.png`, `bedford-state-6.canvas.png` and `manifest.json`. **No compatpatch number is added to repository filenames.** The numeric state index is part of the scenario identity, not a patch revision. Keep the capture folder outside Git until reviewed; if an external archive is retained, record its URI, hashes, environment, exact command and acceptance decision.

## Comparison and acceptance gates

- **Original Canvas observation evidence is now available** for six Legacy states from Opera; full-page screenshots and a comparable Modern translation remain **missing**. A screenshot hash validates identity of one capture; it is not an expectation that different browsers/DPRs produce byte-identical PNGs.
- Set pixel metrics and tolerances *before* reviewing Modern differences; compare the same canvas crop, color space and dimensions. Report both absolute differing-pixel counts and visibility/occlusion by region; a blank or uniform canvas must be considered a capture failure. Use separate numerical ray observations for physical-model comparisons.
- `TransLine` source `ObjType=3` (towers) and Bedford `ObjType=0` (markers) have no automatically verified equivalence to Modern's types. A scene mapping or explicit unsupported-geometry report must come first. Do not silently convert the stored `CurveApp` payload to Modern `?experiment=`.
- Browser capture is not a `WGSL` compilation test and does not exercise the WebGPU optical experiment. It does not remove the need for Legacy URL compatibility tests and historical diagnostic preservation.

**Historical Playwright limitation (separate from the successful Opera export):** Chromium returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for both loopback HTTP and local `file://` navigation. The Playwright full-page capture was therefore **not executed** there. The **browser-native Opera six-frame Canvas archive was subsequently obtained**, reviewed for integrity, and frozen as a limited Legacy rendering reference. This still does not approve Legacy deletion or Modern pixel parity.
