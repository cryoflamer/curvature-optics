# Fast optical preview — mathematical field and experimental Modern renderer

`src/optics/OpticalFastRayField.js` is a cheap ray-field alternative to the
Accurate RK4 implementation. **Modern Scene/Compare offer an explicit
Display → Optical ray field → Fast Preview** manual choice and an **Auto**
navigation mode. The same physical
scene composer, camera, painter, foundation polygons and Canvas remain in use.
The default remains **Accurate · RK4**; selecting Auto enables temporary
Fast optical frames while moving the camera and full Accurate after stopping. Legacy is untouched.

## API and units

`CurvatureOpticalFastRayField.create({ geometry, radius, observerHeight,
atmosphere, profileOptions, contactMarginMeters })` returns
`{ sample(distance, height), stats(), mode }`.

- `distance` is a horizontal range in metres for Flat, and an arc length along
  the physical surface in metres for Globe (the same contract as the shared
  ray field). `height` is altitude above the corresponding ground in metres.
- `sample()` reports `visible`, `blocked`, `indeterminate`, or `unsupported`,
  and an angle in **radians** where a forward ray was found. `angle` in a blocked
  result is **not** a visible image direction.
- `accuracy` distinguishes `exact-model` from `approximation`; neither value
  certifies all possible multipath branches or pixel-perfect scene rendering.
- There is deliberately no `exact()` method or hidden RK4 call. The Modern
  adapter uses `sample()` for objects **and** metric ground guides in Fast mode.
  Accurate uses its original `.exact()` path and remains independently cached.
- Unsupported targets (steep rays, samples outside the table or unstable
  curvature) are explicit. They must not be treated as vacuum, invisible,
  or clear. No custom profile is accepted.

## Mathematical models

For Globe, use conformal coordinates

\[
X=d,\quad u=R\ln(1+h/R),\quad
m(u)=\bigl(1+h/R\bigr)n(h).
\]

The derivative at the observer is

