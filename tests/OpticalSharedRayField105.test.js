'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../src/optics/OpticalSharedRayField');
const bench=require('../tools/benchmark-shared-optical-field');
function create(overrides={}) {return api.create({...bench.options('vacuum'),...overrides});}
test('105: deterministic target workload covers 2, 10 and 85 objects',()=>{
  for(const n of [2,10,85]){
    const a=bench.points(n),b=bench.points(n);
    assert.deepEqual(a,b);assert.equal(a.length,n);
    assert.ok(a.every(p=>p.d>=1000&&p.d<1200&&p.h>=20&&p.h<=22));
  }
});
test('105: vacuum field measured interior errors remain below configured angular tolerance',()=>{
  const f=create();f.warm();let interpolated=0,max=0;
  for(const p of bench.points(85)){
    const approx=f.sample(p.d,p.h),exact=f.exact(p.d,p.h);
    assert.equal(approx.status,exact.status);
    if(approx.method==='interpolated'){
      interpolated++;
      max=Math.max(max,Math.abs(approx.angle-exact.angle));
      assert.ok(Math.abs(approx.angle-exact.angle)<=2e-5);
    }
  }
  assert.ok(interpolated>0);
  assert.ok(max>0);
});
test('105: repeated redraws do not recompute previously accepted grid cells',()=>{
  const f=create();f.warm();const targets=bench.points(85);
  targets.forEach(p=>f.sample(p.d,p.h));
  const afterFirst=f.stats().solves;
  targets.forEach(p=>f.sample(p.d,p.h));
  assert.equal(f.stats().solves,afterFirst);
});
test('105: rejected cells use exact solver and preserve near-horizon status',()=>{
  const f=api.create({geometry:'flat',observerHeight:15,atmosphere:'inverse-spherical',
    profileOptions:{occlusionRadius:6371000},distances:[15000,30000,45000],
    heights:[0,20,40],step:200,angleTolerance:1e-5});
  for(const [d,h] of [[37500,10],[38000,5]]){
    const r=f.sample(d,h),reference=f.exact(d,h);
    assert.equal(r.method,'exact');assert.equal(r.status,reference.status);
  }
});
test('105: grid refinement reduces observed vacuum angular interpolation error',()=>{
  const points=bench.points(85);
  function observed(gridSize){
    const f=api.create(bench.options('vacuum',gridSize));f.warm();
    return Math.max(...points.map(p=>Math.abs(f.sample(p.d,p.h).angle-f.exact(p.d,p.h).angle)));
  }
  assert.ok(observed(9)<observed(3));
});
test('105: benchmark reports independently timed preprocessing and redraw phases',()=>{
  const measurements=bench.run({counts:[2],frames:2});
  assert.equal(measurements.length,1);
  const result=measurements[0];
  assert.equal(result.objects,2);
  assert.equal(result.statusMismatch,0);
  assert.ok(result.warmSolves>0);
  assert.ok(result.approxMaxPixelError>=0);
  assert.ok(Math.abs(result.approxMaxPixelError/result.maxAngularErrorRad-1920/(2*Math.tan(Math.PI/6)))<1e-7);
  for(const key of ['directMs','warmMs','firstMs','redrawMs'])
    assert.ok(Number.isFinite(result[key])&&result[key]>=0);
});
