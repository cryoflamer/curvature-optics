# Historical Legacy bundle provenance (#140.12.67)

**Decision: preserve the ten readable sources, the three active bundles, and `src/make.bat` for now. No files have been deleted or switched.** This is a source-provenance review, **not** approval to migrate, rebuild, or retire the fast animated Legacy interface. Modern continues to load the shared `src/legacy/GraphX3DX.js`.

## Reproduce the audit

From the repository root, using only Node.js built-ins:

```sh
node tools/audit-legacy-bundle-provenance.js
node tools/audit-legacy-bundle-provenance.js --check
node --test tests/LegacyBundleProvenance.test.js
# Inspect a proposed fixture change instead of overwriting it blindly:
node tools/audit-legacy-bundle-provenance.js --json > /tmp/legacy-bundle-provenance-proposed.json
```

The reviewed report is [`tests/fixtures/legacy-bundle-provenance.json`](../tests/fixtures/legacy-bundle-provenance.json). It pins file SHA-256 checksums, sizes, source ordering, minified bundle SHA-256 checksums, lexical token counts and checksums, HTML entrypoint loads, historical build target names and the existing `slider.js` case mismatch. `--check` reads the fixture but never writes it. Source or bundle edits which change code tokens fail immediately; comment-only edits require deliberate fixture review via the file SHA-256 values.

## Provenance mapping

| Historical `src/make.bat` inputs, in actual order | Active bundle | Lexical tokens | Loaded by |
| --- | --- | ---: | --- |
| `x.js`, `jsg.js`, `jsgx3d.js` | `src/legacy/GraphX3DX.js` | 66,561 | **Legacy and Modern** |
| `tabs.js`, `xtc.js`, `DataX.js`, `Slider.js`, `NumFormatter.js`, `ControlPanel.js` | `src/ui/ControlPanelX.js` | 29,119 | Legacy |
| `ModelAnimation.js` | `src/ui/ModelAnimationX.js` | 7,380 | Legacy |

**Finding:** When each source group is concatenated in the historical recipe order, its JavaScript lexical token stream matches the currently loaded, compact bundle. The audit ignores whitespace and comments while preserving strings, regular expressions and punctuation; it also syntax-checks both the concatenated originals and the bundle using Node's JavaScript parser, without executing them. This is substantially stronger evidence of common source provenance than names or function lists alone.

**Limits:** The small self-contained tokenizer is designed for the old syntax in these files; it is not a general JavaScript parser or an assurance about automatic semicolon insertion, exotic regex syntax, Unicode identifiers, or future language features. Matching tokens and successful syntax compilation cannot, by themselves, guarantee identical behavior for every browser/runtime environment. The old `jsmin.exe` was **not executed**. No byte-identical rebuild was performed. Full animation/URL/Opera regression and license review are separate prerequisites for any change to the active bundles.

## Why `src/make.bat` is not an accepted build procedure

1. It invokes `jsmin`/`jsmin.exe`, an old **Windows PE32 binary** stored in `src/`. Running or reusing that executable has not been justified and is **not necessary** for this evidence check.
2. It specifies **`slider.js`**, but the tracked filename is **`Slider.js`**. The mismatch breaks on case-sensitive Linux/WSL filesystems.
3. From the `src/` working directory, its output paths are `../GraphX3DX.js`, `../ControlPanelX.js` and `../ModelAnimationX.js`, whereas the active HTML loads `src/legacy/GraphX3DX.js`, `src/ui/ControlPanelX.js` and `src/ui/ModelAnimationX.js`.
4. The disabled debug `<script>` list in `CurvatureApp.html` includes the ten original files, but the active page loads the compact bundles. Switching scripts is **not** part of this audit.
5. The HTML usage map already protects shared `GraphX3DX.js`: changing it may affect both Legacy **and Modern**, even if ControlPanel/ModelAnimation are Legacy-only.

Thus, merely running `make.bat`—even after correcting its spelling and output paths—would be an **unverified modification**, not a tested recovery of the shipped assets.

## Historical authorship and licensing

The readable source headers record third-party origins, including `x.js` (Michael Foster's Cross-Browser.com library, with an **LGPL** statement and Walter Bislin edits), `Slider.js` (Dragdealer/Ovidiu Chereches, **MIT** statement), and several other Walter Bislin utility/graphics modules. The compact bundles retain only short credit headers and drop much of this context. **Do not treat copyright comments as disposable build noise.** The exact licensing obligations and any additional historical attribution should be reviewed before republishing, replacing, or removing these files; this audit is not a legal clearance.

The repository's accessible Git history for this file set starts with an imported baseline, so it does **not** establish a complete upstream chronology. Source headers and the historical recipe supply provenance clues, not proof of a specific upstream release or a verified reproducible build.

## Recommended decisions / future gates

- **Now:** Preserve all **10 original sources**, **3 active bundles**, `src/make.bat`, and the old minifier as recorded artifacts. Keep the audit and [Legacy preservation contract](legacy-preservation-contract.md) green. Do **not** invoke the Windows binary or replace bundles.
- **If improving maintainability later:** Consider adding a new **reviewable, cross-platform** build process in a *separate* patch, without overwriting the shipped bundles. Compare outputs, license headers, browser globals and animation behavior; require explicit Opera acceptance for all nine demos, routes, transitions, and export references, plus Modern shared-GraphX3DX checks.
- **If considering cleanup:** Distinguish obsolete **build procedure** from original **readable sources**. The latter are useful for debugging and attribution even though HTML currently loads only compact bundles. Choose archival/removal only with an explicit retention plan and independent baseline testing.

**Outcome:** Provenance is established at the lexical level; rebuild reproducibility and browser equivalence remain **unverified**. Approved deletions: **zero**. CPU RK4, WebGL2, WebGPU research, Legacy animations, and all reference fixtures were untouched.
