'use strict';
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge');
const solver=require('./OpticalTowerDiagnostics');
const model={rEarth:6371000,Height:15};
const stats={polyExact:0,polyDirect:0,polyOutside:0,polyShortVacuum:0};
const poly=bridge.createPolynomialApproximation(model,solver,stats);
const radToPx=1600;
let maxPx=0,cases=0;
for(const d of [1,25,58,60,65,100,250,499]) {
  for(const h of [0,0.001,1,10,15,25,45,55]) {
    const actual=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:model.rEarth,distance:d,targetHeight:h,step:25});
    const preview=poly.get(d,h);
    assert.strictEqual(actual.status,'visible',`short ray should be visible: ${d},${h}`);
    assert.strictEqual(preview.status,'visible');
    const px=Math.abs(preview.angle-actual.angle)*radToPx;
    assert(px<0.02,`short preview error ${px}px at ${d}m,${h}m`);
    maxPx=Math.max(maxPx,px);cases++;
  }
}
assert.strictEqual(stats.polyShortVacuum,cases);
assert.strictEqual(stats.polyExact,0);
assert.strictEqual(stats.polyOutside,0);
const edge=bridge.adaptiveEdge([0,0,0],[1,0,0],t=>t<0.5?null:[t,0,0],5,0.1);
assert(edge.boundaryProbes>0,'boundary probes must be counted');
console.log('Short-vacuum preview PASS',{cases,maxPx,boundaryProbes:edge.boundaryProbes});
