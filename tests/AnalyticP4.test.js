'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge');
const solver=require('../src/optics/OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15};
const stats={};
const p4=bridge.createAnalyticP4(model,stats);
let cases=0,visible=0,occluded=0,maxAngle=0,mismatches=[];
for(const d of [100,500,1000,5000,10000,15000,20000,26000]) {
  for(const h of [0,5,10,15,25,40,60,100]) {
    const a=p4.get(d,h);
    const b=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:6371000,distance:d,targetHeight:h,step:25});
    cases++;
    if((a.status==='visible')!==(b.status==='visible')) mismatches.push({d,h,a:a.status,b:b.status});
    if(a.status==='visible' && b.status==='visible'){
      visible++;maxAngle=Math.max(maxAngle,Math.abs(a.angle-b.angle));
      assert(Math.abs(a.angle-b.angle)<1e-6,`angle mismatch ${d} ${h}`);
    } else occluded++;
  }
}
assert.deepStrictEqual(mismatches,[]);
assert.strictEqual(stats.p4Evaluations,cases);
console.log('Analytic P4 comparison PASS',{cases,visible,occluded,maxAngleMicroRad:maxAngle*1e6});
