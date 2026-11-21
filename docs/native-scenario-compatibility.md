# Native Modern scenes versus preserved Legacy storyboards

This is an **architecture/compatibility boundary**, not a migration checklist.
Proposed native scene decisions and any future per-family qualification belong
to [#38](https://github.com/cryoflamer/curvature-optics/issues/38).
The detailed 2026 source inventory and partial adaptation assessments can be
read in the [archived checklist at the source baseline](https://github.com/cryoflamer/curvature-optics/blob/aa8b2b1a94fa72432648f2ffcec8929a90601b04/docs/modern-location-migration.md).

## Two different products

- Modern **Demos** intentionally embeds the original isolated Legacy
  `CurvatureDemosHost.html` runtime. Nine authored families cover **80 source
  states / 71 transitions**; preserved Legacy playback is not a claim of
  native Modern physical or animated parity.
- Native **Scene/Compare** are physical optical visualizations with their own
  validated scene, camera, atmosphere and serialization. Imported or partially
  adapted static geometry is not the same as migrating the original storyboard.
- The read-only `src/ui/modern/ModernLocationCatalog.js` names source
  identities; it does not register unverified presets or translate Legacy
  state URLs into Modern experiments.

## Historical partial native adaptations

## Scenario identity and source evidence (read-only)

All nine identifiers below are stable, source-backed identities rather than a
migration-progress checklist. Status is obtained from the actual
`ModernLocationCatalog.SCENARIOS` and the protected Legacy demo source, not
from marked-up checkboxes.

| Scenario ID | Legacy family | Source states | Current native scope |
| --- | --- | ---: | --- |
| `earth-curvature-lesson` | Curve | 12 | not-ported |
| `pontchartrain-causeway` | Causeway | 6 | partial |
| `pontchartrain-transmission-line` | TransLine | 8 | partial |
| `anacapa-grace-platform` | Grace | 9 | partial |
| `bedford-level-experiment` | Bedford | 7 | partial |
| `tensas-bayou-bridge` | Tensas | 6 | partial |
| `pontchartrain-soundly` | Soundly | 18 | partial |
| `chicago-skyline` | Chicago | 6 | partial |
| `canigou-mountain` | Canigou | 8 | partial |

**Overlay-equivalent teaching view:** Curve's original combined
Legacy view (`showModel=3`) is a teaching presentation, not an
automatically valid Globe/Flat Compare composite. Do not fabricate
a native view to tick a box.

**Signed-distance prelude:** Bedford's early objects can have negative
observer-relative ranges; silently clamping them or pretending they
are ordinary forward-only Modern objects changes the source experiment.
Grace also has source states with zero spacing. Both need explicit
semantic choices and verified rendering if a future port is approved.

The complete 71 authored transitions are preserved as Legacy evidence,
not a commitment to a native Modern translation. The source tests verify
that the identities/counts, partial preset status and these non-equivalent
physical cases remain readable without maintaining a second task queue.

The earlier migration inventory distinguished Curve (12 states),
Causeway (6), TransLine (8), Grace (9), Bedford (7), Tensas (6),
Soundly (18), Chicago (6) and Canigou (8). Supported geometry types 0–9
and partial adapted views do not certify the complete nine storyboards or
their synchronized overlays/narrative/transitions. Scene/Compare and Demos
remain separate playback paths.

Any new native adaptation needs independently documented geometry types,
owner-relative ranges (including negative and zero spacing), surface and
atmosphere semantics, non-equivalent Legacy refraction, real viewport/DPR
reference comparisons and numeric/ray tests. Require Scene and both Compare
sides, History/URL import/export, library/recovery and true browser validation.
Keep old `?demo=`, `?pos=` and `?state=` links working unchanged.
A schema-compatible field is not a proof of optical or pixel equivalence.

**Decision:** Legacy remains a supported independent animated application;
its retirement and a wholesale 71-transition port are not approved. For
scientific and browser fixture evidence see
[Legacy compatibility](legacy-modern-compatibility.md),
[Legacy preservation](legacy-preservation-contract.md),
[Legacy browser validation](legacy-visual-validation.md)
and [architecture](architecture.md).
