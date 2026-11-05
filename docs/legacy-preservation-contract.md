# Legacy preservation contract (#140.12.65)

**Policy:** retain `CurvatureApp.html` as a first-class, fast animated Legacy app. The separate `CurvatureModern.html` remains the CPU/physical-optics research UI. The older proposal to retire all of Legacy is superseded by [the isolation decision](legacy-isolation-audit.md). There is **no mandate to migrate animations into RK4**, to reproduce Legacy pixels in Modern, or to delete shared modules.

## Automated gate

From the repository root:

```sh
node tools/check-legacy-preservation.js --check
node --test tests/LegacyPreservationContract.test.js
node tools/audit-legacy-isolation.js --check
python3 tools/validate-legacy-visual-reference.py
```

`--check` is **read-only**. The reviewed `tests/fixtures/legacy-preservation-contract.json` pins the nine registered demo names, source-state counts, source-defined transition counts, actual tab order, four transport controls, entrypoint identity and the references archive. For an **intentional reviewed change**, generate proposed evidence with `node tools/check-legacy-preservation.js --json` and inspect the diff before replacing the fixture. Do not silently regenerate it to make broken behavior pass.

The Node behavior tests run the **real `CurvatureDemos.js` and `CurvatureStatePersistence.js`** in a constrained VM with a stubbed browser/tab/animation environment. They test 80 source-state callback registrations, 71 animation definitions, all nine demo handlers, transport buttons, reset, actual URL-command dispatch, and explicit Modern routing. The test substitutes `NewModelAnimation`, so it **does not prove timing, interpolation, Canvas painting, DOM layout or browser functionality**. The archived six Opera PNGs are checked with the independent existing Python validator; they cover only 3 TransLine + 3 Bedford states and are not an oracle for the remaining 74 states or physical correctness.

| Demo | States | Animated transitions |
| --- | ---: | ---: |
| Curve | 12 | 11 |
| Causeway | 6 | 5 |
| TransLine | 8 | 7 |
| Grace | 9 | 8 |
| Bedford | 7 | 6 |
| Tensas | 6 | 5 |
| Soundly | 18 | 17 |
| Chicago | 6 | 5 |
| Canigou | 8 | 7 |
| **Total** | **80** | **71** |

The source declaration order differs from the visible tab order; both are part of the contract. A transition is defined for each state **after** the first, not for all 80 states.

## Legacy URL semantics: preserve exactly

| URL on the existing site | Expected behavior |
| --- | --- |
| `CurvatureApp.html` | Opens Legacy directly with Canvas engine `Legacy` |
| `CurvatureApp.html?ui=legacy` | Opens Legacy directly |
| `CurvatureApp.html?demo=Curve` | Starts Curve animation from the beginning |
| `CurvatureApp.html?demo=TransLine&pos=5` | Selects **source index 4** (URL `pos` is 1-based) without starting playback |
| `CurvatureApp.html?demo=Bedford&pos=7` | Selects source index 6 without starting playback |
| `CurvatureApp.html?demo=TransLine&play=1` | Starts/resumes from source index 0; `play` is only used if `pos` is absent/zero |
| `CurvatureApp.html?demo=TransLine&pos=5&play=1` | **Still selects index 4 without autoplay**; explicit `pos` takes precedence |
| `CurvatureApp.html?state=<encoded-DataX-stream>` | Restores a Legacy saved state (its existing `DataX.FromStream` format), not a Modern experiment |
| `CurvatureApp.html?ui=modern&experiment=...` | Redirects to the separate Modern document while preserving query and fragment |

The URL handler delays Legacy demo/state application by 1000 ms after initialization. No format conversion has been authorized. The `?demo=` branch takes precedence over `?state=` when both are specified. Existing `?tab=` selections also remain supported.

## Browser acceptance checklist (manual, **not** claimed as executed by the Node tests)

Serve the repository root in the usual way, for example `python3 -m http.server 8000` and open `http://localhost:8000/CurvatureApp.html?ui=legacy` in Opera/Chromium (the bare entry now routes to Modern). Use a fresh tab after changing the page. Confirm the following **before** a future module move or deletion:

1. The explicit `?ui=legacy` page opens Legacy, not Modern, with its drawing present and **Canvas engine = Legacy**. No blocking JavaScript errors appear in DevTools.
2. Click each of the **nine** named demo tabs (`Curve`, `Causeway`, `TrnsmLine` / URL `TransLine`, `Grace`, `Chicago`, `Canigou`, `Bedford`, `Tensas`, `Soundly`). Each starts its own storyboard and draws its own objects; switching demos works. Look for actual motion and gradual field changes, not only a static last frame.
3. In TransLine, use **Play/Stop**, **Back**, **Forward**, **Count** and a click on the **Canvas**. Verify pause/resume, both directions, first/last jump and Canvas playback toggle. Clicking the active demo while running should advance one step. Reset returns to the initial scene.
4. Open the URL cases in the table above in fresh tabs. For `pos=5`, check the fifth TransLine state without autoplay. For `play=1` without `pos`, check that playback begins. Restore a real `Get App State URL` link and verify the state fields survived; don't use a fabricated `state` string.
5. Click **Export all 6 references (ZIP)**. Validate the downloaded ZIP with `python3 tools/validate-legacy-visual-reference.py --candidate /path/to/new.zip` according to that tool's documented CLI. For pixel comparisons, consult [visual reference validation](legacy-visual-validation.md); don't assume identical PNGs across browser/DPR/platform settings.
6. Open `http://localhost:8000/CurvatureModern.html` separately (and confirm bare `CurvatureApp.html` redirects there). Confirm Modern Scene and Compare still work, and its Legacy link returns to Legacy. Do **not** expect the Modern RK4 solver to animate at Legacy speed.

A browser failure must be investigated before deleting or relocating affected code, even when the static contract and VM tests pass. **The six archived reference images and the `optics-baseline-2026-11` tag are protected evidence.**

## Scope and limitations

This patch adds test tooling, the reviewed contract fixture and documentation **only**. It does not edit `CurvatureApp.html`, `CurvatureModern.html`, old demos, physics algorithms, script ownership, route semantics, or WebGPU research. It does not create new versioned HTML files. The Browser acceptance checklist is an explicit remaining manual gate, not a claim that Legacy has been successfully animated in the current Linux headless environment.

**Follow-up:** [#140.12.66 dead-code candidate audit](research-archive.md) now inventories 38 source files with explicit consumers and **zero approved deletions**. The manual Legacy browser acceptance gate still precedes any move or removal.
