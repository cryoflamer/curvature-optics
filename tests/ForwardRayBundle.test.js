'use strict';
const assert=require('assert');
const bridge=require('../src/renderers/CurvatureInverseOpticsBridge');
const tracer=require('../src/optics/OpticalRayTracer');
const solver=require('../src/optics/OpticalTowerDiagnostics');
const m={rEarth:6371000,Height:15};
const stats={bundleTraces:0,bundleExact:0,bundleInterpolated:0};
const start=Date.now();
const bundle=bridge.createForwardBundle(m,tracer,solver,stats,{maxDistance:26000,angleSpacing:0.00010});
let maxArcsec=0, cases=0, mismatches=0;
for(const d of [3000,6000,12000,20000,25000])for(const h of [5,10,20,40]) {
 const exact=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:m.rEarth,distance:d,targetHeight:h,step:25});
 const got=bundle.get(d,h);
 if(got.status!==exact.status) mismatches++;
 if(got.status==='visible'&&exact.status==='visible') {
  const err=Math.abs(got.angle-exact.angle)*180/Math.PI*3600;
  maxArcsec=Math.max(maxArcsec,err);
 }
 cases++;
}
for(const [d,b] of [[20000,1.16],[25000,5.36]]) for(const delta of [-0.5,-0.1,0.1,0.5]) {
 const h=b+delta;
 const exact=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:m.rEarth,distance:d,targetHeight:h,step:25});
 const got=bundle.get(d,h);
 if(got.status!==exact.status) mismatches++;
 if(got.status==='visible'&&exact.status==='visible') maxArcsec=Math.max(maxArcsec,Math.abs(got.angle-exact.angle)*180/Math.PI*3600);
 cases++;
}
console.log({cases,mismatches,maxArcsec,stats,elapsedMs:Date.now()-start});
assert.strictEqual(mismatches,0);
assert(maxArcsec<0.25, 'bundle angle error '+maxArcsec+' arcsec');
assert(stats.bundleInterpolated>0);
