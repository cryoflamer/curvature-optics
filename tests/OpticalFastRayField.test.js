'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fast=require('../src/optics/OpticalFastRayField');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const base={geometry:'flat',atmosphere:'exponential-occlusion',
  radius:R,observerHeight:15,profileOptions:{occlusionRadius:R}};
function target(geometry,d,h){return geometry==='flat'?[d,h]:[
  (R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}
function reference(options,d,h){return projection.solve({geometry:options.geometry,radius:R,
  observerHeight:options.observerHeight,atmosphere:options.atmosphere,
  profileOptions:options.profileOptions,target:target(options.geometry,d,h),
  step:1000,shootingPredictor:true});}
function approx(a,b,tolerance,description){assert.ok(Math.abs(a-b)<=tolerance,
  `${description}: ${a} vs ${b} (allowed ${tolerance})`);}
test('flat exponential analytic field agrees with independent RK4 on non-grazing targets',()=>{
  const f=fast.create(base);
  let visible=0,blocked=0;
  for(const eye of [2,15,100]){
    const options={...base,observerHeight:eye};
    const field=fast.create(options);
    for(const d of [1000,7000,20000,50000])for(const h of [0,5,30,200]){
      const actual=field.sample(d,h),rk4=reference(options,d,h);
      if(actual.status==='indeterminate')continue;
      assert.equal(actual.status,rk4.status,JSON.stringify({eye,d,h}));
      if(actual.status==='visible'){
        approx(actual.angle,rk4.angle,5e-9,`angle ${eye}/${d}/${h}`);visible++;
      }else if(actual.status==='blocked')blocked++;
    }
  }
  assert.ok(visible>20);assert.ok(blocked>0);
  assert.equal(f.mode,'analytic');assert.equal(f.stats().shootRK4Calls,0);
});
test('inverse-temperature 100% shares the exact flat exponential ray family',()=>{
  const a=fast.create({...base,atmosphere:'inverse-temperature',profileOptions:{
    occlusionRadius:R,inverseProfile:{source:'temperature-lapse',weight:1},
    temperatureProfile:{gradientKPerKm:20}}});
  const b=fast.create(base);
  for(const [d,h] of [[5000,10],[20000,5],[40000,50],[50000,100]]){
    const x=a.sample(d,h),y=b.sample(d,h);
    assert.equal(x.status,y.status);
    approx(x.angle,y.angle,1e-11,'inverse endpoint');
  }
  assert.equal(a.mode,'analytic');
});
test('globe vacuum reproduces exact projection angle and ground visibility',()=>{
  const f=fast.create({geometry:'globe',atmosphere:'vacuum',radius:R,observerHeight:15});
  for(const [d,h] of [[1000,0],[10000,10],[20000,30],[40000,120]]){
    const x=f.sample(d,h),expected=reference({geometry:'globe',
      atmosphere:'vacuum',observerHeight:15},d,h);
    assert.equal(x.status,expected.status);
    if(x.status==='visible')approx(x.angle,expected.angle,2e-12,'vacuum');
  }
});
test('standard globe local conformal gradient tracks visible RK4 angles',()=>{
  const options={geometry:'globe',atmosphere:'standard',radius:R,observerHeight:15};
  const field=fast.create(options);
  for(const [d,h] of [[1000,30],[5000,30],[10000,50],[20000,80]]){
    const result=field.sample(d,h),truth=reference(options,d,h);
    assert.equal(result.status,'visible');assert.equal(truth.status,'visible');
    approx(result.angle,truth.angle,1.5e-5,'standard globe local surrogate');
    assert.equal(result.accuracy,'approximation');
  }
  assert.ok(field.stats().gradient>0);assert.equal(field.stats().shootRK4Calls,0);
});
test('ground-contact band is explicit; no hidden exact fallback',()=>{
  const eye=15,d=30000;
  const f=fast.create({...base,observerHeight:eye});
  // Find the predicted tangent height by bisection in the analytic model.
  let lo=0,hi=150;
  for(let i=0;i<50;i++){
    const mid=(lo+hi)/2;
    if(f.sample(d,mid).minClearanceMeters<0)lo=mid;else hi=mid;
  }
  const near=f.sample(d,(lo+hi)/2);
  assert.equal(near.status,'indeterminate');
  assert.equal(f.sample(d,0).status,'blocked');
  assert.equal(f.sample(d,150).status,'visible');
  assert.equal(f.stats().shootRK4Calls,0);
});
test('unsupported profiles and invalid inputs never silently become visible',()=>{
  for(const atm of ['temperature-lapse','profile-transition','inverse-spherical']){
    const f=fast.create({geometry:'flat',atmosphere:atm,observerHeight:15});
    assert.equal(f.sample(1000,10).status,'unsupported');
  }
  const partial=fast.create({geometry:'flat',atmosphere:'inverse-temperature',
    observerHeight:15,profileOptions:{inverseProfile:{source:'standard',weight:0.5},occlusionRadius:R}});
  assert.equal(partial.sample(1000,10).status,'unsupported');
  assert.throws(()=>fast.create({...base,profile:{n:()=>1,dn:()=>0}}));
  assert.throws(()=>fast.create({...base,geometry:'globe',curvature:0}));
  assert.throws(()=>fast.create({...base,observerHeight:-1}));
  assert.throws(()=>fast.create({...base,contactMarginMeters:0}));
  assert.throws(()=>fast.create({...base,profileOptions:{occlusionRadius:0}}));
  const f=fast.create(base);
  for(const [d,h] of [[0,5],[-1,5],[10,-1],[NaN,5]])
    assert.throws(()=>f.sample(d,h));
});
test('globe standard super-refraction remains unsupported rather than inventing a horizon',()=>{
  const field=fast.create({geometry:'globe',atmosphere:'standard',observerHeight:15,
    profileOptions:{refractivity:0.1,scaleHeight:1000}});
  assert.equal(field.sample(5000,20).status,'unsupported');
});
