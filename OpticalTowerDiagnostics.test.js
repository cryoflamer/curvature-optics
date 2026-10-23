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
