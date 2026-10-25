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

// Audit checks both angular reconstruction and actual projected pixel displacement.
const mockSolver = {solveAngle: o => ({status:'visible',angle:Math.atan2(o.targetHeight-15,o.distance)+0.0001})};
const model = {rEarth:6371000,Height:15};
const mockCapture = {points:[
  {y:0,world:[0,6000,-2.8]},
  {y:0.5,world:[0,6000,10]},
  {y:1,world:[0,6000,25]}
]};
const numeric = bridge.auditVertices21(project,model,mockCapture,mockSolver);
assert.strictEqual(numeric.rows.length,3);
for (const row of numeric.rows) {
  assert.strictEqual(row.status,'visible');
  assert.ok(Math.abs(row.reconstructionArcsec)<1e-7);
  assert.ok(Number.isFinite(row.deltaPx[1]));
  assert.ok(Math.abs(row.deltaPx[0])<1e-10);
}
assert.strictEqual(bridge.auditVertices21(project,model,null,mockSolver),null);
console.log('Tower #21 numerical angle/pixel audit passed');

// Check the actual cached orange points, including their camera projections.
const previousTimer = global.setTimeout;
const queue = [];
global.setTimeout = callback => { queue.push(callback); return queue.length; };
try {
  const scene = {rEarth:6371000,Height:15,ObjDist:[6000],ObjDeltaDist:[0],
    ObjSize:[40],ObjSidePos:[0],NObjects:[22]};
  const vertices = [[0,6000,1],[0,6000,10],[0,6000,20]];
  const geometry = {getTowerPaths:()=>[vertices]};
  const solver = {solveAngle:o=>({status:'visible',
    angle:Math.atan2(o.targetHeight-o.observerHeight,o.distance)+0.00005})};
  let done;
  bridge.calculateAtmosphere21(scene,geometry,solver,()=>{},r=>{done=r;});
  while(queue.length) queue.shift()();
  assert.strictEqual(done.state,'ready');
  const audit = bridge.auditAtmosphere21(project,scene,solver);
  assert.strictEqual(audit.count,done.samples.length);
  assert.ok(audit.count>=3);
  assert.ok(audit.passed,JSON.stringify(audit));
  assert.ok(audit.maxPixelError<1e-8);
  assert.ok(audit.maxAngleArcsec<1e-7);
  const changed = {...scene,Height:16};
  assert.strictEqual(bridge.auditAtmosphere21(project,changed,solver),null);
  // A stale cached point must be detected rather than silently accepted.
  done.samples[0].apparent[2]+=1;
  assert.strictEqual(bridge.auditAtmosphere21(project,scene,solver).passed,false);
} finally { global.setTimeout=previousTimer; }
console.log('Cached atmospheric tower projection audit passed');

// Horizon crossing: locate visible-side endpoints and never bridge a hidden
// interval. Both directions and a hidden island are covered.
for (const visible of [t => t < 0.37, t => t > 0.63,
  t => t < 0.37 || t > 0.63]) {
  const result = bridge.adaptiveEdge([0,0,0],[1,0,0],t =>
    visible(t) ? [t,0,0] : null,5,0.1);
  assert.ok(result.transitions >= 1);
  assert.ok(result.points.includes(null) || result.points.every(Boolean));
  for (let i=1;i<result.points.length;i++) {
    const a=result.points[i-1], b=result.points[i];
    if (!a || !b) continue;
    assert.ok(visible((a[0]+b[0])/2), 'segment crosses hidden zone');
  }
}
console.log('Horizon transitions: visible-side bisection and hidden-gap checks passed');
