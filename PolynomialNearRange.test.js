'use strict';
// Independent exact-ray checks for the newly covered near-camera interval.
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge');
const solver=require('./OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15};
const stats={polyExact:0,polyCalibration:0,polyDirect:0,polyInterpolated:0,polyRejected:0};
const poly=bridge.createPolynomialApproximation(model,solver,stats);
const arcsec=180*3600/Math.PI;
let cases=0,maxArcsec=0;
for(const d of [500,750,1000,1250,1500,2000,2500,2999]) {
  for(const h of [0,0.001,0.01,0.1,1,5,10,15,20,25,35,45,50,55]) {
    const exact=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:model.rEarth,distance:d,targetHeight:h,step:25});
    const approximate=poly.get(d,h);
    assert.strictEqual(approximate.status==='visible',exact.status==='visible',`visibility d=${d}, h=${h}`);
    if(exact.status==='visible') {
      const error=Math.abs(exact.angle-approximate.angle)*arcsec;
      maxArcsec=Math.max(maxArcsec,error);
      assert(error<0.02,`angle d=${d}, h=${h}: ${error} arcsec`);
    }
    cases++;
  }
}
assert.strictEqual(stats.polyOutside,0,'new near interval must use approximation');
console.log('Polynomial near-range PASS',{cases,maxArcsec,calibration:stats.polyCalibration});
