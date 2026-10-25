'use strict';
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge');
const solver=require('./OpticalTowerDiagnostics');
const stats={polyExact:0,polyCalibration:0,polyDirect:0,polyInterpolated:0,polyRejected:0};
const poly=bridge.createPolynomialApproximation({rEarth:6371000,Height:15},solver,stats);
// Out-of-range fallback must be accounted separately from the horizon guard.
assert.strictEqual(poly.get(1000,20).status,'visible');
assert.strictEqual(stats.polyOutside,1);
assert.strictEqual(stats.polyDirect,1);
assert(stats.polyExactMs>=0 && Number.isFinite(stats.polyExactMs));
// Trigger calibration, interpolation and a horizon-guard fallback.
assert.strictEqual(poly.get(20000,25).status,'visible');
assert(stats.polyCalibration>0);
assert(stats.polyCalibrationMs>=0 && Number.isFinite(stats.polyCalibrationMs));
assert(stats.polyInterpolated>0);
const boundary=1.0;// search guard around the calibrated boundary
for(let h=0;h<3;h+=0.02) poly.get(20000,h);
assert(stats.polyHorizon>=1);
assert.strictEqual(stats.polyDirect,stats.polyOutside+stats.polyHorizon+stats.polyInvalid);
assert(stats.polyExact>=stats.polyDirect);
assert(stats.polyExact>=stats.polyCalibration);
console.log('Polynomial profiling counters PASS',stats);
