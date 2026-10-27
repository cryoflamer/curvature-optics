'use strict';
const assert = require('assert');
require('../src/optics/OpticalTowerOverlay');
require('../src/optics/OpticalProjectionCalibration');
const calibration = globalThis.CurvatureProjectionCalibration;
const overlay = globalThis.CurvatureTowerOverlay;
assert(calibration && typeof calibration.run === 'function');
const m = { opticsMode:'ray-tracing', showModel:1, ObjType:[3], NObjects:[1],
  Height:15, geometryRadius:6371000, rEarth:6371000,
  ObjDist:[3000], ObjDeltaDist:[300], ObjSize:[23], ObjSidePos:[0] };
let transformed = null;
const g = {
  Trans3D: null,
  SetTrans3D(x) {this.Trans3D=x;},
  GetTransPoint3D(x,y,z) {return overlay.towerAnchor('globe',3000,z*23,6371000,0,15);},
  Camera: {Trans(p) {return p.slice();}},
  WinTrans: {TransX(x) {return x;}, TransY(y) {return y;}}
};
const oldConsole = globalThis.console;
try {
  globalThis.console = {group(){},groupEnd(){},table(){},log(){}};
  const result = calibration.run(g,m,() => {transformed=true;});
  assert(transformed);
  assert.equal(result.rows.length,2);
  assert.equal(result.failures.length,0);
  const original = g.GetTransPoint3D;
  g.GetTransPoint3D = (x,y,z) => {const p=original(x,y,z);p[0]+=10;return p;};
  const bad = calibration.run(g,m,()=>{});
  assert.equal(bad.failures.length,2);
} finally {globalThis.console=oldConsole;}
console.log('OpticalProjectionCalibration: 4 checks passed');
