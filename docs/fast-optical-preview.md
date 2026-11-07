# Fast optical ray field — standalone research boundary

The opt-in `src/optics/OpticalFastRayField.js` is a **mathematical candidate** for
Modern interactive camera preview. It is not wired into Scene, Compare, Canvas,
Modern navigation, or the production `OpticalSharedRayField`. This patch makes
**no changes** to the Accurate renderer or to the existing Legacy renderer.

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
- There is deliberately no `exact()` method, no hidden RK4 call, no cross-frame
  result cache, and no substitution into production `sample()`.
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

### Required work before enabling in Modern

1. Integrate the preview as an **explicitly selected** optical field in the
   existing physical scene adapter; do not duplicate object geometry or
   move Legacy renderer code into Modern.
2. Add a conservative, testable policy for how `indeterminate` and
   `unsupported` samples affect polygons, foundations and horizon rendering.
3. Compare actual rasterized contours/fills with Accurate under Scene and
   Compare A/B at varied camera poses and atmospheric configurations.
4. Time end-to-end Canvas renders (including tessellation) and then decide
   whether lower contour LOD and an Auto-preview scheduler are justified.
5. Keep accurate caches, ground events and final offline animation rendering
   independent of the unverified preview.
