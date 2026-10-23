'use strict';
const assert = require('assert');
require('./OpticalTowerDiagnostics');
require('./OpticalTowerOverlay');
const overlay = globalThis.CurvatureTowerOverlay;
assert(overlay && typeof overlay.draw === 'function');
const oldDocument = globalThis.document;
let checked = true;
globalThis.document = { getElementById: () => ({checked}) };
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
strokes=0; checked=false; overlay.draw(g,m); assert.equal(strokes,0);
checked=true; m.Height=16; overlay.draw(g,m); assert.equal(strokes,0);
m.Height=15; m.showModel=3; overlay.draw(g,m); assert.equal(strokes,0);
globalThis.document=oldDocument;
console.log('OpticalTowerOverlay: 4 checks passed');
