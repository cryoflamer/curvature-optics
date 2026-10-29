'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/optics/OpticalTargetProjection');
const fields=require('../src/optics/OpticalSharedRayField');
const rt=require('../src/optics/OpticalRayTracer');
const benchmark=require('../tools/benchmark-engineered-shooting-1404');
const R=6371000;
const profiles=['exponential-occlusion','inverse-spherical'];
const geometries=['flat','globe'];
function target(geometry,d,h){return geometry==='flat'?[d,h]:[
 (R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}
function setup(atmosphere,geometry){return {atmosphere,geometry,radius:R,
 observerHeight:15,profileOptions:{occlusionRadius:R},step:2000,
 distances:[5000,30000],heights:[0,65]};}

test('140.4: engineered and custom atmospheres preserve their default reference solver',()=>{
 for(const atmosphere of profiles)for(const geometry of geometries){
  const ordinary=fields.create(setup(atmosphere,geometry));
  const disabled=fields.create({...setup(atmosphere,geometry),shootingOptimization:false});
  const disabledByUnknown=fields.create({...setup(atmosphere,geometry),shootingOptimization:true});
  for(const field of [ordinary,disabled,disabledByUnknown]){
   field.exact(20000,10);
   const stats=field.stats();
   assert.equal(stats.predictorAttempts,0);
   assert.equal(stats.warmStartAttempts,0);
   assert.equal(stats.clearGroundSteps,0);
  }
  assert.equal(ordinary.stats().shootEvaluations,disabled.stats().shootEvaluations);
  assert.equal(ordinary.stats().shootRK4Calls,disabled.stats().shootRK4Calls);
 }
 const custom=fields.create({geometry:'flat',observerHeight:15,
  distances:[5000,30000],heights:[0,65],
  profile:rt.atmosphere('standard'),
  shootingOptimization:'engineered-experimental',step:2000});
 custom.exact(22000,10);
 assert.equal(custom.stats().predictorAttempts,0);
 assert.equal(custom.stats().warmStartAttempts,0);
});

test('140.4: explicit opt-in accelerates engineered fields without introducing cached fake solves',()=>{
 for(const atmosphere of profiles)for(const geometry of geometries){
  const standard=fields.create(setup(atmosphere,geometry));
  const experimental=fields.create({...setup(atmosphere,geometry),
   shootingOptimization:'engineered-experimental'});
  const d=[20000,20000+1e-9,20000+2e-9,20000+3e-9,20000+4e-9];
  const h=[10,10.1,10.2,10.15,10.05];
  for(let i=0;i<d.length;i++){
   const a=standard.exact(d[i],h[i]),b=experimental.exact(d[i],h[i]);
   assert.equal(b.status,a.status,atmosphere+' '+geometry);
   if(a.angle!==null){assert.ok(Math.abs(b.angle-a.angle)<2e-8);
    assert.ok(Math.abs(b.residual)<=1e-6);}
  }
  const a=standard.stats(),b=experimental.stats();
  assert.equal(b.solves,a.solves);
  assert.ok(b.predictorAccepted+b.warmStartAccepted>0);
  assert.ok(b.shootEvaluations<a.shootEvaluations,
   'opt-in should reduce integrated shooting evaluations');
  assert.ok(b.shootRK4Calls<a.shootRK4Calls);
  assert.equal(b.warmStartAccepted+b.warmStartMisses,b.warmStartAttempts);
  const previous=experimental.stats();experimental.exact(d[4],h[4]);
  assert.equal(experimental.stats().solves,previous.solves);
  assert.equal(experimental.stats().hits,previous.hits+1);
 }
});

test('140.4: near-grazing test grid preserves the bracket-first branch and contact classification',()=>{
 let accepted=0;
 for(const atmosphere of profiles)for(const geometry of geometries)
  for(const eye of [2,15,100])for(const altitude of [0,1,30]){
   const horizon=atmosphere==='exponential-occlusion'?
    R*Math.acos(Math.exp(-eye/R)):R*Math.acos(R/(R+eye));
   for(const scale of [0.75,0.95,1,1.05,1.25]){
    const d=horizon*scale;
    const o={geometry,radius:R,observerHeight:eye,atmosphere,
     profileOptions:{occlusionRadius:R},target:target(geometry,d,altitude),step:2000};
    const a=projection.solve(o),b=projection.solve({...o,shootingPredictor:true});
    assert.equal(b.status,a.status,JSON.stringify({atmosphere,geometry,eye,altitude,d}));
    if(a.angle!==null){
     assert.ok(b.angle!==null&&Math.abs(b.angle-a.angle)<2e-8,
      JSON.stringify({atmosphere,geometry,eye,altitude,d}));
     assert.ok(Math.abs(b.residual)<= (altitude===0?1e-10:1e-6));
     assert.equal(b.ray.hitGround,a.ray.hitGround);
    }
    accepted+=b.predictorAccepted;
   }
  }
 assert.ok(accepted>30);
});

test('140.4: full optical scene qualification preserves structure and visibility in both geometries',()=>{
 for(const atmosphere of profiles)for(const geometry of geometries){
  const r=benchmark.run({atmosphere,geometry,towers:2,repeats:1});
  assert.equal(r.qualifiedInSample,true,JSON.stringify(r.rows[0].comparison));
  assert.ok(r.summary.predictorAccepted>0);
  assert.ok(r.summary.experimentalTotalShootEvaluations<r.summary.referenceTotalShootEvaluations);
  assert.ok(r.summary.experimentalTotalRK4Calls<r.summary.referenceTotalRK4Calls);
  assert.equal(r.rows[0].reference.solves,r.rows[0].experimental.solves);
 }
});

test('140.4: comparison rejects topology or coordinate divergence rather than silently qualifying',()=>{
 const p={type:'line',mode:'segment',points:[[0,0],[1,1]]};
 const stats={visibleSegments:1,unresolved:0,hiddenLeaves:0,boundaryClipped:0,
  groundHorizon:0,fillTriangles:0,fillUnresolved:0,fillHidden:0};
 const make=(points,type='line')=>({stats,composition:{scene:{primitives:[{...p,type,points}]}}});
 assert.equal(benchmark.compareScenes(make(p.points),make([[0,0],[1,1.0001]])).qualified,false);
 assert.equal(benchmark.compareScenes(make(p.points),make(p.points,'triangle')).qualified,false);
 assert.equal(benchmark.compareScenes(make(p.points),make([[0,0],[1,1.000001]])).qualified,true);
 assert.equal(benchmark.compareScenes(
  {...make(p.points),stats:{...stats,unresolved:1}},
  {...make(p.points),stats:{...stats,unresolved:1}}).qualified,false);
});
