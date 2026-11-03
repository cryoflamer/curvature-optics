# Compatpatch 125 — continuous-curvature optical solver migration

## Scope

The independent `CurvatureSurfaceGeometry` kernel introduced in #124 is now
used by the **physical 2D ray tracer**, the **exact target-point shooting
solver**, and the **shared field's target-point construction**. Both the
traditional `geometry: 'globe'` with finite `radius` and `geometry: 'flat'`
are maintained. A new explicit, authoritative non-negative `curvature` input
is accepted by:

- `CurvatureRayTracer.resolveGeometry({curvature})`,
  `advanceState`, `prepareStepper`, `trace`, and `vacuumTargetVisibility`;
- `CurvatureTargetProjection.solve({curvature,target,...})`;
- `CurvatureSharedRayField.create({curvature,distances,heights,...})`.

The browser now loads `CurvatureSurfaceGeometry.js` **before**
`OpticalRayTracer.js`. Browser globals and CommonJS export the same surface
kernel, so there is no dual geometry implementation between those runtimes.

No UI slider, legacy model replacement, unified grid, or camera change is
implemented in #125. They remain #126–128 tasks. Consequently the existing
application still chooses `Globe` or `FlatEarth`, but **both use the shared
optical surface equations**. The engineered atmospheric comparison radius
(`profileOptions.occlusionRadius`) remains independent of physical curvature.

## Parameter and coordinate contract

- `curvature` is measured in `m^-1` and `curvature=0` means the **exact
  plane**. Do not pass `Infinity` downstream as a radius.
- If no explicit `curvature` is supplied, `geometry:'globe'` derives
  `curvature=1/radius`, and `geometry:'flat'` derives `curvature=0`,
  preserving the legacy caller interface.
- If explicit `curvature` is supplied, its sign determines geometry. An
  omitted `geometry` is inferred; an explicit contradictory `geometry` is
  rejected rather than silently changing the geometry.
- The `radius` argument stays a positive finite legacy compatibility value;
  when curvature is explicit the **physical equations use curvature**, not
  the legacy radius value. For a very small positive curvature, the
  reciprocal may overflow, but tracing and target coordinates still use the
  finite non-negative curvature directly.
- Forward-x, single-branch shooting remains a restricted result. No global
  multipath or occlusion proof is implied.

Example:

```js
const surface = require('../src/geometry/CurvatureSurfaceGeometry');
const rays = require('../src/optics/OpticalRayTracer');
const project = require('../src/optics/OpticalTargetProjection');
const k = 1/(1000*6371000);  // sphere with 1000× Earth's radius
const target = surface.createFromCurvature(k).surfacePoint2(25000,23);
const result = project.solve({curvature:k,target,observerHeight:15,
  atmosphere:'standard',step:250});
const plane = project.solve({curvature:0,target:[25000,23],
  observerHeight:15,atmosphere:'standard',step:250});
```

## One physical surface throughout the optics

`CurvatureRayTracer.resolveGeometry()` creates a surface context once at
tracing/shooting setup. Its `surface.height2()` and `surface.normal2()` are
used for ray/ground altitude, contact slope, crossing and grazing searches.
`surface.metric2(x,z)` computes altitude and unit normal from **one radial
hypot** per RK4 derivative. This prevents duplicate radial work and
replaces `hypot(x,z+R)-R` with the stable curvature kernel. All RK4
coefficients and the state normalization recurrence are unchanged. The
shooting bracket, residual tolerances, guarded predictions, cache ownership
and ground-contact searches from #121–123 are retained.

The pre-existing proof that some RK4 segments cannot touch the ground still
uses the same conservative refractivity bound and margin. Its chord-ground
clearance is computed using curvature-scaled coordinates; no `z+R` is
formed on the stable path. Suspicious/near-tangent steps continue through
the full ground-event detector.

A numerically exact tangent/surface endpoint can now have a signed
sub-nanometre residual where the old cancellation-prone formula happened
 to return zero. The stable detector does not promote a negative residual
smaller than `min(1e-9 m, 0.001*contactTolerance)` to a proved crossing;
it preserves the ordinary contact-tolerance grazing check. The diagnostic
legacy arithmetic path retains the original event sign threshold.

The ground-endpoint classification used a `sqrt(R*error)` envelope in the
former spherical solver. For the exact plane or effectively infinite radius,
that would become unbounded and might incorrectly mark a prior ground hit
visible. #125 instead uses a finite local descending-slope check and keeps
near-tangency uncertainty. This is a **numerical event-classification
safeguard**, not a general multipath visibility oracle.

## Explicit historical comparison mode

To retain the established byte-for-byte scene oracles from #119/#121/#122,
a call may explicitly set `surfaceArithmetic:'legacy'`. Only this opt-in
migration diagnostic uses the previous finite-radius `hypot(x,z+R)-R`,
normal/chord arithmetic and old spherical point construction. The
PhysicalScene adapter passes this opt-in via
`settings:{surfaceArithmetic:'legacy'}` to the shared field. Normal calls
use `surfaceArithmetic:'stable'` by default; the old path is not another
user-visible geometry mode.

The old fixture-based tests deliberately select this diagnostic option.
The default stable path is independently tested for analytic geometry,
physical statuses, and numerical agreement **within tolerance**. New
arithmetic changes floating-point rounding: default scenes are **not**
claimed to be byte-identical to #123 even at R=6371 km.

## Evidence and limitations

`tests/OpticalContinuousCurvature125.test.js` covers:

- exact flat limit with analytic vacuum rays and ground impacts;
- explicit Globe and Flat backward compatibility and invalid combinations;
- monotonic approach to the analytic vacuum plane as `k -> 0`;
- Standard atmospheric bending on the **exact** plane and very small
  positive curvature with unchanged residual criteria;
- tangent/crossing/blocked-vs-visible vacuum geometry;
- shared-field exact targets, cache hits and direct point solver parity;
- custom radius/legacy arithmetic isolation and browser dependency order;
- complete **85+2 tower** reference scenes at 15 m and 15.3 m,
  comparing primitive topology, RK4/shooting counts, ground horizon and
  coordinate deltas between stable and historical arithmetic;
- near-underflow curvatures, ruling out infinite endpoint envelopes.

For the 85+2 Globe/Standard scenes, both arithmetic paths rendered 82,618
primitives at eye height 15 m and 82,595 at 15.3 m, with identical visible,
unresolved and fill counts. Shooting work matched (112,076 RK4 calls for
15 m). The maximum absolute change to one component of a point on the
1,000 m display sphere was approximately 0.0065 m at 15 m and 0.0938 m
at 15.3 m. The optically detected near-grazing ground horizon moved by
about 0.075 m and 1.10 m respectively. These are **measured numerical
differences**, not mathematical equivalence or guaranteed sub-pixel bounds
at every camera setting. The historical SHA-256 oracles were reproduced
exactly when the comparison flag was enabled.

The exact ray solver remains synchronous, uses one forward-x branch and
relies on RK4 integration tolerances. This patch does not change the
physical ground grid's legacy placement, generated world-space source
coordinates, vacuum scene shortcut, or camera. Those pieces are part of
subsequent migration stages and must not be conflated with this solver
integration. Node wall times vary with JIT/GC; browser Height Change
performance must still be measured separately. No browser-interaction
smoke test was completed for this patch.
