'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge');
const solver=require('../src/optics/OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15};
const params=(d,h)=>({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:model.rEarth,distance:d,targetHeight:h,step:25});
const stats=()=>({polyExact:0,polyCalibration:0,polyDirect:0,polyInterpolated:0,polyRejected:0});
const first=stats(),poly=bridge.createPolynomialApproximation(model,solver,first);
const arcsec=180*3600/Math.PI;
let cases=0,maxAngle=0;
for(const d of [3000,4500,8000,10000,12000,15000,18000,20000,22000,24000,26000]) {
  let lo=0,hi=30;
  if(solver.solveAngle(params(d,0)).status==='visible') hi=0;
  else for(let i=0;i<19;i++) {const mid=(lo+hi)/2;if(solver.solveAngle(params(d,mid)).status==='visible')hi=mid;else lo=mid;}
  for(const offset of [-0.1,-0.01,-0.005,-0.001,0.001,0.005,0.01,0.1]) {
    const h=hi+offset;
    if(h<0)continue;
    const expected=solver.solveAngle(params(d,h));
    const actual=poly.get(d,h);
    assert.strictEqual(actual.status==='visible',expected.status==='visible',`visibility d=${d} h=${h} boundary=${hi}`);
    if(expected.status==='visible') {const error=Math.abs(actual.angle-expected.angle)*arcsec;maxAngle=Math.max(maxAngle,error);assert(error<0.02,`angle ${d} ${h} ${error}`);}
    cases++;
  }
}
const second=stats();
const reused=bridge.createPolynomialApproximation(model,solver,second);
assert.strictEqual(reused.get(20000,20).status,'visible');
assert.strictEqual(second.polyCalibration,0,'identical model must reuse calibration');
assert.strictEqual(second.polyExact,0,'reused model should interpolate without shooting');
const changed=stats();
bridge.createPolynomialApproximation({rEarth:6371000,Height:16},solver,changed).get(20000,20);
assert(changed.polyCalibration>0,'changed observer height must recalibrate');
console.log('Polynomial guard regression PASS',{cases,maxAngleArcsec:maxAngle,first,second,changedCalibration:changed.polyCalibration});
