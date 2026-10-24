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
// Adaptive sampling: a curved apparent edge must gain intermediate points.
const bent = bridge.adaptiveEdge([0,0,0],[10,0,0],t=>[10*t,0,Math.sin(Math.PI*t)],5,0.1);
assert.ok(bent.points.filter(Boolean).length>2);
// A hidden middle section must not be bridged by a drawn segment.
const hidden = bridge.adaptiveEdge([0,0,0],[10,0,0],t=>
  t>0.4 && t<0.6 ? null : [10*t,0,0],5,0.1);
assert.ok(hidden.points.includes(null));
for(let i=1;i<hidden.points.length;i++) {
  const a=hidden.points[i-1], b=hidden.points[i];
  if(a && b) assert.ok(!(a[0]<4 && b[0]>6));
}
