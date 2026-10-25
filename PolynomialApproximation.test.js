'use strict';
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge');
const solver=require('./OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15};
const stats={polyExact:0,polyCalibration:0,polyDirect:0,polyInterpolated:0,polyRejected:0};
const poly=bridge.createPolynomialApproximation(model,solver,stats);
const arc=180/Math.PI*3600;
let max=0,visible=0,hidden=0;
for(const d of [4500,8000,12000,16000,20000,24000,25500]) {
 let lo=0,hi=40;
 for(let i=0;i<11;i++){const mid=(lo+hi)/2;if(solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:model.rEarth,distance:d,targetHeight:mid,step:25}).status==='visible')hi=mid;else lo=mid;}
 for(const h of [0,5,10,15,20,25,35,45,50,hi-0.5,hi-0.1,hi+0.1,hi+0.5].filter(h=>h>=0)) {
 const exact=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:model.rEarth,distance:d,targetHeight:h,step:25});
 const result=poly.get(d,h);
 assert.strictEqual(result.status==='visible',exact.status==='visible',`visibility mismatch ${d} ${h} ${result.status} ${exact.status}`);
 if(exact.status==='visible') {const err=Math.abs(result.angle-exact.angle)*arc;max=Math.max(max,err);assert(err<0.02,`angle ${d} ${h} ${err}`);visible++;} else hidden++;
 }
}
console.log({visible,hidden,maxArcsec:max,stats});
