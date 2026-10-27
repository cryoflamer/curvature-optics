'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ray=require('../src/optics/OpticalRayTracer');
const R=6371000;
function close(a,b,t,label){assert.ok(Math.abs(a-b)<=t,`${label}: ${a} vs ${b}, tol ${t}`);}
function sphericalDistance(h,r){return r*Math.acos(r/(r+h));}
function exponentialDistance(h,r){return r*Math.acos(Math.exp(-h/r));}
function grazingAngle(profile,h){return -Math.acos(profile.n(0)/profile.n(h));}
// Independent ray-geometry oracle: integration time chosen so ray reaches
// the analytical tangent's horizontal coordinate (not its arc length).
function atHorizontal(profile,initialHeight,angle,xTarget,step){
  const distance=xTarget/Math.cos(angle)*1.0002;
  let state=[0,initialHeight,Math.cos(angle),Math.sin(angle)];
  let moved=0;
  while(state[0]<xTarget && moved<distance*1.1){
    const ds=Math.min(step,distance*1.1-moved);
    const next=ray.advanceState(state,ds,{geometry:'flat',profile});
    if(next[0]>=xTarget){
      let lo=0,hi=ds;
      for(let i=0;i<40;i++){
        const mid=(lo+hi)/2;
        if(ray.advanceState(state,mid,{geometry:'flat',profile})[0]<xTarget)lo=mid;
        else hi=mid;
      }
      return ray.advanceState(state,(lo+hi)/2,{geometry:'flat',profile});
    }
    moved+=ds;state=next;
  }
  throw Error('Ray did not reach horizontal target');
}
test('102: physical standard atmosphere bends downward; both inverse profiles bend upward',()=>{
  const standard=ray.atmosphere('standard');
  assert.ok(standard.n(100)>1 && standard.dn(100)<0);
  for(const kind of ['exponential-occlusion','inverse-spherical']){
    const p=ray.atmosphere(kind,{occlusionRadius:R});
    assert.ok(p.n(100)>p.n(0) && p.dn(100)>0);
    const out=ray.trace({geometry:'flat',profile:p,observerHeight:100,angle:0,
      length:10000,step:200,stopAtGround:false});
    assert.ok(out.z>100,kind);
  }
});
test('102: exponential profile follows exact non-paraxial ray family',()=>{
  const p=ray.atmosphere('exponential-occlusion',{occlusionRadius:R,n0:1.0003});
  for(const initialHeight of [15,500]){
    const length=70000;
    for(const ds of [1000,200]){
      const out=ray.trace({geometry:'flat',profile:p,observerHeight:initialHeight,
        angle:0,length,step:ds,stopAtGround:false,collect:true});
      const exact=initialHeight-R*Math.log(Math.cos(out.x/R));
      close(out.z,exact,ds===1000?0.00001:0.0000002,'exact exponential trajectory');
      close(out.angle,Math.atan(Math.tan(out.x/R)),1e-10,'exact ray slope');
    }
  }
});
test('102: exponential grazing ray reaches the analytic tangent point',()=>{
  const p=ray.atmosphere('exponential-occlusion',{occlusionRadius:R});
  for(const h of [10,100,1000]){
    const d=exponentialDistance(h,R);
    const tangent=atHorizontal(p,h,grazingAngle(p,h),d,100);
    close(tangent[1],0,0.000002,'exponential tangent height');
    close(tangent[3],0,0.000000001,'exponential tangent slope');
  }
});
test('102: exact inverse profile reproduces spherical grazing distances at multiple radii',()=>{
  for(const r of [500000,6371000,12000000]){
    const p=ray.atmosphere('inverse-spherical',{occlusionRadius:r});
    for(const h of [2,15,100,1000]){
      const d=sphericalDistance(h,r);
      const tangent=atHorizontal(p,h,grazingAngle(p,h),d,Math.min(100,r/5000));
      close(tangent[1],0,0.00002,'inverse tangent height');
      close(tangent[3],0,0.00000005,'inverse tangent slope');
    }
  }
});
test('102: exact inverse index and its derivative agree with independent finite differences',()=>{
  for(const r of [100000,6371000]){
    const p=ray.atmosphere('inverse-spherical',{occlusionRadius:r,n0:1.0003});
    close(p.n(0),1.0003,1e-14,'boundary index');
    for(const h of [0,10,250,5000]){
      const t=h/r;
      const expected=1.0003*Math.sqrt(1+(1+t)**4-(1+t)**2);
      close(p.n(h),expected,3e-12,'profile closed form');
      const dh=1;
      const centered=(p.n(h+dh)-p.n(h-dh))/(2*dh);
      close(p.dn(h),centered,2e-11,'analytic derivative');
    }
  }
});
test('102: standard atmospheric n and dn retain existing configurable definition',()=>{
  for(const [N,H] of [[0.000293,7350],[0.003,1000]]){
    const p=ray.atmosphere('standard',{refractivity:N,scaleHeight:H});
    for(const h of [0,50,1000]){
      close(p.n(h),1+N*Math.exp(-h/H),1e-14,'standard n');
      close(p.dn(h),-N/H*Math.exp(-h/H),1e-16,'standard dn');
    }
  }
});
test('102: radius of refractive comparison is independent of Flat/Globe geometry',()=>{
  const p=ray.atmosphere('inverse-spherical',{occlusionRadius:500000});
  const a=ray.trace({geometry:'flat',radius:6371000,profile:p,
    observerHeight:100,angle:0,length:5000,step:100,stopAtGround:false});
  const b=ray.trace({geometry:'flat',radius:20000000,profile:p,
    observerHeight:100,angle:0,length:5000,step:100,stopAtGround:false});
  close(a.z,b.z,1e-10,'Flat physical radius does not change inverse profile');
  const c=ray.atmosphere('inverse-spherical',{occlusionRadius:1000000});
  assert.ok(ray.trace({geometry:'flat',profile:p,observerHeight:100,angle:0,
    length:5000,step:100,stopAtGround:false}).z>
    ray.trace({geometry:'flat',profile:c,observerHeight:100,angle:0,
    length:5000,step:100,stopAtGround:false}).z);
});
test('102: malformed occlusion radius and refractive scales are rejected',()=>{
  for(const kind of ['inverse-spherical','exponential-occlusion']){
    for(const opts of [{},{occlusionRadius:0},{occlusionRadius:-1},
      {occlusionRadius:NaN},{occlusionRadius:Infinity},
      {occlusionRadius:R,n0:0},{occlusionRadius:R,n0:NaN},
      {occlusionRadius:R,n0:Infinity}])
      assert.throws(()=>ray.atmosphere(kind,opts),`${kind} ${JSON.stringify(opts)}`);
  }
});
