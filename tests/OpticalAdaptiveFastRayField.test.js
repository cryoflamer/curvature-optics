'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fast=require('../src/optics/OpticalFastRayField');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
function target(geometry,d,h){return geometry==='flat'?[d,h]:[
  (R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}
function reference(options,d,h){return projection.solve({
  ...options,target:target(options.geometry,d,h),step:1000,shootingPredictor:true
});}
const models=[
  ['globe','standard',{}],
  ['flat','temperature-lapse',{gradientKPerKm:20}],
  ['globe','temperature-lapse',{gradientKPerKm:-20}],
  ['globe','profile-transition',{transitionProfile:{source:'standard',weight:0.5},occlusionRadius:R}],
  ['flat','inverse-temperature',{inverseProfile:{source:'standard',weight:0.5},occlusionRadius:R}],
  ['flat','inverse-spherical',{occlusionRadius:R}],
  ['globe','exponential-occlusion',{occlusionRadius:R}],
  ['flat','vacuum',{}]
];
test('adaptive curvature uses each built-in profile rather than silently selecting standard',()=>{
  const angles=[];
  for(const [geometry,atmosphere,profileOptions] of models){
    const field=fast.createAdaptive({geometry,atmosphere,profileOptions,radius:R,observerHeight:15});
    const result=field.sample(10000,40);
    assert.equal(result.status,'visible',atmosphere);
    assert.equal(result.method,'fast-adaptive-conformal-curvature');
    assert.equal(result.accuracy,'approximation');
    const statistics=field.stats();
    assert.equal(statistics.shootRK4Calls,0);
    assert.equal(statistics.tableSize,256);
    assert.equal(statistics.segments,8);
    assert.equal(statistics.passes,2);
    angles.push(result.angle);
  }
  assert.notEqual(angles[0],angles[1]);
  assert.notEqual(angles[1],angles[2]);
});
test('adaptive interpolation agrees approximately with independently shot RK4 on ordinary scenes',()=>{
  let visible=0,blocked=0,uncertain=0;
  for(const [geometry,atmosphere,profileOptions] of models){
    const options={geometry,atmosphere,profileOptions,radius:R,observerHeight:15};
    const field=fast.createAdaptive(options);
    for(const distance of [1000,12000,50000])for(const height of [0,5,30,200]){
      const estimate=field.sample(distance,height),truth=reference(options,distance,height);
      assert.notEqual(estimate.status,'unsupported',JSON.stringify({geometry,atmosphere,distance,height}));
      if(estimate.status==='indeterminate'){uncertain++;continue;}
      assert.equal(estimate.status,truth.status,JSON.stringify({geometry,atmosphere,distance,height}));
      if(estimate.status==='visible'){
        assert.ok(Math.abs(estimate.angle-truth.angle)<2e-5,
          JSON.stringify({geometry,atmosphere,distance,height,estimate,truth}));
        visible++;
      }else if(estimate.status==='blocked')blocked++;
    }
  }
  assert.ok(visible>40);
  assert.ok(blocked>0);
  assert.ok(uncertain<10);
});
test('adaptive field distinguishes blocked, near-contact and ground endpoint',()=>{
  const field=fast.createAdaptive({geometry:'globe',atmosphere:'standard',
    observerHeight:15,radius:R});
  assert.equal(field.sample(1000,0).status,'visible','a near ground endpoint is valid');
  assert.equal(field.sample(100000,0).status,'blocked','distant ground is behind horizon');
  // Approximate tangent elevation at this distance, independent of RK4.
  let lo=0,hi=200;
  for(let i=0;i<40;i++){
    const mid=(lo+hi)/2,clearance=field.sample(50000,mid).minClearanceMeters;
    if(clearance<0)lo=mid;else hi=mid;
  }
  const tangent=field.sample(50000,(lo+hi)/2);
  assert.equal(tangent.status,'indeterminate');
  assert.ok(Math.abs(tangent.minClearanceMeters)<0.01);
});
test('adaptive field conservatively rejects invalid/custom/steep inputs',()=>{
  const make=(overrides)=>fast.createAdaptive({geometry:'flat',atmosphere:'standard',
    radius:R,observerHeight:15,...overrides});
  assert.throws(()=>make({profile:{n:()=>1,dn:()=>0}}));
  assert.throws(()=>make({geometry:'globe',curvature:0}));
  assert.throws(()=>make({observerHeight:-1}));
  assert.throws(()=>make({contactMarginMeters:0}));
  assert.throws(()=>make({atmosphere:'temperature-lapse',profileOptions:{gradientKPerKm:50}}));
  const unknown=make({atmosphere:'custom'});
  assert.equal(unknown.sample(1000,20).status,'unsupported');
  const field=make({});
  for(const [d,h] of [[0,5],[-1,5],[10,-1],[NaN,5]])
    assert.throws(()=>field.sample(d,h));
  assert.equal(field.sample(1000,10000).status,'unsupported','steep ray');
  assert.equal(field.sample(5000,50001).status,'unsupported','outside gradient table');
  const globe=make({geometry:'globe'});
  assert.equal(globe.sample(R*Math.PI/2,5).status,'unsupported');
  const duct=make({profileOptions:{refractivity:0.1,scaleHeight:1000}});
  assert.equal(duct.sample(100000,30).status,'unsupported','strong ducting may violate approximation');
});
test('adaptive field maintains independent sampling counters with separate atmospheres',()=>{
  const a=fast.createAdaptive({geometry:'flat',atmosphere:'standard',observerHeight:15});
  const b=fast.createAdaptive({geometry:'flat',atmosphere:'temperature-lapse',observerHeight:15,
    profileOptions:{gradientKPerKm:20}});
  const first=a.sample(10000,40).angle;
  const different=b.sample(10000,40).angle;
  assert.notEqual(first,different);
  assert.equal(a.sample(10000,40).angle,first);
  assert.equal(a.stats().samples,2);
  assert.equal(b.stats().samples,1);
  assert.equal(a.stats().shootRK4Calls,0);
  assert.equal(b.stats().shootRK4Calls,0);
  const legacy=fast.create({geometry:'flat',atmosphere:'temperature-lapse',observerHeight:15});
  assert.equal(legacy.sample(10000,40).status,'unsupported',
    'existing create() mode is unchanged until later integration');
});

test('adaptive tables are reused across camera heights but isolated by profile, radius and geometry',()=>{
  const base={geometry:'globe',atmosphere:'temperature-lapse',radius:6381234,
    observerHeight:15,profileOptions:{gradientKPerKm:11.72,temperatureC:12}};
  const a=fast.createAdaptive(base);
  assert.equal(a.stats().tableCacheHit,false,'new atmosphere should build its gradient table');
  const b=fast.createAdaptive({...base,observerHeight:60});
  assert.equal(b.stats().tableCacheHit,true,'camera height must not rebuild n(h)');
  assert.equal(a.sample(10000,40).status,'visible');
  assert.equal(b.stats().samples,0,'table reuse must not reuse ray results or counters');
  const same=fast.createAdaptive(base);
  assert.equal(same.stats().tableCacheHit,true);
  assert.equal(same.sample(10000,40).angle,a.sample(10000,40).angle,
    'cached table must preserve sampled angle');
  assert.equal(fast.createAdaptive({...base,profileOptions:{...base.profileOptions,
    gradientKPerKm:11.73}}).stats().tableCacheHit,false);
  assert.equal(fast.createAdaptive({...base,radius:base.radius+1}).stats().tableCacheHit,false);
  assert.equal(fast.createAdaptive({...base,geometry:'flat'}).stats().tableCacheHit,false);
  assert.throws(()=>fast.createAdaptive({...base,profileOptions:{gradientKPerKm:50}}),
    /Invalid temperature-lapse atmosphere/);
});

test('adaptive gradient cache has a finite LRU limit',()=>{
  const base={geometry:'flat',atmosphere:'standard',radius:6410001,observerHeight:10};
  assert.equal(fast.createAdaptive(base).stats().tableCacheHit,false);
  for(let i=0;i<13;i++)fast.createAdaptive({...base,radius:base.radius+i+1});
  assert.equal(fast.createAdaptive(base).stats().tableCacheHit,false,
    'old gradient tables must be evicted instead of accumulating forever');
});

test('adaptive shallow-ray stress grid is compared with an independent RK4 oracle',()=>{
  const {audit}=require('../tools/compare-adaptive-fast-preview');
  const result=audit({quick:true});
  assert.equal(result.totalSamples,180);
  assert.equal(result.totalMismatches,0,
    JSON.stringify(result.summaries.filter(s=>s.statusMismatches.length)));
  assert.ok(result.maxVisibleAngleErrorPx<1,
    'hypothetical angular pixel difference across selected shallow rays (not raster parity)');
  assert.ok(result.summaries.every(s=>s.visible>=10&&s.blocked>=2&&
    s.unsupported>=1),'stress grid must exercise visible, blocked and explicit unsupported rays');
});

test('grazing adaptive paths remain indeterminate rather than silently visible',()=>{
  for(const config of [
    {geometry:'globe',atmosphere:'temperature-lapse',profileOptions:{gradientKPerKm:-20}},
    {geometry:'globe',atmosphere:'profile-transition',profileOptions:{
      transitionProfile:{source:'standard',weight:0.5},occlusionRadius:R}},
    {geometry:'flat',atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:R}}
  ]){
    const field=fast.createAdaptive({...config,radius:R,observerHeight:15,
      contactMarginMeters:0.1});
    const distance=50000;
    let low=0,high=200;
    assert.equal(field.sample(distance,low).status,'blocked');
    assert.equal(field.sample(distance,high).status,'visible');
    for(let i=0;i<45;i++){
      const mid=(low+high)/2;
      if(field.sample(distance,mid).minClearanceMeters<0)low=mid;
      else high=mid;
    }
    const grazing=field.sample(distance,(low+high)/2);
    assert.equal(grazing.status,'indeterminate',config.atmosphere);
    assert.ok(Math.abs(grazing.minClearanceMeters)<0.01,config.atmosphere);
    assert.ok(Number.isFinite(grazing.angle));
    assert.equal(field.stats().shootRK4Calls,0);
  }
});

test('steep and high-altitude adaptive requests have explicit non-physical statuses',()=>{
  const field=fast.createAdaptive({geometry:'globe',atmosphere:'temperature-lapse',
    observerHeight:15,profileOptions:{gradientKPerKm:20}});
  for(const [d,h] of [[1000,1000],[5000,50001],[100,100],[1000,50000]]){
    const r=field.sample(d,h);
    assert.equal(r.status,'unsupported',`d=${d} h=${h}`);
    assert.equal(r.angle,null);
    assert.ok(r.reason);
  }
  const stats=field.stats();
  assert.equal(stats.samples,4);
  assert.equal(stats.unsupported,4);
  assert.equal(stats.visible,0);
  assert.equal(stats.shootRK4Calls,0);
});
