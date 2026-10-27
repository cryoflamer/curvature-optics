'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge');
const solver=require('../src/optics/OpticalTowerDiagnostics');
const m={rEarth:6371000,Height:15};
let max=0, approximated=0, fallback=0;
for(const d of [3000,6000,12000,20000,25000]) for(const h of [10,20,40]) {
  const stats={fastFallbacks:0,fastRejected:0,fastApproximated:0};
  const exact=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:6371000,distance:d,targetHeight:h,step:25});
  const fast=bridge.fastRay({distance:d,altitude:h},m,solver,stats);
  assert.equal(fast.status,exact.status,`${d}m ${h}m`);
  if(exact.status==='visible') {
    const error=Math.abs(fast.angle-exact.angle)*180/Math.PI*3600;
    max=Math.max(max,error);
    assert(error<0.5,`Fast preview error ${error} arcsec at ${d}m ${h}m`);
  }
  approximated+=stats.fastApproximated;
  fallback+=stats.fastFallbacks;
}
assert(approximated>0);
// Boundary ambiguity must go to exact shooting, not an approximation.
const near={fastFallbacks:0,fastRejected:0,fastApproximated:0};
bridge.fastRay({distance:20000,altitude:1.2},m,solver,near);
assert.equal(near.fastFallbacks,1);
console.log(`PASS fast preview: ${approximated} approximated, ${fallback} fallback; max error ${max.toFixed(3)} arcsec`);
