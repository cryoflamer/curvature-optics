# Optical checks

From the repository root:

```sh
node tools/check-optics.js
python3 tools/check-browser.py --out optics-check
```

The Node runner executes every `*.test.js` in the repository root and checks syntax of the key optical modules. It exits nonzero on failure. The browser check requires Python Playwright (`pip install playwright`) and Chromium; on systems without `/usr/bin/chromium`, pass `--browser /path/to/chrome`. It runs a local HTTP server, selects the transmission line, draws the vacuum tower, triggers the atmospheric calculation, saves `vacuum.png`, `atmosphere.png`, and `report.json`, and fails on uncaught browser exceptions or unsuccessful calculation. Browser images are **diagnostics**, not pixel-perfect golden images. The atmosphere computation can be slow; increase `--timeout` if needed.

Inspect the generated images before accepting a geometry change. Browser mode is intentionally forced to ray tracing for a repeatable smoke test, rather than relying on saved UI settings.
