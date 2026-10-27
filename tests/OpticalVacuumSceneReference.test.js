'use strict';
const assert = require('assert');
require('../src/optics/OpticalTowerOverlay');
const overlay = globalThis.CurvatureTowerOverlay;
const savedDoc = globalThis.document;
const savedAudit = globalThis.CurvatureRenderedVertexAudit;
let lines = [];
const axes = {
  1: {base: [12, 3000, -15], top: [12, 3000, 8]},
  2: {base: [13, 6000, -15], top: [13, 6000, 8]}
};
globalThis.CurvatureRenderedVertexAudit = {getLocalAxis: id => axes[id] || null};
globalThis.document = {getElementById(id) {
  return {checked: id === 'TowerOverlayEnabled' || id === 'TowerOverlayVacuumOnly'};
}};
const g = {ResetTrans3D(){},SetAlpha(){},SetClipping(){},SetLineAttr(){},
  Line3D(a,b){lines.push([a.slice(),b.slice()]);}};
const m = {opticsMode:'ray-tracing',showModel:1,ObjType:[3],NObjects:[2],
  Height:15,rEarth:6371000,ObjDist:[3000],ObjDeltaDist:[3000],ObjSize:[23],ObjSidePos:[32]};
try {
  overlay.setData({geometry:'globe',height:15,radius:6371000,
    firstDistance:3000,spacing:3000,count:2,towerHeight:23,side:32,
    vacuum:[{index:1,distance:3000,bottom:null,top:null},
      {index:2,distance:6000,bottom:-0.1,top:0.1}],standard:[]});
  overlay.draw(g,m);
  assert.strictEqual(lines.length,8);
  for (let i=0;i<4;i++) {
    const axis = axes[i<2?1:2];
    const expected = i%2===0?axis.base:axis.top;
    const horizontalMidpoint = lines[i*2][0].map((v,j)=>(v+lines[i*2][1][j])/2);
    expected.forEach((v,j)=>assert(Math.abs(v-horizontalMidpoint[j])<1e-9));
  }
  lines=[];
  delete axes[2];
  overlay.draw(g,m);
  assert.strictEqual(lines.length,4,'missing real geometry must not be guessed');
  console.log('OpticalVacuumSceneReference: 5 checks passed');
} finally {
  overlay.clear();
  globalThis.document=savedDoc;
  globalThis.CurvatureRenderedVertexAudit=savedAudit;
}
