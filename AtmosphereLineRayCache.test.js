'use strict';
const assert = require('assert');
const bridge = require('./CurvatureInverseOpticsBridge.js');
const m={rEarth:6371000,Height:15,ObjDist:[1000],ObjDeltaDist:[100],ObjSize:[1],ObjSidePos:[0],NObjects:[3]};
// Mirrored members have the same radial altitude and central distance, but
// must retain their individual azimuth and original x/y in the result.
const a=[30,1000,10],b=[30,1000,20];
const c=[-30,1000,10],d=[-30,1000,20];
const audit={getCapturedGroups:()=>({primary:{0:{},1:{}}}),
  getTowerPaths:i=>i===0?[[a,b]]:i===1?[[c,d]]:null};
let calls=0;
const solver={solveAngle:params=>{
  calls++;
  return {status:'visible',angle:0.01+params.targetHeight*1e-7};
}};
let done=false;
bridge.calculateAtmosphereLine(m,audit,solver,()=>{},r=>{
  assert.equal(r.state,'ready');
  assert.equal(r.edges,2);
  assert.equal(r.evaluations,6); // endpoints + midpoint, for each edge
  assert.equal(r.raySolves,3);
  assert.equal(r.rayHits,3);
  assert.equal(calls,r.raySolves);
  assert.equal(r.paths.length,2);
  for(let j=0;j<r.paths[0].points.length;j++){
    const p=r.paths[0].points[j],q=r.paths[1].points[j];
    assert.deepStrictEqual(q,[-p[0],p[1],p[2]]);
  }
  done=true;
});
setTimeout(()=>{assert(done,'async test did not finish');console.log('PASS radial ray cache');},100);
