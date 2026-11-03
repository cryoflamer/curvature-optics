# Compatpatch 124: continuous-curvature mathematical surface kernel

## Scope and compatibility

`src/geometry/CurvatureSurfaceGeometry.js` is an **independent**, standalone
CommonJS/browser-UMD geometry module. This patch does **not** register the
script in `CurvatureApp.html`, change the model, replace `Globe`/`FlatEarth`,
modify RK4/shooting/visibility, redraw the ground grid, or add a slider.
It is the reference kernel for **future** #125–128 integration, not a claim
that the current physical optics already accepts an infinite radius.

All distances/heights are in **metres**; curvature `k = 1/R` is in **m⁻¹**;
angles are in radians. The local origin is the reference point on the
surface, tangent plane `z=0`, outward normal `+z`. For 3D, the horizontal
axes are local east/north; for 2D there is one signed horizontal axis.
Neither coordinate system is currently tied to the legacy world/camera axes.

`k >= 0`: `k > 0` corresponds to a spherical surface and `k = 0` is the
**exact** planar geometry, not a sphere with an arbitrarily large radius.
`createFromCurvature(0)` is the preferred flat construction; the conversion
`curvatureFromRadius(Infinity)` is provided at the API **boundary** only.
Do not send `Infinity` downstream as a physical radius or put it in JSON.
A separate `flat` boolean is redundant but provided for explicit tests.

### Public API

```js
const geo = require('../src/geometry/CurvatureSurfaceGeometry');
const globe = geo.createFromRadius(6371000);
const plane = geo.createFromCurvature(0);
const twoD = globe.surfacePoint2(10000, 15);       // [x, z]
const threeD = globe.surfacePoint3(8000, 6000, 15); // [east, north, z]
const physicalAltitude = globe.height2(...twoD);
const outwardNormal = globe.normal3(...threeD);
const horizon = globe.geometricHorizon(15);
```

`surfacePoint2(d,h)` interprets `d` as **signed surface arc length**;
`surfacePoint3(east,north,h)` interprets `(east,north)` as **geodesic
coordinates in the tangent plane**, with `hypot(east,north)` equal to ground
arc length and the azimuth set by the pair. They are *not* a pair of
already-embedded Cartesian horizontal coordinates. On a sphere the 3D chart
is not one-to-one at/after the antipode; the intended physical application
uses much shorter distances. At `k=0` geodesic and Cartesian coordinates
coincide.

`height2(x,z)` / `height3(x,y,z)` calculate physical height above the
surface for a **Cartesian** point; `normal2` / `normal3` return its outward
unit radial normal. `surfaceNormal2(d)` / `surfaceNormal3(east,north)`
return normals at surface *locations* instead of Cartesian positions.
At a spherical centre physical altitude is `-R`, but the outward normal is
undefined and raises `RangeError`. The `surfacePoint` APIs reject negative
radius-from-centre (`h <= -R`). Invalid or non-finite input is rejected;
representable floating-point ranges remain finite constraints.

### Numerically stable formulas

With `theta = k*d` and `sinc(t) = sin(t)/t` (`sinc(0) = 1`):

```text
surface x = d*(1+k*h)*sinc(theta)
surface z = h - (1+k*h)*(k*d*d/2)*sinc(theta/2)^2
```

The 3D version applies the same lateral scale `(1+k*h)*sinc(theta)` to
the geodesic east and north coordinates; the vertical formula is identical
with `d = hypot(east,north)`. These are algebraically the spherical
`(R+h)sin(d/R), (R+h)cos(d/R)-R` expressions, but avoid subtracting
nearly equal large radii. A small-argument polynomial for `sinc` ensures
stable behaviour at zero.

For Cartesian point `(x,y,z)`, let

```text
a = 1+k*z
L = hypot(k*x, k*y, a)
normal = (k*x/L, k*y/L, a/L)
altitude = z + k*(x*x+y*y)/(L+a)      when a >= 0
altitude = (2*z+k*(x*x+y*y+z*z))/(L+1) otherwise
```

The `a >= 0` branch avoids `hypot(x,y,z+R)-R`. The rear-hemisphere
fallback covers cases in which the first denominator is zero; the
sphere-centre case is handled explicitly. On the exact plane,
`altitude=z`, `normal=(0,0,1)`, `surfacePoint=(east,north,h)`.

This stable arithmetic **reduces**, not eliminates, floating-point limits.
At an exact impact, round-trip floating-point clearance is not guaranteed
to be exactly zero, particularly far from the reference surface point.
Future ground-event code still needs its physically appropriate tolerances.

### Pure geometric horizon — no atmospheric assumptions

For observer height `H>=0` on a sphere:

```text
t = k*H
dip = atan(sqrt(t)*sqrt(2+t))
arcDistance = dip/k
straightDistance = sqrt(H)*sqrt(1/k)*sqrt(2+t)
```

The latter is the slant distance from observer to a vacuum tangent point,
**not** the projected horizontal range. The formulas avoid
`acos(R/(R+H))` cancellation at very large `R` and avoid computing `2*R`
when that product might overflow. The limit at `k=0` is
`{ exists:false, dipAngle:0, arcDistance:Infinity,
straightDistance:Infinity }`: no **finite geometric** horizon. This says
nothing about an **optical** horizon, atmospheric refraction, ducts, or
multiple ray branches. For positive curvature and `H=0`, the tangent point
is the observer's contact point and the returned distances are zero.

### Verification

`tests/CurvatureSurfaceGeometry124.test.js` compares the new kernel with
independent spherical central-angle equations at ordinary Earth radius;
verifies the analytic spherical tangent condition and slant distance;
checks the gradient of physical altitude against the normal; exercises
hundreds of deterministic 3D round trips across five radii; confirms
convergence to the **exact** planar case; tests the singular centre,
rear hemisphere, invalid inputs, UMD export, and browser API isolation.

Numerical stress example: at `R=10^16 m`, `d=100 m`, `h=0`, the naive
`R*cos(d/R)-R` evaluates to zero in JavaScript; the new `surfacePoint2`
resolves a nonzero sag of approximately `-5e-13 m`. At `R=1e308 m`,
`H=10 m`, the tangent arc and slant distances remain finite even though
`2*R` would overflow. The large-curvature and long-distance cases are
subject to normal IEEE-754 representability limits, which are explicitly
validated when possible.

Existing optical scene tests continue to validate the unchanged #123
rendering code. Integration and image equivalence are **not** claimed
until the future patches independently compare both geometries.

### Suggested next-stage integration boundaries

- **#125:** bind the kernel to `OpticalRayTracer`, `OpticalTargetProjection`,
  ground checks and shared-field geometry under opt-in/compare mode; preserve
  Standard shooting optimizations #121–123 and baseline comparison.
- **#126:** align 3D tower/foundation placement and metric ground guides on
  one curvature-aware surface, not on separate globe/flat branches.
- **#127:** decouple camera from infinite geometric horizon, then add a
  curvature/radius UI control with a literal `k=0` endpoint. Atmosphere and
  comparison-sphere `occlusionRadius` remain separate controls.
- **#128:** scene-level, horizon, numerical-limit and browser performance
  validation before retiring any legacy rendering branch.
