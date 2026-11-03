'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const composition=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
function target(distance,h){return [(R+h)*Math.sin(distance/R),
  (R+h)*Math.cos(distance/R)-R];}
function scenes(){
  return [
    {id:'authored',eye:15,distances:[50,25550],deltas:[297.55,373]},
    {id:'near-ground',eye:2,distances:[50,3500],deltas:[300,400]},
    {id:'horizon',eye:15,distances:[9000,22000],deltas:[700,850]},
    {id:'far-field',eye:100,distances:[25000,65000],deltas:[750,900]}
  ];
}
function config(c){const m=model(2,'globe');m.Height=c.eye;
  m.ObjDist=c.distances.slice();m.ObjDeltaDist=c.deltas.slice();return m;}

test('140.12.49: standard profile removes exactly one redundant exp without changing ray trace',()=>{
  let count=0;
  for(const constants of [{},{refractivity:0.0001,scaleHeight:10000},
      {refractivity:0.0005,scaleHeight:4000}])
    for(const eye of [0,0.2,2,15,100])
      for(const angle of [-0.015,-0.003,-0.00001,0,0.003,0.015]){
        const opts={geometry:'globe',radius:R,observerHeight:eye,angle,
          length:12000,step:1000,eventSubsteps:8,fastClearGround:true};
        const a=rt.trace({...opts,profile:rt.atmosphere('standard',constants)});
        const b=rt.trace({...opts,profile:rt.atmosphere('standard',
          {...constants,experimentalFusedGradient:true})});
        assert.deepEqual(b,a,JSON.stringify({constants,eye,angle}));count++;
      }
  assert.equal(count,90);
});

test('140.12.49: strict Globe shooting remains bitwise-identical at ground, horizon and far targets',()=>{
  let rays=0,contacts=0;
  for(const eye of [0,0.2,2,15,100])
    for(const distance of [50,500,3500,9000,22000,65000,95000])
      for(const h of [0,0.01,1,30,200]){
        const args={geometry:'globe',radius:R,observerHeight:eye,
          target:target(distance,h),atmosphere:'standard',shootingPredictor:true,
          step:2000};
        const a=projection.solve(projection.preparedOptions(args));
        const b=projection.solve(projection.preparedOptions({...args,
          traceOptimization:'fused-gradient'}));
        assert.deepEqual(b,a,JSON.stringify({eye,distance,h}));
        if(a.ray&&a.ray.hitGround)contacts++;
        rays++;
      }
  assert.equal(rays,175);
  assert.ok(contacts>0,'the suite must exercise actual surface contact');
});

test('140.12.49: four actual tower scenes preserve entire painter inputs and classifications',()=>{
  for(const c of scenes()){
    const m=config(c),input=composition.composeOpticalMain(m,true);
    function render(traceOptimization){return optics.create().transform(input,m,
      {atmosphere:'standard',settings:traceOptimization?{traceOptimization}: {}});}
    const a=render(null),b=render('fused-gradient');
    assert.deepEqual(b.composition.scene.primitives,a.composition.scene.primitives,c.id);
    for(const metric of ['sampleStatuses','perGroup','perObject','unresolvedReasons',
       'fieldPrism','fillUnresolvedReasons'])
      assert.deepEqual(b.stats[metric],a.stats[metric],c.id+' '+metric);
    for(const metric of ['visibleSegments','unresolved','hiddenLeaves',
       'boundaryClipped','fillTriangles','fillUnresolved','fillHidden','guideSolves','towerSolves'])
      assert.deepEqual(b.stats[metric],a.stats[metric],c.id+' '+metric);
    assert.equal(b.stats.fieldStats.shootRK4Calls,a.stats.fieldStats.shootRK4Calls,c.id);
    assert.equal(b.stats.fieldStats.shootEvaluations,a.stats.fieldStats.shootEvaluations,c.id);
  }
});

test('140.12.49: non-standard and custom profiles remain outside fused production candidate',()=>{
  const opts={geometry:'globe',radius:R,observerHeight:15,target:target(2000,50),
    shootingPredictor:true,traceOptimization:'fused-gradient'};
  for(const atmosphere of ['vacuum','inverse-spherical','exponential-occlusion']){
    const profileOptions=atmosphere==='vacuum'?undefined:{occlusionRadius:R};
    const a=projection.solve(projection.preparedOptions({...opts,atmosphere,profileOptions,
      traceOptimization:undefined}));
    const b=projection.solve(projection.preparedOptions({...opts,atmosphere,profileOptions}));
    assert.deepEqual(b,a,atmosphere);
  }
  const profile=rt.atmosphere('custom',{n:()=>1.0001,dn:()=>-1e-9});
  const direct=projection.solve({...opts,profile,traceOptimization:undefined});
  const flagged=projection.solve({...opts,profile});
  assert.deepEqual(flagged,direct);
});
