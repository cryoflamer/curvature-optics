# Legacy / Modern compatibility boundary

Status: **read-only, source-backed compatibility audit; not a working converter, no import or removal approval**. This audit never edits Legacy/Modern runtime state or replaces old bookmarks. It is a review checkpoint, not evidence of optical/physical parity or pixel equivalence. The archive of six actual Opera Legacy Canvas frames remains the [visual reference](legacy-visual-validation.md), **not** a Modern benchmark.

## Reproduce the inventory

```sh
node tools/audit-legacy-modern-boundary.js
node tools/audit-legacy-modern-boundary.js --check
node --test tests/LegacyModernBoundary.test.js
```

The complete deterministic per-state inventory is `tests/fixtures/legacy-modern-boundary.json`. To regenerate deliberately after source/schema changes:

```sh
node tools/audit-legacy-modern-boundary.js --json > tests/fixtures/legacy-modern-boundary.json
```

It inventories **9 demos / 80 states**, including JS-escaped apostrophes in `Soundly`, by parsing the *literal* `CurveApp = {...}` data in `src/animation/CurvatureDemos.js`. **No demo code is evaluated.** The auditor probes the real allowlist/ranges in `src/ui/modern/ModernExperimentState.js` using an isolated known-valid Modern schema object; that object is only a validation probe, never a translated experiment. Each Legacy property is checked independently: this is a **necessary** structural condition, not proof of a valid complete experiment, compatible projection or physical equivalence. The audited six selected source-state indices (TransLine 0/4/7, Bedford 0/3/6) match `legacy-reference-scenarios.json` and the archived Opera original-Canvas captures.

## Object and view semantics: schema alignment is not geometry parity

| Legacy field/shape | Modern state contract | Disposition |
| --- | --- | --- |
| `Height`, `FocalLengthField`, `Pan`, `Nick`, `Roll`, `viewcenterHorizon`, `deviceRatio` | `scene.camera.*` numeric controls | **Schema candidate** if valid: still requires camera/pixel-coordinate equivalence tests. |
| `NObjects`, `ObjType`, `ObjDist`, `ObjDeltaDist`, `ObjSideType`, `ObjSidePos`, `ObjSideVar`, `ObjSizeType`, `ObjSize`, `ObjSizeVar` | `scene.objects.*`, exactly two groups | **Schema candidate only.** Modern GeometryEngine independently handles types 0–3; equal IDs do not establish equal silhouettes, placement, visibility or optics. Negative Legacy distances or out-of-range values can be rejected. |
| `ObjType` **0–3** | Bedford marker, rod, ship, transmission tower are exposed in Modern | Inspect the actual geometry generated for each group; source ID equality alone is **not** equivalence. |
| `ObjType` **4–9** | Modern `ObjType` allowlist **0–3** | **Blocked.** City, mountain, bridge, Tensas, Causeway north/south and other Legacy-only object construction cannot be silently substituted. |
| `showModel=1` (globe) and `2` (flat) | `scene.surface.showModel` 1 or 2 | Data may fit but Legacy globe/flat draw and Modern physical optics are **not identical render pipelines**. |
| `showModel=3` (globe + flat in one Legacy view) | Modern Scene supports only 1 or 2 | **Blocked.** A/B Compare is two independent physical-optics scenes, not an automatic representation of the combined Legacy drawing. |
| `showGrid` 0 or 1 | `scene.showGrid` boolean | Can structurally normalize `0 → false`, `1 → true`; Legacy projection mode 3 cannot be represented without separate behavior. |
| `rEarth` | `scene.surface.rEarth` | Potential radius candidate; still compare geometric meaning. |
| `DemoText`, `Description` | `scene.title`, `scene.description` | Bounded text rename candidate. |

**Not mapped by design:** `rFEarth` (Legacy flat-world reference radius), `nLines`, `showData`, `showTangent`, `showEyeLevel` (not automatically equivalent to `display.eyeLevel`), `refractionCoeff`, `refractionSync`, `refractionFactMin`, `refractionFactMax`, `tempGradient`, `pressure`, `temperatureC`, `opticsMode`, and `opticsProfile`. Some fields are only present in some states; absent Legacy values are **not** filled with guessed defaults. Legacy `k` and barometric synchronization have no lossless mapping to Modern `vacuum`, `standard`, `exponential-occlusion` and hidden `inverse-spherical` profiles. No auto-detection of a Modern atmosphere is attempted. Modern `compare`, `display`, `preset`, `occlusionRadius` and `resetPreset` also have no lossless corresponding input in the archived Legacy snapshot.

