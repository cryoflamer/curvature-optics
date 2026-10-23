'use strict';
const assert = require('assert');
const d = require('./OpticalTowerDiagnostics');
const R = 6371000;
const opts = { observerHeight: 15, distance: 20000, targetHeight: 23, radius: R, step: 25 };
function angle(geometry, atmosphere) { return d.apparentAngle(Object.assign({}, opts, { geometry, atmosphere })); }
const flatVac = angle('flat','vacuum');
const flatStd = angle('flat','standard');
const globeVac = angle('globe','vacuum');
const globeStd = angle('globe','standard');
assert(Math.abs(flatVac - Math.atan2(23-15, 20000)) < 1e-7, 'Flat vacuum must agree with analytic angle');
const target = d.target('globe', opts.distance, opts.targetHeight, R);
assert(Math.abs(globeVac - Math.atan2(target.z-opts.observerHeight, target.x)) < 1e-7, 'Globe vacuum must agree with analytic angle');
assert(flatStd > flatVac && globeStd > globeVac, 'Normal refraction increases apparent elevation');
assert(globeVac < flatVac, 'Globe geometry depresses distant towers');
assert.strictEqual(d.apparentAngle({geometry:'globe', atmosphere:'vacuum', observerHeight:2, distance:30000, targetHeight:0, step:25}), null, 'Ground-occluded target must not have direct ray');
console.log('OpticalTowerDiagnostics: 5 tests passed');
// Regression: the first ground target requires a ray steeper than -0.25 rad.
for (const atmosphere of ['vacuum', 'standard']) {
  const near = d.solveAngle({geometry:'globe', atmosphere, observerHeight:15,
    distance:50, targetHeight:0, step:25});
  assert.strictEqual(near.status, 'visible', 'Near ground target must be visible');
  assert(near.angle < -0.25, 'Near target needs an unrestricted steep angle');
  const middle = d.solveAngle({geometry:'globe', atmosphere, observerHeight:15,
    distance:3000, targetHeight:0, step:25});
  assert.strictEqual(middle.status, 'visible', '3 km ground target must be visible');
}
const blocked = d.solveAngle({geometry:'globe', atmosphere:'vacuum', observerHeight:2,
  distance:30000, targetHeight:0, step:25});
assert.strictEqual(blocked.status, 'occluded', 'Blocked target should not be called no solution');
console.log('OpticalTowerDiagnostics: 5 additional regression checks passed');
