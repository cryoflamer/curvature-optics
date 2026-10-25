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
const endMore=audit.beginTower(g,m,0);
g.PolygonOnPlane([-1,1,-1,1],[0,0,1,1],1);
endMore();
const rows=audit.compare(g,m,{geometry:'globe',vacuum:[{index:1,distance:3000,bottom:0,top:0}],
  towerHeight:23,side:0});
assert.equal(rows.length,2);
assert(rows.every(r=>Number.isFinite(r.nearestVertexPx)));
// Object-local axes must be captured from the live object transform, not
// reconstructed from polygon vertices or optical angles.
let strokes=[];
const oldDoc=global.document;
global.document={getElementById(id){return {checked:id==='TowerAuditLocalAxesEnabled'};}};
g.ResetTrans3D=()=>{};g.SetAlpha=()=>{};g.SetClipping=()=>{};g.SetLineAttr=(color)=>{assert.equal(color,'#ffbf00');};
g.Line3D=(a,b)=>strokes.push([a.slice(),b.slice()]);
assert.equal(audit.drawLocalAxes(g,m),1);
assert.deepStrictEqual(strokes[0],[[0,3000,-15],[0,3000,8]]);
const axisRows=audit.compareAxisMethods(g);
assert.equal(axisRows.length,1);
assert.equal(axisRows[0].baseDeltaPx,0);
global.document=oldDoc;
// The second transmission-tower group must not overwrite group 0 indices.
m.ObjType[1]=3;
m.aObjCurr[1]=6400/6371000;
m.ObjDist[1]=6400;
m.ObjDeltaDist[1]=500;
const second=audit.beginTower(g,m,1);
assert.equal(typeof second,'function');
g.PolygonOnPlane([-1,1,-1,1],[0,0,1,1],1);
second();
assert(audit.getLocalAxis(1,0));
assert(audit.getLocalAxis(1,1));
assert.equal(audit.getCapturedGroups().secondary[1].group,1);
assert.equal(audit.getCapturedGroups().primary[1].group,0);
// The actual nine-vertex filled footing is captured independently of the
// steel members, even when legacy rendering is disabled.
let legacyVisible = false;
const previousDoc = global.document;
global.document = {getElementById(id) {
  if (id === 'ShowLegacyTransmissionTowers') return {checked:legacyVisible};
  if (id === 'TowerComparisonMode') return {value:'both'};
  return null;
}};
const beforeHidden = calls;
const endHidden = audit.beginTower(g,m,0);
g.PolygonOnPlane([-1,1],[0,1],1);
g.PolygonOnPlane([-0.145,-0.095,-0.095,0.095,0.095,0.145,0.145,-0.145,-0.145],
  [0,0,0.105,0.105,0,0,0.137,0.137,0],3);
endHidden();
assert.equal(calls,beforeHidden,'hidden legacy geometry must not be painted');
// The secondary transmission-tower group must also obey the checkbox.
const beforeSecondaryHidden = calls;
const endSecondaryHidden = audit.beginTower(g,m,1);
g.PolygonOnPlane([-1,1],[0,1],1);
g.PolygonOnPlane([-0.14,-0.1,-0.1,0.1,0.1,0.14,0.14,-0.14,-0.14],
  [0,0,0.06,0.06,0,0,0.08,0.08,0],3);
endSecondaryHidden();
assert.equal(calls,beforeSecondaryHidden,'hidden secondary tower and foundation must not be painted');

assert.equal(audit.getFoundationPaths(1).length,1);
assert.equal(audit.getTowerPaths(1).length,1);
legacyVisible=true;
const endVisible=audit.beginTower(g,m,0);
g.PolygonOnPlane([-1,1],[0,1],1);
g.PolygonOnPlane([-0.145,-0.095,-0.095,0.095,0.095,0.145,0.145,-0.145,-0.145],
  [0,0,0.105,0.105,0,0,0.137,0.137,0],3);
endVisible();
assert.equal(calls,beforeHidden+2,'legacy checkbox must restore both primitives');
const endSecondaryVisible = audit.beginTower(g,m,1);
g.PolygonOnPlane([-1,1],[0,1],1);
g.PolygonOnPlane([-0.14,-0.1,-0.1,0.1,0.1,0.14,0.14,-0.14,-0.14],
  [0,0,0.06,0.06,0,0,0.08,0.08,0],3);
endSecondaryVisible();
assert.equal(calls,beforeHidden+4,'legacy checkbox must restore both secondary primitives');

global.document=previousDoc;
audit.reset();
assert.equal(audit.getLocalAxis(1,1),null);
console.log('OpticalRenderedVertexAudit: vertex capture and local-axis checks passed');
