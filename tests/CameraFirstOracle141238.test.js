'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const oracle=require('../src/diagnostics/CurvatureCameraFirstOracle141238');
const camera=require('../src/app/CurvaturePhysicalCamera');
const tracer=require('../src/optics/OpticalRayTracer');
const model={showModel:1,rEarth:6371000,Height:15,rFEarth:10007543,
  deviceRatio:1.5,camViewAngle:.6,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3};
const snapshot={widthPx:800,heightPx:540,imagePlaneFocal:440,
  pixelScaleX:1,pixelScaleY:-1,pixelOffsetX:400,pixelOffsetY:270};
const config={model,snapshot};
test('140.12.38: independent analytic vacuum sphere control has near and far root separation',()=>{
  const R=model.rEarth,h=model.Height;
  const steep=oracle.analyticVacuumGround(-.04,h,R,30000);
  assert.equal(steep.kind,'ground');
  const expected=h*(2*R+h);
  const a=Math.sin(-.04)*(R+h);
  assert.ok(Math.abs(steep.distance*steep.distance+2*a*steep.distance+expected)<.001);
  assert.equal(oracle.analyticVacuumGround(.04,h,R,30000).kind,'range');
  assert.equal(oracle.analyticVacuumGround(-.0001,h,R,30000).kind,'range');
  assert.throws(()=>oracle.analyticVacuumGround(NaN,h,R,30000),/Invalid/);
});
test('140.12.38: camera rays use physical forward/right/rolled-up basis and actual pixel transform',()=>{
  const mid=oracle.pixelRay(model,snapshot,32,32);
  assert.ok(Number.isFinite(mid.angleRadians));
  assert.ok(Number.isFinite(mid.azimuthRadians));
  const m=Object.assign({},model,{Pan:28,Roll:26}),p=oracle.pixelRay(m,snapshot,32,32);
  assert.notEqual(p.azimuthRadians,mid.azimuthRadians);
  assert.notEqual(p.angleRadians,mid.angleRadians);
  assert.equal(Math.abs(Math.hypot(...p.initialDirection)-1)<1e-12,true);
  assert.throws(()=>oracle.pixelRay(model,snapshot,-1,0),/Invalid/);
  assert.throws(()=>oracle.check({model:Object.assign({},model,{showModel:2}),snapshot}),/Globe/);
  const f=camera.create(model);
  assert.ok(Math.abs(f.center[2])<1e-12);
});
test('140.12.38: forward f64 vacuum trace meets analytic ground independently of shooting',()=>{
  for(const angle of [-.07,-.03,-.01]){
    const a=oracle.analyticVacuumGround(angle,model.Height,model.rEarth,30000),
      actual=oracle.traceRay(config,angle,'vacuum',250,false);
    assert.equal(actual.kind,'ground');assert.equal(a.kind,'ground');
    assert.ok(Math.abs(actual.distance-a.distance)<.01,`${angle}: ${actual.distance} vs ${a.distance}`);
  }
  const high=oracle.traceRay(config,.03,'vacuum',250,false);
  assert.equal(high.kind,'range');assert.equal(high.distance,null);
});
test('140.12.38: standard 250m and 100m RK4 agree for safely blocked and high rays',()=>{
  for(const angle of [-.05,.02]){
    const a=oracle.traceRay(config,angle,'standard',250,false),
      b=oracle.traceRay(config,angle,'standard',100,false);
    assert.equal(a.kind,b.kind);
    if(a.distance!==null)assert.ok(Math.abs(a.distance-b.distance)<.25);
  }
});
test('140.12.38: real 64x64 vacuum and standard masks and 41-ray horizon sweep are complete',()=>{
  const vacuum=[],standard=[];
  for(let i=0;i<64;i++){
    vacuum.push(oracle.sampleRow(config,i,'vacuum'));
    standard.push(oracle.sampleRow(config,i,'standard'));
  }
  const sweep=oracle.horizonSweep(config),report=oracle.report(config,vacuum,standard,sweep);
  assert.equal(report.vacuum.total,4096);assert.equal(report.standard.total,4096);
  assert.equal(report.vacuum.analyticDisagreements,0,JSON.stringify(report.vacuum.disagreementExamples));
  assert.ok(report.vacuum.matchedContacts>0);
  assert.ok(report.vacuum.maximumContactErrorMetres<.01);
  assert.equal(report.horizonSweep.samples.length,41);
  assert.equal(report.horizonSweep.trajectories.length,5);
  assert.ok(report.horizonSweep.trajectories.every(x=>x.trajectory.points.length>2));
  const frame=oracle.frame(vacuum,'vacuum');
  assert.equal(frame.width,512);assert.equal(frame.rgba.length,512*512*4);
  assert.equal(report.samples.vacuum.length,4096);
  assert.ok(report.limitations.some(s=>s.includes('NOT proof')));
});
test('140.12.38: ZIP entries include report, 5 visuals and limitations',()=>{
  // Use in-memory canvas mocks here; no browser rendering is claimed by this test.
  const rows=Array.from({length:64},(_,r)=>Array.from({length:64},(_,c)=>({column:c,row:r,
    kind:'range',vacuumStatusAgree:true}))),
    sweep={rangeDegrees:[-1,1],samples:Array.from({length:41},(_,i)=>({coarse:'range',fine:'range'})),
      trajectories:Array.from({length:5},()=>({angleDegrees:0,trajectory:{points:[[0,15],[30000,0]]}}))},
    report={horizonSweep:sweep};
  const ctx={fillRect(){},strokeRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    set font(v){},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){}};
  const doc={createElement(){return {getContext(){return ctx;},toDataURL(){return 'data:image/png;base64,iVBORw0KGgo=';}};}};
  const oldAtob=global.atob;global.atob=x=>Buffer.from(x,'base64').toString('binary');
  try{
    const entries=oracle.entries(config,report,rows,rows,doc,{png(){return new Uint8Array([137,80,78,71]);}});
    assert.equal(entries.length,7);
    assert.equal(entries.filter(x=>x.name.endsWith('.png')).length,5);
    assert.ok(entries.some(x=>x.name.endsWith('sample-trajectories.png')));
    assert.ok(entries.find(x=>x.name.endsWith('README.txt')).data.includes('NOT certified sky'));
  }finally{global.atob=oldAtob;}
});
