'use strict';
const assert = require('node:assert/strict');
const adapter = require('./LegacySceneAdapter');
function graph() {
  const log=[];
  const proto={
    SetAreaAttr(...a){log.push(['area',...a]);return this;},
    PolygonOnPlane(x,y,mode){log.push(['polygon',x.slice(),y.slice(),mode]);return this;},
    LineOnPlane(...a){log.push(['line',...a]);return this;},
    SetTrans3D(...a){log.push(['trans',...a]);return this;},
    DrawPoly3D(mode){log.push(['poly3d',mode]);return this;},
    VectList3D(points,mode){this.DrawPoly3D(mode);log.push(['vect',points.map(x=>x.slice()),mode]);return this;}
  };
  return Object.assign(Object.create(proto),{log});
}
const original=graph(), xs=[0,1,1], ys=[0,0,1];
const trace=adapter.record(original,g=>{
  g.SetTrans3D(1,2,3);
  g.SetAreaAttr('#a38d60','#a38d60',1);
  g.PolygonOnPlane(xs,ys,3);
  g.LineOnPlane(0,0,1,1);
  g.VectList3D([[0,0,0],[1,1,1]],1);
});
assert.equal(trace.kind,'legacy-graph-commands');
assert.deepEqual(trace.commands.map(c=>c.method),['SetTrans3D','SetAreaAttr','PolygonOnPlane','LineOnPlane','VectList3D']);
assert.equal(Object.hasOwn(original,'PolygonOnPlane'),false);
xs[0]=100;ys[0]=200;
const copy=graph();adapter.replay(copy,trace);
assert.deepEqual(copy.log,original.log);
assert.deepEqual(trace.commands[2].args[0],[0,1,1]);
const failure=graph();
assert.throws(()=>adapter.record(failure,g=>{g.LineOnPlane(0,0,1,1);throw Error('draw failed');}),/draw failed/);
assert.equal(Object.hasOwn(failure,'LineOnPlane'),false);
assert.throws(()=>adapter.replay(graph(),{version:1,kind:'legacy-graph-commands',commands:[{method:'evil',args:[]}]}),/Unsupported/);
console.log('LegacySceneAdapter: passed');

// Diagnostic capture preserves rendering when arguments cannot be serialized.
const nonPlain = new Date();
const diagnosticGraph = {LineOnPlane(arg){this.last = arg;}};
const diagnostic = adapter.record(diagnosticGraph, g=>g.LineOnPlane(nonPlain), {diagnostic:true});
assert.equal(diagnostic.complete,false);
assert.equal(diagnostic.unsupported[0].method,'LineOnPlane');
assert.match(diagnostic.unsupported[0].message,/args\[0\].*Date/);
assert.equal(diagnosticGraph.last,nonPlain);
assert.throws(()=>adapter.record(diagnosticGraph,g=>g.LineOnPlane(nonPlain)),/LineOnPlane.*args\[0\].*Date/);

// Snapshot a real-shaped JsgPolygon, including its prototype and active Size.
class JsgPolygon {
  constructor(is3d) { this.X=[];this.Y=[];this.Z=is3d?[]:null;this.Size=0; }
}
const poly = new JsgPolygon(false);
poly.X=[1,2,999];poly.Y=[3,4,999];poly.Size=2;
const polyGraph = {PolygonOnPlane(p,mode){this.seen=[p,mode];}};
const polyTrace = adapter.record(polyGraph,g=>g.PolygonOnPlane(poly,3));
assert.equal(polyTrace.complete,true);
assert.deepEqual(polyTrace.commands[0].args[0],{
  __legacyGraphType:'JsgPolygon',Size:2,X:[1,2],Y:[3,4],Z:null
});
poly.X[0]=100;
const replayGraph={PolygonOnPlane(p,mode){this.seen=[p,mode];}};
const jsonTrace=JSON.parse(JSON.stringify(polyTrace));
adapter.replay(replayGraph,jsonTrace,{JsgPolygon});
assert.ok(replayGraph.seen[0] instanceof JsgPolygon);
assert.deepEqual(replayGraph.seen[0].X,[1,2]);
assert.equal(replayGraph.seen[0].Size,2);
assert.equal(replayGraph.seen[1],3);
assert.throws(()=>adapter.replay(replayGraph,jsonTrace),/constructor required/);
const poly3 = new JsgPolygon(true);
poly3.X=[1];poly3.Y=[2];poly3.Z=[3];poly3.Size=1;
const t3=adapter.record(polyGraph,g=>g.PolygonOnPlane(poly3,4));
adapter.replay(replayGraph,t3,{JsgPolygon});
assert.deepEqual(replayGraph.seen[0].Z,[3]);
assert.equal(replayGraph.seen[0].Z.length,1);

// The camera, alpha and text rotation are stateful operations, not cosmetic
// calls: the trace must preserve their exact order and argument snapshots.
const cameraLog=[];
function cameraGraph(){return {
  SetCamera(params){cameraLog.push(['camera',JSON.parse(JSON.stringify(params))]);},
  SetCameraZoom(value){cameraLog.push(['zoom',value]);},
  SetCameraClipping(value){cameraLog.push(['clip',value]);},
  SetWindowToCameraScreen(){cameraLog.push(['window']);},
  SetAlpha(value){cameraLog.push(['alpha',value]);},
  SetTextRotation(value){cameraLog.push(['rotation',value]);}
};}
const params={CamPos:[1,2,3],CamUp:[0,0,1],SceneSize:12};
const stateTrace=adapter.record(cameraGraph(),g=>{
  g.SetCameraClipping(0.001);g.SetWindowToCameraScreen();
  g.SetCamera(params);g.SetCameraZoom(1);g.SetAlpha(0.3);g.SetTextRotation(0.5);
});
const originalCameraLog=cameraLog.splice(0);
params.CamPos[0]=99;
assert.deepEqual(stateTrace.commands.map(c=>c.method),[
  'SetCameraClipping','SetWindowToCameraScreen','SetCamera',
  'SetCameraZoom','SetAlpha','SetTextRotation'
]);
assert.equal(stateTrace.commands[2].args[0].CamPos[0],1);
adapter.replay(cameraGraph(),JSON.parse(JSON.stringify(stateTrace)));
assert.deepEqual(cameraLog,originalCameraLog);
