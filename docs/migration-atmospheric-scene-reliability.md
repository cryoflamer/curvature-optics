# Compatpatch 109 — atmospheric scene reliability and optical controls

## Reproduction and identified defects

In the first browser Standard-atmosphere capture at 15 m observer height,
Physical mode drew only 332 lines, recorded **2937 unresolved fragments**, and
stopped after roughly **3513 ms**. The same scene in Vacuum drew 3509 lines,
158 unresolved boundary pieces, and displayed both tower groups. This did
**not** show that refraction hid the distant towers: the scene adapter imposed
a hard 3500 ms wall-clock cut-off, returned `solver_failed` for subsequent
samples, and the silhouette module rightly withheld the unverified segments.

The exact shooting implementation also did unnecessary work:

- A sign-changing launch-angle bracket was refined by bisection even when
  the endpoint altitude varied nearly linearly with angle (many complete
  trajectory integrations per target).
- The final fractional RK4 step was bisected up to 48 times for **every**
  shooting evaluation. The ray already carries `dx/ds > 0`, permitting a
  safeguarded Newton endpoint correction.
- The scene used `step=200 m` indiscriminately, with no qualified scene-scale
  choice for the smooth atmospheric profiles.
- There were no separate counts for a genuinely unresolvable point,
  a clipped geometric visibility boundary, and an intentionally limited run.
- The comparison-radius input was shown even for Vacuum and Standard, where
  it has no physical effect.

## Changes

1. `OpticalTargetProjection.solve()` retains a signed angular bracket but
   proposes regula-falsi launch angles, with bisection if progress stalls. The
   final RK4 crossing uses a bounded interpolation/Newton correction instead
   of 48 half-step evaluations. Ground-contact verification remains in place
   and `solver_failed` still never proves occlusion.
2. `CurvaturePhysicalSceneOptics` chooses a conservative, adjustable RK4 step:
   `max(20, min(2000, characteristicRadius/3000))` metres, where the
   characteristic radius is the geometric radius for Standard and the smaller
   of geometric and comparison radius for engineered profiles. The exact
   target-shooting oracle remains independently accessible at any step.
3. **Normal rendering has no hard deadline**. The old 3500 ms limit is now
   a *performance target*, **not** a rule for omitting towers. An explicit
   `settings.maxBuildMs` is still available for diagnostic bounded runs;
   unfinished time-/sample-budget results are not cached as if complete.
4. The silhouette projection reports per-sample statuses and categorizes
   uncertain leaves: `visibility-boundary`, `grazing-uncertainty`,
   `optical-solver`, and `sample-budget`. The shared adapter returns per-bank
   summaries and exact field-solve counts to the UI. A tiny leaf at a
   visibility transition still remains unresolved deliberately; it is **not**
   equivalent to a missed full tower.
5. The Canvas engine / Optical comparison row is separate from Physical
   atmosphere controls. The Physical row appears only in Physical mode.
   `Comparison R` appears only with `exponential-occlusion` and
   `inverse-spherical`; the status distinguishes boundary uncertainty from
   solver failures and displays backend time, RK4 step and exact solves.
6. The original Independent, Legacy, drawing styles, shared painter and
   camera remain unchanged. Polygon interiors, mutual object occlusion and
   a refracted optical horizon remain outside this patch.

## Measured results (not browser guarantees)

- On the representative 85+2 tower model in Node, Standard with the faster
  target solver and 2000 m step produced **3560 visible outline segments**,
  **130 small visibility-boundary leaves**, **0 solver-failed sample statuses**,
  **0 sample-budget leaves**, and the two tower groups remained present.
- These measurements included **7160 exact ray solves**. The shared field
  interpolated almost none of them for this scene; further mesh/cache
  optimization is legitimate future work but must preserve accuracy.
- Runtime varied between executions/environments, typically a few seconds;
  removing the default time cut-off prevents a slower browser or machine
  from silently hiding towers. **The first frame is still synchronous** and
  may temporarily block the UI. No FPS or browser screenshot is guaranteed.
- 2000 m vs 200 m shooting on Globe/Standard, across d=1–40 km and
  altitude 0–70 m, retained visibility statuses; maximum tested angular
  difference approximately 1.2e-13 radians. Analogous Flat-engineered
  profile tests also cover multiple distances and altitudes. This is a
  *sampled numerical qualification*, not a global error guarantee.

## Manual browser acceptance checklist

1. Reload the app after applying 109. Select **Physical optics · shared
   scene (preview)** and the **TrnsmLine** demo, Globe mode, Height 15 m.
2. Choose **Vacuum**: the large comparison tower and causeway bank should
   appear with surface/horizon guides. The foundations remain wireframe.
3. Change atmosphere to **Standard**. Allow the calculation to finish.
   The full tower bank should remain instead of collapsing to one or two
   near towers. Compare camera/framing with Vacuum; refraction changes
   visibility and elevation, not the renderer or 3D tower models.
4. Inspect the text directly under the Physical control row. It should
   report lines, unresolved broken down into *boundary*, *solver*,
   *sample-budget* and *grazing*, uncertain/failed point evaluations, RK4
   step, exact-ray solves and build time. The expected diagnostic on the
   reference scene is **0 solver, 0 sample-budget**, with some *boundary*
   leaves permitted where edges cross the geometric horizon.
5. Rotate/pan the camera: it should say **optical geometry cached**, and
   neither tower bank should vanish. Change Height or atmosphere to cause
   a fresh rebuild.
6. Switch to Flat and then choose **Inverse spherical**. Only for that
   engineered profile (or Exponential occlusion), **Comparison R** should
   be visible and modify the optical reconstruction, independent from
   the Globe geometric radius. Under Standard and Vacuum it is hidden.
7. To compare the old painter, change **Canvas engine** to Independent or
   Legacy. Optical P4 comparison is a separate control and must not be
   mistaken for the Physical atmosphere selector.

If the scene still loses towers, capture the complete status line and the
Height / geometry / atmosphere / R settings. A nonzero `solver` counter is
qualitatively different from a small `boundary` counter. No screenshot from
an actual browser was produced by the automated Node tests.
