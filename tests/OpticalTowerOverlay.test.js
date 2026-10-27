'use strict';
const assert = require('assert');
require('../src/optics/OpticalTowerDiagnostics');
require('../src/optics/OpticalTowerOverlay');
const overlay = globalThis.CurvatureTowerOverlay;
assert(overlay && typeof overlay.draw === 'function');
const oldDocument = globalThis.document;
let checked = true, vacuumOnly = false;
globalThis.document = { getElementById: (id) => ({checked: id === 'TowerOverlayVacuumOnly' ? vacuumOnly : checked}) };
let strokes = 0;
const g = { ResetTrans3D(){}, SetAlpha(){}, SetClipping(){}, SetLineAttr(){}, Line3D(){strokes++;} };
const m = {opticsMode:'ray-tracing', showModel:1, ObjType:[3], NObjects:[1], Height:15,
 rEarth:6371000, ObjDist:[3000], ObjDeltaDist:[300], ObjSize:[23], ObjSidePos:[0]};
const data = {geometry:'globe', height:15, radius:6371000, firstDistance:3000, spacing:300,
 count:1, towerHeight:23, side:0,
 vacuum:[{distance:3000,bottom:-0.01,top:0.001}],
 standard:[{distance:3000,bottom:-0.009,top:0.002}]};
overlay.setData(data);
overlay.draw(g,m);
assert.equal(strokes,8);
strokes=0; vacuumOnly=true; overlay.draw(g,m); assert.equal(strokes,4);
vacuumOnly=false;
strokes=0; checked=false; overlay.draw(g,m); assert.equal(strokes,0);
checked=true; m.Height=16; overlay.draw(g,m); assert.equal(strokes,0);
m.Height=15; m.showModel=3; overlay.draw(g,m); assert.equal(strokes,0);
const anchor = overlay.towerAnchor('globe', 3000, 23, 6371000, 0, 15);
const angle = Math.atan2(anchor[2], Math.hypot(anchor[0],anchor[1]));
assert(Math.abs(Math.hypot(anchor[0],anchor[1]) * Math.tan(angle) - anchor[2]) < 1e-9);
const flat = overlay.towerAnchor('flat', 3000, 23, 6371000, 10, 15);
assert.deepEqual(flat, [-10,3000,8]);
globalThis.document=oldDocument;
console.log('OpticalTowerOverlay: 7 checks passed');
