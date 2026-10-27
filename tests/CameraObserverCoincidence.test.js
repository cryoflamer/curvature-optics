'use strict';
const assert = require('assert');
const bridge = require('../src/renderers/CurvatureInverseOpticsBridge');
const g = {
  Camera: {CamPos:[0,0,0],CamTrans:[[0,-1,0],[1,0,0],[0,0,1]],ScreenDist:1,Zoom:1},
  WinTrans: {TransX:x=>x,TransY:y=>y}
};
const m = {camPos:[0,0,0]};
let r = bridge.auditCameraOrigin(g,m);
assert(r && r.passed,JSON.stringify(r));
assert(r.maxRangeShift<1e-10);
g.Camera.CamPos = [0.5,0,0];
r = bridge.auditCameraOrigin(g,m);
assert(!r.passed);
assert(r.originDistance===0.5);
g.Camera.CamPos = [0,0,0];
m.camPos = [0,0,0.5];
assert(!bridge.auditCameraOrigin(g,m).passed);
console.log('Camera/observer coincidence and range-invariance checks PASS');
