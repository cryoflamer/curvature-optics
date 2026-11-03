# Legacy visual reference validation (browser-observed, offline)

Status: **six real original-Canvas observations archived** from the user-supplied `legacy-browser-references.zip`, exported in Opera on Windows on **2026-11-03**. This is a **regression reference for the historical Legacy renderer**, *not* a physically correct model, an independent ray-tracing oracle, a full-page screenshot or evidence of Modern equivalence. No browser run was carried out by this validation patch.

## Frozen evidence

- `tests/fixtures/legacy-browser-references.zip`: the **unaltered source archive** with `manifest.json` and six PNGs, one each for TransLine indices **0, 4, 7** and Bedford **0, 3, 6**. These are browser-created images, **not fabricated or regenerated fixtures**.
- `tests/fixtures/legacy-browser-reference-lock.json`: frozen SHA-256 of the entire ZIP, identity and acceptance scope. Replacing the ZIP requires **explicit review and an update to this lock**, not an automatic "update goldens" command.
- `tests/fixtures/legacy-reference-scenarios.json`: preserved, zero-based `sourceIndex` and complete source states, matched against `src/animation/CurvatureDemos.js` by existing tests. The `?pos=` URL hints are **one-based**.
- `manifest.json` records the original browser user agent (Opera 136 / Chromium 152, Windows), capture timestamp, devicePixelRatio 1.5, 1827 × 1218 Canvas pixels, effective state, Legacy refraction/horizon values, CSS size, PNG and decoded RGBA SHA-256, sample color/opacity metrics. `pressure` and `temperatureC` are **legitimately recomputed** for some scenes; the exact recomputed fields must be declared.

Evidence completeness here means **six accepted static Legacy Canvas frames only**. No full-page screenshots were produced by the browser-native ZIP exporter. The separate Playwright capture tool can attempt full-page screenshots in an environment that supports Chromium; it is **not** required for the offline validator. The experiment remains unsuitable as a physical ground truth or a pixel-parity assertion against Modern until scene semantics, models, and an appropriate comparison contract are established.

## Commands

From the repository root, Python 3 **standard library only** (no Pillow, Playwright or running browser):

```sh
python3 tools/validate-legacy-visual-reference.py
python3 -m unittest discover -s tests -p 'test_legacy_visual_reference.py' -v
```

The first command verifies the canonical archive lock, exactly six expected entries, completed manifest, exact source-state fixture/hash, applied camera/geometry consistency, enumerated recomputed fields, model/field consistency, PNG chunk CRC, PNG byte SHA-256, decoded RGBA SHA-256, dimensions, and nonuniform/opaque sampled pixels. It rejects missing, corrupted, substituted or incomplete frames. This is a **read-only** verification; no baselines are generated or changed.

For a **fresh six-frame** `Export all 6 references (ZIP)` downloaded from Opera:

```sh
python3 tools/validate-legacy-visual-reference.py \
  --candidate ../legacy-browser-references-new.zip
```

Default comparison is **exact decoded RGBA pixels** (all channels and dimensions) and exact applied state/model. PNG compression or metadata differences alone do **not** fail pixel comparison, provided each capture's own byte and pixel hashes are consistent. Outputs per frame include differing-pixel count/percentage, mean absolute error **per RGBA channel** (0..255), maximum single-channel delta and a 3×3 grid of changed-pixel counts (top to bottom; left to right). A state/model change always fails, even if pixels match.

If a **predefined**, nonzero tolerance is warranted for a specific environment (e.g. font anti-aliasing), set it **before examining the candidate's deviations**:

```sh
python3 tools/validate-legacy-visual-reference.py \
  --candidate ../legacy-browser-references-new.zip \
  --pixel-threshold 2 \
  --max-differing-percent 0.2 \
  --max-mean-abs-error 0.05 \
  --diff-dir ../legacy-visual-diffs
```

- `--pixel-threshold N` ignores a pixel **for the different-pixel count** only if **every RGBA channel** differs by at most N (0..255). The MAE **always** includes all deviations, even below this threshold.
- `--max-differing-percent P` is the maximum percentage (0..100) of pixels above threshold, **per frame**.
- `--max-mean-abs-error M` is the maximum mean absolute RGBA channel error, **per frame** (0..255).
- `--diff-dir` must be a **new** directory; red pixels on transparent PNGs mark locations where the per-channel threshold is exceeded. Diff PNGs are diagnostic evidence, **not automatically accepted goldens**. The report's 3×3 bins identify regions; it does not infer occlusion correctness or real-world millimetre errors.

The numerical values in this example are **illustrative only**, not an approved tolerance for Legacy-to-Modern or future regressions. The tool exits nonzero on any frame outside the declared thresholds or on mismatched source/model, and never writes into the frozen fixtures.

## Limits and next decision

The validator accepts only non-interlaced **8-bit RGBA** PNGs, the actual original Canvas export format. It validates decoded pixel data independently of PNG encoding; unsupported PNG layouts fail explicitly rather than being silently converted. The six reference frames were captured under a particular browser, DPR and styling environment, so strict pixel equality is an intentionally conservative gate, not proof every other browser must reproduce bit-identical rasterization.

The next migration gate is a **Legacy/Modern feature and geometry compatibility report**, not Legacy deletion. To establish Modern parity, first document a meaningful field/object mapping (Legacy `ObjType=3` towers and `ObjType=0` Bedford markers do not establish a Modern type mapping), the atmospheric/optical model choice and any intentionally unsupported feature. Compare numerical ray/visibility observables and then image regions with independently justified tolerances. Preserve routing/URL compatibility and shared CPU/WebGL2 modules until those gates have passed.
