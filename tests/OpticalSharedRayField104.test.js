'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const field=require('../src/optics/OpticalSharedRayField');
const R=6371000;
function setup(overrides={}) {return field.create({geometry:'flat',atmosphere:'vacuum',
  observerHeight:15,distances:[1000,1100,1200],heights:[20,21,22],
  step:200,angleTolerance:2e-5,...overrides});}
test('104: shared field projects inside an independently sampled cell',()=>{
  const f=setup(),s=f.sample(1050,20.5),ref=f.exact(1050,20.5);
  assert.equal(s.status,'visible');
  assert.equal(s.method,'interpolated');
  assert.ok(Math.abs(s.angle-ref.angle)<2e-5);
  assert.ok(f.stats().interpolations>=1);
});
test('104: cached field is reused rather than re-integrating on redraw',()=>{
  const f=setup();f.warm();const before=f.stats().solves;
  for(let i=0;i<12;i++) f.sample(1075,20.75);
  assert.equal(f.stats().solves,before);
  assert.equal(f.stats().interpolations,12);
});
test('104: interpolation is never used across the opaque horizon',()=>{
  const f=setup({atmosphere:'inverse-spherical',
    profileOptions:{occlusionRadius:R},distances:[15000,30000,45000],
    heights:[0,20,40],step:200,angleTolerance:1e-5});
  const s=f.sample(37500,10);
  assert.equal(s.method,'exact');
  assert.notEqual(s.status,'solver_failed');
  assert.ok(f.stats().fallbacks>0);
});
test('104: out-of-range values fall back to exact solver',()=>{
  const f=setup();const s=f.sample(4000,25);
  assert.equal(s.method,'exact');
  assert.equal(s.status,'visible');
});
test('104: global geometry parameter is independent of inverse Flat R',()=>{
  const common={atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:850000},
    distances:[1000,2000],heights:[20,30],step:120};
  const a=setup({...common,radius:R});
  const b=setup({...common,radius:1000000});
  assert.ok(Math.abs(a.exact(1500,25).angle-b.exact(1500,25).angle)<1e-12);
});
test('104: Globe surface arc distance converts to tangent-frame target',()=>{
  const f=setup({geometry:'globe',radius:R});
  const s=f.exact(1500,30);
  const x=(R+30)*Math.sin(1500/R);
  const z=(R+30)*Math.cos(1500/R)-R;
  assert.ok(Math.abs(s.angle-Math.atan2(z-15,x))<1e-12);
});
test('104: invalid grid axes, geometry, tolerance and samples are rejected',()=>{
  for(const options of [{distances:[2000,1000]}, {heights:[10,10]},
    {heights:[-1,10]}, {distances:[0,1000]}, {angleTolerance:0},
    {geometry:'cylinder'}, {geometry:'globe',distances:[1000,R*2]}])
    assert.throws(()=>setup(options));
  assert.throws(()=>setup().sample(NaN,20));
});
