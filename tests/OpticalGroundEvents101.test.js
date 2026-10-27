'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tracer=require('../src/optics/OpticalRayTracer');
const R=6371000, vacuum=tracer.atmosphere('vacuum');
function approx(actual,expected,tol=1e-5){
  assert.ok(Math.abs(actual-expected)<=tol,
    `expected ${expected} +/- ${tol}, got ${actual}`);
}
function sphereEntry(height,angle){
  const b=(R+height)*Math.sin(angle);
  const discriminant=b*b-height*(2*R+height);
  return discriminant<0?null:-b-Math.sqrt(discriminant);
}
function sphericalTarget(x,objectHeight=0){
  return [x,Math.sqrt((R+objectHeight)**2-x*x)-R];
}
const base={geometry:'globe',radius:R,profile:vacuum,observerHeight:15,
  length:35000,step:35000};
const tangentAngle=-Math.acos(R/(R+15));
const tangentDistance=Math.sqrt((R+15)**2-R*R);

test('101: exact Globe tangent is detected without a sign-changing step',()=>{
  for(const step of [35000,17500,1000]){
    const ray=tracer.trace({...base,angle:tangentAngle,step,collect:true});
    assert.equal(ray.hitGround,true);
    assert.equal(ray.termination,'ground');
    assert.equal(ray.event.kind,'ground');
    assert.equal(ray.event.contact,'grazing');
    approx(ray.travelled,tangentDistance,2e-5);
    approx(ray.height,0,1e-7);
    assert.deepEqual(ray.points.at(-1),[ray.x,ray.z]);
  }
});

test('101: tangency at the final end of the requested path is recognized',()=>{
  const ray=tracer.trace({...base,angle:tangentAngle,
    length:tangentDistance,step:tangentDistance});
  assert.equal(ray.hitGround,true);
  assert.equal(ray.event.contact,'grazing');
  approx(ray.travelled,tangentDistance,1e-7);
});

test('101: entry into globe is caught even when a single step exits on far side',()=>{
  for(const angle of [-0.003,tangentAngle-0.00002]){
    const expected=sphereEntry(15,angle);
    assert.ok(expected>0);
    const ray=tracer.trace({...base,angle});
    assert.equal(ray.hitGround,true);
    assert.equal(ray.event.contact,'crossing');
    approx(ray.travelled,expected,0.0001);
    approx(ray.event.pathLength,ray.travelled,1e-10);
    approx(ray.event.height,0,1e-7);
  }
});

test('101: near tangent rays that miss the ground are not falsely occluded',()=>{
  for(const angle of [tangentAngle+1e-7,tangentAngle+2e-5]){
    const ray=tracer.trace({...base,angle});
    assert.equal(ray.hitGround,false);
    assert.equal(ray.termination,'range');
    assert.equal(ray.event,null);
    approx(ray.travelled,35000,1e-8);
  }
});

test('101: first event is returned, not the second exit from a globe',()=>{
  const ray=tracer.trace({...base,angle:-0.003,step:35000});
  approx(ray.travelled,sphereEntry(15,-0.003),1e-4);
  assert.ok(ray.travelled<tangentDistance);
});

test('101: Flat crossing is found at the physical distance and departure tangencies are ignored',()=>{
  const ray=tracer.trace({geometry:'flat',profile:vacuum,observerHeight:10,
    angle:-0.1,length:1000,step:1000});
  assert.equal(ray.event.contact,'crossing');
  approx(ray.travelled,-10/Math.sin(-0.1),1e-7);
  for(const geometry of ['flat','globe']){
    const departing=tracer.trace({geometry,profile:vacuum,observerHeight:0,
      angle:0,length:1000,step:1000});
    assert.equal(departing.hitGround,false);
  }
});

test('101: deliberate stopAtGround=false preserves unblocked numeric trajectories',()=>{
  const ray=tracer.trace({...base,angle:-0.003,stopAtGround:false});
  assert.equal(ray.event,null);
  assert.equal(ray.hitGround,false);
  assert.equal(ray.termination,'range-unchecked');
  approx(ray.travelled,35000,1e-8);
});

test('101: vacuum target visibility independently reproduces Globe partial occlusion',()=>{
  for(const [x,objectHeight,status] of [
    [5000,0,'visible'],[25000,0,'blocked'],[25000,23,'visible'],
    [40000,23,'blocked']]){
    const result=tracer.vacuumTargetVisibility({geometry:'globe',radius:R,
      observerHeight:15,target:sphericalTarget(x,objectHeight),step:50000});
    assert.equal(result.status,status,`target x=${x} h=${objectHeight}`);
    if(status==='blocked')assert.ok(result.ray.event.pathLength<Math.hypot(x,result.target[1]-15));
  }
});

test('101: vacuum Flat has no curvature horizon; surface endpoint is visible',()=>{
  const result=tracer.vacuumTargetVisibility({geometry:'flat',observerHeight:15,
    target:[50000,0],step:50000});
  assert.equal(result.status,'visible');
  assert.ok(['range','ground'].includes(result.ray.termination));
  approx(result.ray.travelled,Math.hypot(50000,15),1e-7);
  approx(result.ray.height,0,1e-8);
});

test('101: true grazing of Globe to a farther target is uncertain rather than declared blocked',()=>{
  const distance=35000;
  const target=[distance*Math.cos(tangentAngle),15+distance*Math.sin(tangentAngle)];
  const result=tracer.vacuumTargetVisibility({geometry:'globe',observerHeight:15,
    radius:R,target,step:40000});
  assert.equal(result.status,'indeterminate');
  assert.equal(result.ray.event.contact,'grazing');
});

test('101: invalid event parameters and target coordinates are rejected',()=>{
  for(const eventSubsteps of [0,1,65,1.5,NaN]){
    assert.throws(()=>tracer.trace({...base,angle:0,eventSubsteps}));
  }
  for(const contactTolerance of [0,-1,0.02,Infinity,NaN]){
    assert.throws(()=>tracer.trace({...base,angle:0,contactTolerance}));
  }
  assert.throws(()=>tracer.vacuumTargetVisibility({observerHeight:15,target:[100,0],
    atmosphere:'standard'}));
  for(const target of [[0,15],[NaN,0],[1,Infinity],[1],[0,0,0]]){
    assert.throws(()=>tracer.vacuumTargetVisibility({target,observerHeight:15}));
  }
});
