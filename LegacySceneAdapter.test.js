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