## Per-demo results

The following **schema-blocked** count is the number of snapshots with at least one invalid/unsupported candidate field (including unsupported object type, `showModel=3`, or range violation). The remaining states are **review-only**, not converted, because Legacy-only fields and unproven projection/optical behavior remain.

| Demo | States | Schema-blocked | Observed object types | Decision |
| --- | ---: | ---: | --- | --- |
| Curve | 12 | 3 | 3 | Review-only candidates plus combined-view blockers |
| Causeway | 6 | 6 | 3, 6 | Archive bridge geometry pending a real port |
| TransLine | 8 | 1 | 3 | Priority for scoped physical/visual comparison (three Opera frames exist) |
| Grace | 9 | 9 | 5, 6 | Archive mountain/bridge storyboards |
| Bedford | 7 | 7 | 0, 3 | Test marker geometry and combined-view semantics (three Opera frames exist) |
| Tensas | 6 | 6 | 3, 7 | Archive Tensas geometry |
| Soundly | 18 | 18 | 3, 8 | Archive Causeway presentation |
| Chicago | 6 | 6 | 3, 4 | Archive skyline geometry |
| Canigou | 8 | 8 | 3, 5 | Archive mountain/atmosphere presentation |

Some Legacy states violate Modern **numeric ranges** even when their object IDs are allowed: e.g. Bedford state 0 uses a negative `ObjDist`; several Grace states use `ObjDeltaDist` values not accepted by Modern. These are explicitly counted as blocked, not coerced or clamped. A schema-compatible TransLine state is only a candidate for subsequent work, never a promised migration.

### Six Opera reference state decisions

| Original source state | Structural classification | Reason / next gate |
| --- | --- | --- |
| TransLine 0, 4, 7 | Review-only | Fields fit Modern where names overlap; Legacy refraction and controls remain unmapped. Compare tower geometry, camera framing and optical results separately. |
| Bedford 0 | Blocked | Combined globe/flat (`showModel=3`) and negative `ObjDist`; cannot import as-is. |
| Bedford 3, 6 | Blocked | Combined globe/flat (`showModel=3`); a split A/B view is not proof of equivalence. |

## URL, format, runtime and scientific gates

- Legacy `?demo=...&pos=...` uses **one-based** `pos`; the fixture `sourceIndex` is zero-based. `?state=` is `DataX`'s compressed Legacy stream. Older saved `CurveApp = {...}` text is also a **different format** from Modern's versioned, allowlisted `?ui=modern&experiment=...` base64url payload. **Never interpret one as the other.** No live URL rewrite, old-stream decoder or import bridge was added here.
- Bare `CurvatureApp.html` and `?ui=legacy` still use Legacy. `?ui=modern` continues to route into `CurvatureModern.html`, subject to existing `ModernRoute.js` rules. `tab`, hashes, malformed/duplicate URL params and file/HTTP hosting still require migration acceptance before any default-route switch.
- The six Opera PNGs capture the **original Legacy Canvas**, not all page UI and not Modern. The corresponding same-code headless numerics are Legacy regression checks, not independently verified ray/visibility physics. Before comparing pixels define viewport/DPR, aspect ratio, framing, surface, atmosphere/optical model, object shape, occlusion, antialiasing and thresholds **in advance**. Comparing PNGs directly across intentionally different pipelines without these controls is not a parity test.
- `src/legacy/GraphX3DX.js` is loaded by both entry points. Keep shared model, optics, geometry, WebGL2 renderer and CPU fused-gradient/RK4 rollback code until ownership is traced. Never delete solely by folder name; WebGPU research harness retirement is a separate decision.

## Next implementation gate

1. Pick **one** schema-compatible TransLine frame and construct an explicitly reviewed *partial* Modern scene proposal; document every default/assumption and unresolved optical difference. Do **not** issue a converted experiment URL as though it were equivalent.
2. Compare numerically observable tower placement, camera projection, horizon and selected ray/visibility outcomes, with the same declared surface/atmosphere and tolerances. If a measurement is unavailable, mark it missing.
3. For Bedford, decide if the combined Legacy globe/flat presentation needs a dedicated rendering mode or should remain archived; Modern A/B alone is not a substitute.
4. Collect genuine historical `?state=` strings and browser route acceptance cases before implementing any opt-in importer or changing defaults.

**Retirement gate stays closed.** Neither an audit schema pass nor the existing visual references authorizes Legacy removal or a declaration of physical/optical parity.
