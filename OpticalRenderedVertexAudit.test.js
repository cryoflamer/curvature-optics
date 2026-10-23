'use strict';
const assert = require('assert');
const audit = require('./OpticalRenderedVertexAudit');
const overlay = require('./OpticalTowerOverlay');
const m = {ObjType:[3],showModel:1,opticsMode:'ray-tracing',aObjCurr:[3000/6371000],
  geometryRadius:6371000,ObjDist:[3000],ObjDeltaDist:[300],Height:15,rEarth:6371000};
let calls=0;
const g={PolygonOnPlane(xs,ys){calls++;return 'original';},
  GetTransPointOnPlane(x,y){return [x,3000,y*23-15];},
  Camera:{Trans(p){return p.slice();}},WinTrans:{TransX(x){return x;},TransY(y){return y;}}};
const original=g.PolygonOnPlane;
const end=audit.beginTower(g,m,0);
assert.equal(typeof end,'function');
assert.equal(g.PolygonOnPlane([0,1],[0,1],1),'original');
end();
assert.strictEqual(g.PolygonOnPlane,original);
assert.equal(calls,1);
const rows=audit.compare(g,m,{geometry:'globe',vacuum:[{index:1,distance:3000,bottom:0,top:0}],
  towerHeight:23,side:0});
assert.equal(rows.length,2);
assert(rows.every(r=>Number.isFinite(r.nearestVertexPx)));
audit.reset();
console.log('OpticalRenderedVertexAudit: 6 checks passed');