\[
g=\left.\frac{d\ln m}{du}\right|_{h_e}
=\frac1R+\left(1+\frac{h_e}{R}\right)
\left.\frac{n'(h)}{n(h)}\right|_{h_e}.
\]

Flat uses `u=h`, `X=d`, and `g=n'(h_e)/n(h_e)`. Replace `m(u)` by a
constant-log-gradient exponential **surrogate**, `m(u) ∝ exp(gu)`.
For `q=gd`, a forward branch has

\[
\tan\alpha_0=\frac{\cos q-\exp[-g(u_t-u_e)]}{\sin q},\qquad
u(X)=u_e-\frac{1}{g}\ln\frac{\cos(\alpha_0+gX)}{\cos\alpha_0}.
\]

The zero-gradient limit is the straight line. The inversion uses `expm1` and
half-angle identities to avoid cancellation. Interior minima of `u(X)` are
checked against the opaque surface `u=0`; near-contact results carry
`indeterminate`, not a fabricated authoritative verdict.

The surrogate is **physically exact within its forward single-ray scope**
for:

- Vacuum on Flat and Globe (Globe's conformal metric has constant `g=1/R`).
- Flat `exponential-occlusion` with `n(h)=n₀ exp(h/Rₒ)`.
- Flat `inverse-temperature` with *exactly* 100% engineered profile weight,
  which has the same `d ln n/dh=1/Rₒ` even though `n₀` differs.

For built-in Standard it is an **approximation**: `n(h)=1+N₀ exp(-h/H)`
does not have constant conformal log-gradient. In Globe, nonpositive
`g` (strong-refraction/ducting cases) is deliberately unsupported. Other profile families use the opt-in adaptive kernel for explicitly selected
**Fast** rendering (see below); the original `create()` API remains restricted. The 3 m default contact band for
Standard is a safety convention, **not an experimentally certified global
error bound**; the exact-model branch uses a 1 µm numerical contact band.

## Diagnostics and limits

Run:

```sh
node --test tests/OpticalFastRayField.test.js
node tools/compare-fast-ray-field.js
```

The diagnostic uses independent `OpticalTargetProjection.solve` RK4 samples
at several distances and heights, prints status disagreements, maximum
angular discrepancy converted to pixels for a hypothetical 1920 px / 5°
camera, and sampled computation time. It does not compare finished Canvas
images or validate global first-ground events. A reported `indeterminate`
should not be counted as an incorrect occlusion or silent success.

## Adaptive kernel integration (stages 1–4)

`CurvatureOpticalFastRayField.createAdaptive(options)` is now selected by the
physical scene adapter for built-in profiles that are not already covered by
the existing Fast analytic/local-gradient implementation. It tables `n(h)` and
`dn(h)` to 50 km (256 log-height samples), integrates eight piecewise-curvature
intervals with two passes and returns approximate angles and ground-clearance
statuses. The physics inputs match Accurate's per-model options: **direct**
`temperatureProfile` for temperature-lapse; nested `transitionProfile` and
`inverseProfile` with their `temperatureProfile` and `occlusionRadius` where
needed. The choice does not change saved experiment parameters. Unresolved
steep rays or unstable/over-range trajectories are never automatically retraced
by RK4. The independent accurate path and cache are unaffected.

The initial adapter integration enabled the explicit **Fast** selector.
Camera-motion integration (stage 3) also permits the same built-in profiles
in **Auto** and Camera Animation, without changing the accurate RK4 path.
Stage 4 retains up to **12** recently used atmospheric gradient tables
(256 samples each), keyed by geometry, Earth radius, named profile and its
physical parameters. Observer height does not change the atmospheric table,
so varying camera height can reuse it. Each new ray field still owns its
scratch path and counters, and the tracer validates the atmospheric options
on cache hits. `stats().tableCacheHit` reports lookup reuse; it does **not**
mean that a partially unresolved Fast composition was cached or reused.
Performance of a fully rendered browser scene is not established by
isolated-kernel timings.

## Manual Modern integration, adaptive object LOD and known limits

1. Open **Modern → Scene or Compare → Display → Optical ray field**. Select
   `Fast Preview · approximate` to draw a new scene through the cheap ray
   field. `Accurate · RK4` restores the original full optical calculation.
   Selection is session-local, **not** saved to the experiment URL or JSON.
2. Explicit **Fast** now routes all built-in named atmospheres on Globe and
   Flat. Standard preserves its existing local constant-conformal-gradient
   field; Flat exponential-occlusion and Flat inverse-temperature at exactly
   100% engineered weight retain their analytic field; vacuum retains its
   separate analytic geometry. Temperature-lapse, intermediate profile-transition,
   intermediate inverse-temperature, inverse-spherical and the remaining Globe
   engineered cases use `createAdaptive()` with each model's actual profile
   parameters. Transition weight 0/1 resolves to the original named endpoints.
   No hidden RK4 or Standard substitution occurs. Compare sides have separate
   atmospheric inputs/field instances; their existing LOD policy is unchanged.
3. **Fast Preview is approximate.** The standalone field's default 3 m
   near-contact margin is retained for conservative mathematical diagnostics;
   the *scene Preview adapter* explicitly uses a narrower **0.1 m band** to
   avoid removing thousands of otherwise drawable foundation fragments. This
   trades horizon confidence for speed and visual continuity, and is *not* a
   measured error bound. The adaptive kernel has an independent default 0.25 m
   contact band; the scene adapter uses the common 0.1 m preview setting.
   Missing/incorrect near-horizon silhouettes remain possible. An
   `indeterminate` is never promoted to a visible ray. Shallow-ray limits
   (e.g. steep, near-camera targets) remain `unsupported`, potentially leaving
   incomplete fills; these partial scenes are deliberately not cached.
4. The separate Scene and Compare A/B cache sessions, plus an explicit quality
   key, prevent Approximate results from being mistaken for Accurate. Traced
   horizon overlays are suppressed in Fast mode to avoid accidental RK4
   work. Do not interpret the guide horizon as an accurate physical diagnosis.
5. **Fast Preview object detail** (under the quality selector) has `Auto`,
   `All towers`, and manual strides 2/4/8/16/32. Only authored tower banks
   are thinned, and **whole placed objects** (struts plus foundations) are
   selected in existing far-to-near painter order. The four nearest towers
   and the far endpoint of each bank always remain. Non-tower shapes and
   unidentified authored objects are never thinned. The original composition,
   physics, saved experiments and Accurate mode remain unchanged. Both Compare
   viewports use the **same stride** for consistent object selection.
   `Auto` begins at full detail and adjusts *future* preview redraws using
   complete measured render time, with hysteresis to avoid flicker: 45 ms
   target in Scene, 70 ms for a whole A+B Compare update. A targeted single
   Compare-side edit does not retune the shared stride. The LOD controller is
   not an asynchronous renderer; it does not redraw by itself and cannot
   guarantee target FPS. Quality/LOD preferences are session-only and do not
   enter experiment JSON. Switching to Accurate restores **all** objects.
6. Repeatable CPU optics-only measurement on real tower geometry:
   `node tools/benchmark-preview-lod.js` (`--towers=85`, `--runs=5`). It
   reports median cold optical composition cost for stride 1/2/4/8/16/32
   on Globe and Flat, separate from authored scene generation and Canvas.
   Its object counts can differ from the nominal tower count because the scene
   includes another object bank. End-to-end browser timing remains necessary.
7. `tests/ModernFastPreview.test.js` covers real geometric fills/outlines,
   unchanged analytic paths, adaptive routes across both geometries, the
   profile-settings effect on rendered strokes, zero RK4 calls in Fast,
   quality/cache isolation, and UI routing for Scene/Compare. Browser pixel
   parity and complete end-to-end FPS have **not** been established.

### Camera-motion integration and visual caveats

- Manual Fast and Auto now physically recompute the shared camera pose during
  pointer drag, including for temperature-lapse, profile-transition,
  inverse-temperature, inverse-spherical and engineered profiles. This is
  **not** a cached raster displacement. In Compare, A and B repaint as a single
  batch with their independent atmospheric parameters. Manual Fast stays Fast
  on release; Auto returns to full Accurate RK4. Accurate manual drag retains
  the older CSS-only compositor before a single exact commit on release.
- RAF batches are coalesced. A navigation gesture starts at 100 ms cadence;
  measured **complete** Scene or A+B Compare redraw time adjusts that interval
  toward 65–180 ms, with immediate slowdown and gradual speed-up. Pointer
  motion marks the pose dirty: an unchanged held pointer does **not** trigger
  repeated physical frames. The final changed pose is still scheduled after a
  throttle interval even if mouse movement stops without `pointerup`.
  Release/cancellation clears pending timers. This is not guaranteed FPS:
  synchronous optics/Canvas work can still exceed the budget, and Opera
  end-to-end timings need manual verification.
- Compare finished Canvas silhouettes, occlusion and fills with Accurate under
  Scene and Compare A/B at different camera poses, FOVs and atmospheres when
  assessing *visual* quality: the numerical audit below cannot prove this.
  Frame time, perceived smoothness and object thinning must be checked in a
  browser; the scheduler is adaptive but not asynchronous.
- Exact caches, exact horizon/ground events and final offline animation
  rendering remain completely independent of Preview.


## Auto navigation mode

- **Optical ray field → Auto** is opt-in and not part of experiment JSON/URL.
  At rest it uses Accurate (full towers, independent RK4 caches). For supported
  Scene/Compare atmospheric profiles, pressing and holding camera navigation
  keys, dragging the camera, or using Alt/Shift + wheel produces **Fast**
  projections; the final released/idle camera is recomputed with Accurate.
- The Fast path is limited to at most one pending physical repaint. The
  initial **100 ms** motion interval adapts to measured rendering time within
  **65–180 ms**. There is no repeated redraw for an unchanged camera pose.
  This is **not** a guaranteed FPS: a synchronous Canvas/optical draw still
  blocks the UI while it runs. The first frame of each Auto LOD navigation
  sequence starts with
  every eighth tower to avoid a dense-scene cold-frame delay; the measured
  budget controller then adapts subsequent images. A manually chosen LOD
  stride is respected. Both Compare sides use a common stride.
- Wheel bursts restore Accurate approximately **220 ms** after the last input.
  A pointer drag restores Accurate on release; a cancelled pointer drag
  restores the original pose. Keyboard movement completes with Accurate on
  key release. The prior CSS-only compositor is preserved for manual
  **Accurate** drag only; manual **Fast** now displays changing optical frames
  before mouse release, and stays Fast afterward.
- Auto activates Fast only when **all** affected viewports use supported
  built-in profiles: Vacuum, Standard, temperature-lapse, profile-transition,
  inverse-temperature, inverse-spherical or exponential-occlusion, on Flat or
  Globe. Unknown profiles do not trigger repeated RK4 during movement; the
  final released pose is Accurate. A Fast error does not silently fall back
  to a different atmospheric model or to RK4.
- Preview-only unresolved rays near grazing contact remain approximate
  and may cause missing silhouettes. The `unresolved` count is a number of
  unresolved projected fragments, not a number of failed towers. It tends
  to increase with full geometry; thinning reduces the number of candidate
  fragments and must not change the physics or Accurate result.
- Tests in `tests/ModernCameraNavigation.test.js` exercise Auto's frame
  throttling, scene/Compare quality transitions, wheel settling, pointer
  cancel, manual Fast live frames, end-of-throttle motion frames, adaptive
  atmospheres, LOD restoration and Compare B pointer routing. Browser visual and
  long-session interaction tests remain necessary before relying on an FPS
  target, especially in high-object-count experiments.

## Adaptive Fast Preview validation and closure (stage 5)

Reproduce the **sampled numerical check**, which deliberately runs outside
Canvas and does not modify application physics:

```sh
node tools/compare-adaptive-fast-preview.js > /tmp/curvature-adaptive-fast-audit.json
node tools/compare-adaptive-fast-preview.js --quick
node --test tests/OpticalAdaptiveFastRayField.test.js tests/ModernFastPreview.test.js
node tools/benchmark-adaptive-fast-preview.js
```

The independent comparison calls `OpticalTargetProjection.solve()` with RK4
for **definite** Fast results; `indeterminate` and `unsupported` stay explicitly
unresolved and are **not** counted as accuracy successes or disagreements.
The deterministic sample grid contains 6 configurations: Globe temperature
lapse at −20/+20 K/km, Globe standard→engineered transition at weight 0.5,
Flat inverse-temperature at weight 0.5, Flat inverse-spherical, and Globe
exponential-occlusion. It checks observer heights **2/15/100 m**, target
ranges **1/10/25/50/80 km**, and target heights **0/3/15/50/200/1000 m**
(540 targets total). This is a **bounded sampled envelope**, *not* a global
accuracy guarantee for these models or all refractive profiles.

At stage-5 closure, this sample produced **337 visible, 179 blocked,
6 indeterminate and 18 unsupported** Fast results, with **0 status disagreements**
on the 516 definitive targets; maximum visible angular difference was about
**0.34 equivalent pixel** for a **hypothetical** 1920 px wide, 5° viewport.
Equivalent pixels convert the ray-angle discrepancy only; **no Canvas pixels
were compared**. The `--quick` mode uses only the 15 m observer, and the unit
test asserts its sampled definitive statuses and a loose angular sanity bound.
The tests additionally check near-grazing uncertainty with the scene's
0.1 m contact band, steep/above-table rejections, separate per-field counters,
profile cache isolation and absence of hidden RK4 fallback.

**Known limitations and practical interpretation:**

- `unsupported` means the approximation declines to predict the ray — notably
  steep/near-camera directions (initial slope >0.25), targets above the
  50 km lookup ceiling, very strong ducting/unstable paths, or rays beyond the
  supported forward Globe arc. It does **not** imply physical invisibility.
- `indeterminate` means a predicted near-ground contact; it is not promoted
  to visible. With a **0.1 m** scene band, exact horizon placement, very thin
  silhouettes and support fills may differ visibly from Accurate. Neither
  status proves all possible multipath rays, mirages, or ground intersections.
- `unresolved` in the Scene/Compare footer counts unresolved projected
  **fragments**, not missing objects or RK4 failures. It can be large on the
  Globe with many near-camera tower segments even when Fast preview is useful.
  The object LOD drops work; it does not fix these optical uncertainties.
- Frame pacing is based on real measured redraw duration, but no browser FPS,
  exact-raster parity or heavy-session performance is certified by these tests.
  The reported user check confirmed that live Fast dragging now produces
  moving optical frames, **not** that every high-gradient scene is accurate.

**Closure:** Fast/Auto atmospheres, live Scene/Compare drag, bounded cache,
LOD/pacing and sampled numerical guardrails are implemented. The current
preview is intentionally approximate; high-accuracy horizons and final
images remain an Accurate RK4 task. Further work should respond to a
reproducible visual regression or measured browser bottleneck rather than
chasing an arbitrary optical-precision threshold in Fast.
