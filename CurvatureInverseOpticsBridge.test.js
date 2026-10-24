const assert = require('assert');
const bridge = require('./CurvatureInverseOpticsBridge');
const project = {Camera:{Trans:p=>p.slice()},WinTrans:{TransX:x=>x,TransY:y=>y}};
const samples = [
  [36.37377839027139,6001.005828452824,-10.696350447543958],
  [37.98386383999751,6001.020776781798,5.173633843312828],
  [30.968739999882594,6000.999112560652,-17.8263181820583]
];
for (const world of samples) {
  const dir = bridge.vacuumDirection(world);
  const rebuilt = bridge.directionAtRange(dir);
  for (let k=0;k<3;k++) assert.ok(Math.abs(world[k]-rebuilt[k])<1e-9);
}
assert.strictEqual(bridge.vacuumDirection([0,0,0]),null);
assert.strictEqual(bridge.vacuumDirection([NaN,1,0]),null);
const capture = {tower:21,points:samples.map((world,i)=>({x:i,y:i/2,world}))};
const report = bridge.compareTower(project,capture);
assert.strictEqual(report.count,3);
assert.ok(report.maxPx<1e-9,report.maxPx);
assert.ok(report.rmsPx<1e-9,report.rmsPx);
console.log('Independent vacuum bridge: 3 vertex checks and input guards passed');
