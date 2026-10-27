'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projector=require('../src/optics/OpticalTargetProjection');
const tracer=require('../src/optics/OpticalRayTracer');
const R=6371000;
function close(actual,expected,tolerance,msg){
  assert.ok(Math.abs(actual-expected)<=tolerance,
    `${msg||''}: ${actual} != ${expected} (tolerance ${tolerance})`);
}
function globePoint(distance,height,radius=R){
  return [(radius+height)*Math.sin(distance/radius),
    (radius+height)*Math.cos(distance/radius)-radius];
}
function horizon(height,radius=R){return radius*Math.acos(radius/(radius+height));}
function expHorizon(height,radius=R){return radius*Math.acos(Math.exp(-height/radius));}
function solve(target,options={}){
  return projector.solve({geometry:'flat',observerHeight:15,target,step:150,
    atmosphere:'standard',...options});
}

test('103: vacuum Flat returns straight-ray angle, including ground endpoint',()=>{
  const target=[30000,0],result=solve(target,{atmosphere:'vacuum',step:1000});
  assert.equal(result.status,'visible');
  close(result.angle,Math.atan2(-15,30000),1e-14,'vacuum angle');
  close(result.pathLength,Math.hypot(30000,15),1e-9,'vacuum length');
});

test('103: vacuum Globe blocked and visible agree with independent line/sphere geometry',()=>{
  for(const [range,height,status] of [[5000,0,'visible'],[25000,0,'blocked'],
    [25000,23,'visible'],[40000,23,'blocked']]){
    const target=globePoint(range,height);
    const result=solve(target,{geometry:'globe',radius:R,atmosphere:'vacuum',step:1000});
    assert.equal(result.status,status,`globe ${range}, ${height}`);
    close(result.angle,Math.atan2(target[1]-15,target[0]),1e-14,'vacuum globe angle');
  }
});

test('103: standard atmosphere finds a connecting ray and satisfies target height residual',()=>{
  const target=[25000,45];
  const result=solve(target,{step:80});
  assert.equal(result.status,'visible');
  assert.ok(Math.abs(result.residual)<1e-6);
  assert.ok(result.angle>Math.atan2(45-15,25000),
    'downward bending requires higher launch angle');
  assert.ok(result.evaluations>1);
});

test('103: exact exponential profile shooting matches independent closed-form trajectory',()=>{
  const radius=1000000,initialHeight=80,angle=-0.007,x=10000;
  // h(x) = -R log(cos((x-xm)/R)) + hm, with tan(angle)=-tan(xm/R).
  const xM=-radius*angle;
  const hM=initialHeight+radius*Math.log(Math.cos(xM/radius));
  const z=hM-radius*Math.log(Math.cos((x-xM)/radius));
  const result=solve([x,z],{observerHeight:initialHeight,atmosphere:'exponential-occlusion',
    profileOptions:{occlusionRadius:radius},step:150});
  assert.equal(result.status,'visible');
  close(result.angle,angle,5e-9,'analytic angle');
  close(result.residual,0,1e-6,'target residual');
});

test('103: exact inverse spherical profile respects Globe horizon law on Flat at several R',()=>{
  for(const r of [500000,6371000]){
    const limit=horizon(15,r)+horizon(23,r);
    const options={atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:r},
      observerHeight:15,step:Math.min(200,r/2500)};
    const before=solve([limit*0.85,23],options);
    const after=solve([limit*1.15,23],options);
    assert.equal(before.status,'visible',`near side r=${r}: ${before.status} ${before.reason}`);
    assert.equal(after.status,'blocked',`far side r=${r}: ${after.status} ${after.reason}`);
  }
});

test('103: exponential profile visibility follows its own analytic grazing threshold',()=>{
  const limit=expHorizon(15)+expHorizon(23);
  for(const [multiple,status] of [[0.85,'visible'],[1.15,'blocked']]){
    const result=solve([limit*multiple,23],{atmosphere:'exponential-occlusion',
      profileOptions:{occlusionRadius:R},step:125});
    assert.equal(result.status,status,`${multiple} ${result.reason}`);
  }
});

test('103: exact inverse profile classifies a limiting two-ended grazing ray as uncertain',()=>{
  const limit=horizon(15)+horizon(23);
  const result=solve([limit,23],{atmosphere:'inverse-spherical',
    profileOptions:{occlusionRadius:R},step:150});
  assert.equal(result.status,'indeterminate');
  assert.equal(result.ray.event.contact,'grazing');
  close(result.pathLength-result.ray.travelled, horizon(23),2,'grazing near midpoint');
});

test('103: ordinary ground endpoint is visible after precision-refined shooting',()=>{
  for(const distance of [10,100,1000,10000]){
    const result=solve([distance,0],{step:100});
    assert.equal(result.status,'visible',`standard atmosphere ground ${distance}`);
    assert.ok(Math.abs(result.residual) <= 1e-10);
  }
});

test('103: standard refraction shifts Globe horizon without changing physical geometry',()=>{
  const target=globePoint(35000,23);
  const vacuum=solve(target,{geometry:'globe',atmosphere:'vacuum',step:200});
  const normal=solve(target,{geometry:'globe',atmosphere:'standard',step:200});
  assert.equal(vacuum.status,'blocked');
  assert.equal(normal.status,'visible');
  assert.ok(normal.angle>vacuum.angle);
});

test('103: apparent angle is stable as the RK4 step is refined',()=>{
  const common={atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:R},
    observerHeight:15};
  const coarse=solve([12000,30],{...common,step:350});
  const fine=solve([12000,30],{...common,step:35});
  assert.equal(coarse.status,'visible');
  assert.equal(fine.status,'visible');
  close(coarse.angle,fine.angle,1e-9,'step convergence');
});

test('103: downstream status is not inferred as blocked from missing angular bracket',()=>{
  const result=solve([2000,20],{initialSpan:1e-8,maxSpan:2e-8,maxIterations:1});
  assert.equal(result.status,'solver_failed');
  assert.equal(result.angle,null);
  assert.ok(result.reason);
});

test('103: explicit numerical non-convergence is solver_failed, never blocked',()=>{
  const result=solve([100000,0],{step:200,maxSteps:2});
  assert.equal(result.status,'solver_failed');
});

test('103: custom profile uses the same solver and has no implicit Globe radius coupling',()=>{
  const custom=tracer.atmosphere('exponential-occlusion',{occlusionRadius:900000});
  const a=solve([12000,30],{profile:custom,atmosphere:undefined,geometry:'flat',radius:1000000});
  const b=solve([12000,30],{profile:custom,atmosphere:undefined,geometry:'flat',radius:6371000});
  assert.equal(a.status,'visible');
  assert.equal(b.status,'visible');
  close(a.angle,b.angle,1e-12,'Flat radius invariance');
});

test('103: invalid targets, profiles and solver controls fail explicitly',()=>{
  for(const target of [[0,15],[-10,2],[NaN,0],[10,Infinity],[10],[1,2,3]])
    assert.throws(()=>solve(target));
  assert.throws(()=>solve([100,-10]));
  for(const extra of [{step:0},{targetTolerance:0},{maxSteps:0},{maxIterations:0},
    {initialSpan:0},{maxSpan:2},{geometry:'foo'},{radius:0},{contactTolerance:-1},
    {profileOptions:{occlusionRadius:0},atmosphere:'inverse-spherical'}])
    assert.throws(()=>solve([1000,15],extra));
});
