'use strict';
const assert = require('assert');
require('./OpticalTowerOverlay');
const overlay = globalThis.CurvatureTowerOverlay;
const saved = globalThis.document;
globalThis.document = {getElementById(id) {return {checked: id !== 'none'};}};
let calls = 0;
const g = {
  ResetTrans3D(){},SetAlpha(){},SetClipping(){},SetLineAttr(){},
  CurrTrans:{ObjTransXY(obj,x,y){this.x=x*2+10;this.y=y*3-5;}},
  GetObjTrans(){return {};},
  DriverDrawPoly(xs,ys,n){calls++;return n;},
  Line3D(a,b){this.DriverDrawPoly([a[0],b[0]],[a[2],b[2]],2,false,false);}
};
try {
  const m={opticsMode:'ray-tracing',showModel:1,ObjType:[3],NObjects:[1],Height:15,
    rEarth:6371000,ObjDist:[3000],ObjDeltaDist:[300],ObjSize:[23],ObjSidePos:[10]};
  const angle=Math.atan2(8,3000);
  overlay.setData({geometry:'globe',height:15,radius:m.rEarth,firstDistance:3000,
    spacing:300,count:1,towerHeight:23,side:10,
    vacuum:[{index:1,distance:3000,bottom:null,top:angle}],standard:[]});
  const original=g.DriverDrawPoly;
  overlay.draw(g,m);
  assert.strictEqual(g.DriverDrawPoly,original,'2D driver must be restored');
  assert.strictEqual(calls,2);
  const entries=overlay.getRenderedStrokes();
  assert.strictEqual(entries.length,1);
  assert.strictEqual(entries[0].strokes.length,2);
  const midpoint=entries[0].strokes[0].reduce((v,p)=>v+p[0],0)/2;
  const world=overlay.markerWorld('globe',3000,23,angle,m.rEarth,10,15);
  assert(Math.abs(midpoint-(world[0]*2+10))<1e-8);
  console.log('OpticalCanvasStrokeAudit: 5 checks passed');
} finally {overlay.clear();globalThis.document=saved;}
