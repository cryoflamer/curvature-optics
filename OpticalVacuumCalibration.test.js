'use strict';
const assert = require('assert');
const audit = require('./OpticalRenderedVertexAudit');
const original = audit.compareCanvasStrokes;
// Exercise real polygon capture and canvas-stroke comparison, not a mocked result.
const g = {
  Camera:{Trans:p=>p},WinTrans:{TransX:x=>x,TransY:y=>y},
  CanvasWidth:200,CanvasHeight:100,
  GetTransPointOnPlane:(x,y)=>[x,y,0],
  PolygonOnPlane(){},
};
const m = {ObjType:[3],showModel:1,opticsMode:'ray-tracing',aObjCurr:[1],
  geometryRadius:100,ObjDist:[100],ObjDeltaDist:[100]};
const end = audit.beginTower(g,m,0);
assert(end);
g.PolygonOnPlane([-1,1,-1,1],[0,0,1,1],0,4);
end();
const snapshot={geometry:'globe',vacuum:[{index:1,bottom:0,top:0}]};
let result=audit.vacuumCalibration(g,m,snapshot,[
  {tower:1,point:'base',atmosphere:'vacuum',strokes:[[[ -1,0],[1,0]],[[0,-1],[0,1]]]},
  {tower:1,point:'top',atmosphere:'vacuum',strokes:[[[ -1,1],[1,1]],[[0,0],[0,2]]]}
]);
assert.strictEqual(result.summary.result,'PASS');
assert.strictEqual(result.summary.passed,2);
assert.strictEqual(result.summary.failed,0);
assert.strictEqual(result.summary.geometryMismatch,0);
assert.strictEqual(result.summary.offscreen,0);
result=audit.vacuumCalibration(g,m,snapshot,[
  {tower:1,point:'base',atmosphere:'vacuum',strokes:[[[0,1],[2,1]]]},
]);
assert.strictEqual(result.summary.failed,2); // offset + missing marker
assert.strictEqual(result.summary.result,'FAIL');
assert.strictEqual(result.summary.geometryMismatch,0);
result=audit.vacuumCalibration(g,m,{geometry:'globe',vacuum:[{index:1,bottom:null,top:0}]},[]);
assert.strictEqual(result.summary.skippedOccluded,0);
assert.strictEqual(result.summary.failed,2);
// Offscreen references are classified separately, not treated as pixel failures.
g.CanvasHeight=0.5;
result=audit.vacuumCalibration(g,m,snapshot,[
  {tower:1,point:'base',atmosphere:'vacuum',strokes:[[[ -1,0],[1,0]]]},
  {tower:1,point:'top',atmosphere:'vacuum',strokes:[[[ 2,1],[4,1]]]}
]);
assert.strictEqual(result.summary.offscreen,1);
assert.strictEqual(result.summary.offscreenMismatch,0);
assert.strictEqual(result.summary.failed,0);
assert.strictEqual(result.summary.result,'PASS');
audit.reset();
console.log('OpticalVacuumCalibration: PASS (aligned, offset, missing, occluded)');
