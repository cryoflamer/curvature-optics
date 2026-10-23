'use strict';
// Regression: the live overlay must draw crosses at precisely the same
// world-space positions that the rendered-vertex audit inspects.
const assert = require('assert');
require('./OpticalTowerOverlay');
const overlay = globalThis.CurvatureTowerOverlay;
const originalDocument = globalThis.document;
let lines = [];
globalThis.document = {getElementById(id) {
  return {checked: id === 'TowerOverlayEnabled' || id === 'TowerOverlayVacuumOnly'};
}};
const g = {
  ResetTrans3D(){}, SetAlpha(){}, SetClipping(){}, SetLineAttr(){},
  Line3D(a,b){lines.push([a,b]);}
};
try {
  for (const geometry of ['globe','flat']) {
    const m = {opticsMode:'ray-tracing',showModel:geometry==='globe'?1:2,
      ObjType:[3],NObjects:[1],Height:15,rEarth:6371000,
      ObjDist:[3000],ObjDeltaDist:[300],ObjSize:[23],ObjSidePos:[10]};
    const anchor = overlay.towerAnchor(geometry,3000,23,m.rEarth,10,15);
    const topAngle = Math.atan2(anchor[2],Math.hypot(anchor[0],anchor[1]));
    const data = {geometry,height:15,radius:m.rEarth,firstDistance:3000,
      spacing:300,count:1,towerHeight:23,side:10,
      vacuum:[{distance:3000,bottom:null,top:topAngle}],standard:[]};
    overlay.setData(data);
    lines = [];
    overlay.draw(g,m);
    assert.strictEqual(lines.length,2,geometry+' must draw one cross');
    const midpoint = lines[0][0].map((v,i)=>(v+lines[0][1][i])/2);
    const expected = overlay.markerWorld(geometry,3000,23,topAngle,m.rEarth,10,15);
    expected.forEach((v,i)=>assert(Math.abs(v-midpoint[i])<1e-9,geometry+' component '+i));
    assert(Math.abs(expected[2]-anchor[2])<1e-9,'vacuum ray must reproduce anchor');
  }
  assert.strictEqual(overlay.markerWorld('globe',3000,23,null,6371000,0,15),null);
  console.log('OpticalTowerMarkerConsistency: 7 checks passed');
} finally {
  overlay.clear();
  globalThis.document = originalDocument;
}
