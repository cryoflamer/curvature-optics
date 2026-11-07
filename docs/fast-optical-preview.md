# Fast optical preview — mathematical field and experimental Modern renderer

`src/optics/OpticalFastRayField.js` is a cheap ray-field alternative to the
Accurate RK4 implementation. **Modern Scene/Compare now offer an explicit
Display → Optical ray field → Fast Preview** manual choice. The same physical
scene composer, camera, painter, foundation polygons and Canvas remain in use.
The default is **Accurate · RK4**, and camera interactions do **not** yet
switch to Fast automatically (Auto navigation is future work). Legacy is untouched.

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

## Manual Modern integration and known limits

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
5. `tests/ModernFastPreview.test.js` covers real geometric fills/outlines,
   zero RK4 calls in Fast, unsupported profile refusal, quality switch/cache
   isolation, and UI routing for Scene/Compare. Browser pixel parity and
   complete end-to-end FPS have **not** been established.

### Next evaluation and Auto-navigation work

- Compare actual rasterized contours/fills with Accurate under Scene and
  Compare A/B, at varied camera poses, camera FOVs and atmospheres.
- Time end-to-end Canvas renders (including tessellation), then decide whether
  lower contour LOD and an Auto-preview scheduler are justified.
- Keep exact caches, exact horizon/ground events and final offline animation
  rendering completely independent of Preview.
