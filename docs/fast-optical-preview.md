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
- Unsupported atmosphere/geometry combinations are explicit. They must not be
  treated as vacuum, invisible, or clear. No custom profile is accepted.

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
`g` (strong-refraction/ducting cases) is deliberately unsupported. Other
profile families are not yet qualified. The 3 m default contact band for
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

## Manual Modern integration, adaptive object LOD and known limits

1. Open **Modern → Scene or Compare → Display → Optical ray field**. Select
   `Fast Preview · approximate` to draw a new scene through the cheap ray
   field. `Accurate · RK4` restores the original full optical calculation.
   Selection is session-local, **not** saved to the experiment URL or JSON.
2. Qualifying atmospheres are Standard Globe/Flat, Flat exponential-occlusion,
   Flat inverse-temperature **at exactly 100%** strength, and vacuum (which
   continues to use the existing exact analytic vacuum geometry). A complete
   Flat profile-transition endpoint may resolve to exponential-occlusion.
   Other profiles deliberately produce **Fast Preview is unavailable**, with
   a cleared viewport, rather than silently invoking RK4 or displaying stale
   pixels. Compare A and B can qualify independently.
3. **Fast Preview is approximate.** The standalone field's default 3 m
   near-contact margin is retained for conservative mathematical diagnostics;
   the *scene Preview adapter* explicitly uses a narrower **0.1 m band** to
   avoid removing thousands of otherwise drawable foundation fragments. This
   trades horizon confidence for speed and visual continuity, and is *not* a
   measured error bound. Missing/incorrect near-horizon silhouettes remain
   possible. An `indeterminate` is never promoted to a visible ray.
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
   zero RK4 calls in Fast, unsupported profile refusal, quality switch/cache
   isolation, and UI routing for Scene/Compare. Browser pixel parity and
   complete end-to-end FPS have **not** been established.

### Next evaluation and Auto-navigation work

- Compare actual rasterized contours/fills with Accurate under Scene and
  Compare A/B, at varied camera poses, camera FOVs and atmospheres.
- Time end-to-end Canvas renders (including tessellation), assess image artifacts
  from tower thinning, and develop an Auto-preview scheduler for navigation.
  Adaptive object LOD is available in manual Fast Preview, but **not**
  automatic switching between Fast and Accurate during camera motion.
- Keep exact caches, exact horizon/ground events and final offline animation
  rendering completely independent of Preview.


## Auto navigation mode

- **Optical ray field → Auto** is opt-in and not part of experiment JSON/URL.
  At rest it uses Accurate (full towers, independent RK4 caches). For supported
  Scene/Compare atmospheric profiles, pressing and holding camera navigation
  keys, dragging the camera, or using Alt/Shift + wheel produces **Fast**
  projections; the final released/idle camera is recomputed with Accurate.
- The Fast path is limited to at most one pending physical repaint and a
  nominal **120 ms** interval between newly scheduled frames. This is **not** a
  guaranteed FPS: a synchronous Canvas/optical draw still blocks the UI while
  it runs. The first frame of each Auto LOD navigation sequence starts with
  every eighth tower to avoid a dense-scene cold-frame delay; the measured
  budget controller then adapts subsequent images. A manually chosen LOD
  stride is respected. Both Compare sides use a common stride.
- Wheel bursts restore Accurate approximately **220 ms** after the last input.
  A pointer drag restores Accurate on release; a cancelled pointer drag
  restores the original pose. Keyboard movement completes with Accurate on
  key release. The prior CSS-only drag preview is preserved for manual
  Accurate and Fast modes.
- Auto only activates Fast when **all** affected viewports are qualified:
  Vacuum/Standard for either surface, or the qualified Flat engineered
  exponential profiles (including inverse temperature at 100%). Unsupported
  atmospheres **do not** trigger repeated RK4 during keyboard movement; the
  final released pose is rendered Accurate. Manual Fast still reports an
  explicit unsupported-profile error rather than falling back to RK4.
- Preview-only unresolved rays near grazing contact remain approximate
  and may cause missing silhouettes. The `unresolved` count is a number of
  unresolved projected fragments, not a number of failed towers. It tends
  to increase with full geometry; thinning reduces the number of candidate
  fragments and must not change the physics or Accurate result.
- Tests in `tests/ModernCameraNavigation.test.js` exercise Auto's frame
  throttling, scene/Compare quality transitions, wheel settling, pointer
  cancel, LOD restoration and unsupported profiles. Browser visual and
  long-session interaction tests remain necessary before relying on an FPS
  target, especially in high-object-count experiments.
