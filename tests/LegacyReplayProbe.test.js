'use strict';
const assert=require('node:assert/strict');
const adapter=require('../src/legacy/LegacySceneAdapter');
const probe=require('../src/legacy/LegacyReplayProbe');
class JsgPolygon {constructor(is3d){this.X=[];this.Y=[];this.Z=is3d?[]:null;this.Size=0;}}
const poly=new JsgPolygon(false);poly.X=[1,2];poly.Y=[3,4];poly.Size=2;
const trace=adapter.record({PolygonOnPlane() {},LineOnPlane() {}},g=>{
  g.PolygonOnPlane(poly,3);g.LineOnPlane(0,0,1,1);
});
assert.deepEqual(probe.preflight(trace,JsgPolygon).ok,true);
assert.equal(probe.preflight(trace).ok,false);
assert.equal(probe.preflight({...trace,complete:false},JsgPolygon).ok,false);
assert.equal(probe.preflight({...trace,commands:[{method:'unknown',args:[]} ]},JsgPolygon).ok,false);
assert.equal(trace.commands.length,2);
console.log('LegacyReplayProbe: passed');
