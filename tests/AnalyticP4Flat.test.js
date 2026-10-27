'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge');
const solver=require('../src/optics/OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15,showModel:2};
const p4=bridge.createAnalyticP4(model,{});
const vacuum=bridge.createAnalyticP4(model,{}, {refractivity:0});
let cases=0, maxError=0;
for(const d of [100,1000,5000,10000,26000]) {
  for(const h of [0,5,15,40,60]) {
    const a=p4.get(d,h);
    const exact=solver.solveAngle({geometry:'flat',atmosphere:'standard',
      observerHeight:model.Height,radius:model.rEarth,distance:d,targetHeight:h,step:25});
    assert.strictEqual(a.status,exact.status,`visibility d=${d} h=${h}`);
    if(a.status==='visible') {
      const error=Math.abs(a.angle-exact.angle);
      maxError=Math.max(maxError,error);
      assert(error<1e-6,`flat P4 angle d=${d} h=${h}: ${error}`);
    }
    const v=vacuum.get(d,h);
    assert.strictEqual(v.status,'visible',`flat vacuum visibility d=${d} h=${h}`);
    assert(Math.abs(v.angle-Math.atan2(h-model.Height,d))<1e-10,
      `flat vacuum perspective d=${d} h=${h}`);
    cases++;
  }
}
assert.strictEqual(bridge.p4Horizon(model,p4),null,'flat plane has no spherical tangent disk');
console.log('Flat P4 comparison PASS',{cases,maxAngleMicroRad:maxError*1e6});
