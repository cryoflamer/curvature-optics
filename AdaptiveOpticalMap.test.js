'use strict';
const assert=require('assert');
const bridge=require('./CurvatureInverseOpticsBridge');
const solver=require('./OpticalTowerDiagnostics');
const m={rEarth:6371000,Height:15};
const stats={mapExact:0,mapDirect:0,mapCells:0,mapInterpolated:0};
const map=bridge.createOpticalMap(m,solver,stats);
let maximum=0, count=0;
for(const d of [3000,3050,3125,3200,6000,6075,6150,12000,12100,20000,20050,20150,25000,25050]) {
  for(const h of [5,10,11,12,13,14,15,16,17,18,20,30]) {
    const actual=map.get(d,h);
    const reference=solver.solveAngle({geometry:'globe',atmosphere:'standard',observerHeight:15,radius:6371000,distance:d,targetHeight:h,step:25});
    assert.equal(actual.status,reference.status,`visibility ${d}/${h}`);
    if(actual.status==='visible') {
      const error=Math.abs(actual.angle-reference.angle)*180/Math.PI*3600;
      maximum=Math.max(maximum,error);
      assert(error<0.15,`angle ${d}/${h}: ${error} arcsec`);
    }
    count++;
  }
}
assert(stats.mapInterpolated>stats.mapExact,'map should amortize exact shooting on repeated cells');
console.log(`PASS adaptive map: ${count} cases; max ${maximum.toFixed(5)} arcsec; ${stats.mapExact} exact, ${stats.mapInterpolated} interpolated, ${stats.mapDirect} direct`);
