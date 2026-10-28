'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/optics/OpticalTargetProjection');
const fields=require('../src/optics/OpticalSharedRayField');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const {atHeight}=require('../tools/benchmark-height-change-120');
const R=6371000;

function target(d,h,geometry){return geometry==='flat'?[d,h]:[
 (R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}

test('123: integrated warm-start ray is checked against exact residual and original ground detector',()=>{
 for(const geometry of ['globe','flat'])
  for(const observerHeight of [2,15,100])
   for(const d of [6000,15000,25000]){
    const opts={geometry,radius:R,observerHeight,atmosphere:'standard',step:2000,
      shootingPredictor:true};
    const a=projection.solve({...opts,target:target(d,0,geometry)});
    const b=projection.solve({...opts,target:target(d,20,geometry)});
    const expected=projection.solve({...opts,target:target(d,10,geometry)});
    assert.ok(Number.isFinite(a.angle)&&Number.isFinite(b.angle)&&Number.isFinite(expected.angle));
    const guess=(a.angle+b.angle)/2;
    const actual=projection.solve({...opts,target:target(d,10,geometry),
      shootingWarmStartAngle:guess});
    assert.equal(actual.status,expected.status,JSON.stringify({geometry,observerHeight,d}));
    assert.equal(actual.warmStartAttempts,1);
    assert.equal(actual.warmStartAccepted+actual.warmStartMisses,1);
    assert.ok(Math.abs(actual.angle-expected.angle)<2e-8);
    assert.ok(Math.abs(actual.residual)<=(10===0?1e-10:1e-6));
    // No warm-start hit is allowed to skip the final ground check.
    assert.equal(actual.ray.hitGround,expected.ray.hitGround);
   }
});

test('123: bad warm guesses fall back to original direction-first exact solver',()=>{
 const opts={geometry:'globe',radius:R,observerHeight:15,
  target:target(22000,20,'globe'),atmosphere:'standard',step:2000,
  shootingPredictor:true};
 const expected=projection.solve(opts);
 const badlyGuessed=projection.solve({...opts,shootingWarmStartAngle:expected.angle+0.01});
 assert.equal(badlyGuessed.warmStartAttempts,1);
 assert.equal(badlyGuessed.warmStartAccepted,0);
 assert.equal(badlyGuessed.warmStartMisses,1);
 assert.equal(badlyGuessed.angle,expected.angle);
 assert.equal(badlyGuessed.status,expected.status);
 const outOfRange=projection.solve({...opts,shootingWarmStartAngle:NaN});
 assert.equal(outOfRange.warmStartAttempts,0);
 assert.equal(outOfRange.angle,expected.angle);
});

test('123: full field cache is unchanged by warm-start switching, and nonstandard atmospheres do not opt in',()=>{
 const setup={geometry:'globe',radius:R,observerHeight:15,
  atmosphere:'standard',step:2000,distances:[5000,30000],heights:[0,65],
  adaptiveDepth:1};
 const cold=fields.create({...setup,shootingWarmStart:false});
 const warm=fields.create(setup);
 const distances=[20000,20000+1e-9,20000+2e-9,20000+3e-9,20000+4e-9];
 const heights=[10,10.1,10.2,10.15,10.05];
 for(let i=0;i<distances.length;i++){
  const a=cold.exact(distances[i],heights[i]),b=warm.exact(distances[i],heights[i]);
  assert.equal(b.status,a.status);
  assert.ok(Math.abs(b.angle-a.angle)<2e-8);
 }
 assert.ok(warm.stats().warmStartAttempts>=3);
 assert.ok(warm.stats().warmStartAccepted>0);
 assert.equal(cold.stats().warmStartAttempts,0);
 const before=warm.stats();warm.exact(distances[4],heights[4]);
 assert.equal(warm.stats().solves,before.solves);
 assert.equal(warm.stats().hits,before.hits+1);
 const inverse=fields.create({...setup,atmosphere:'inverse-spherical',
  profileOptions:{occlusionRadius:R}});
 for(let i=0;i<distances.length;i++)inverse.exact(distances[i],heights[i]);
 assert.equal(inverse.stats().warmStartAttempts,0);
});

test('123: full 85-tower Globe scenes preserve visibility, order and subpixel projected geometry',()=>{
 let savedCalls=0,savedSteps=0,attempts=0,accepted=0;
 for(const h of [15,15.3]){
  const m=atHeight(model(85,'globe'),h),source=compose.composeOpticalMain(m,true);
  const previous=optics.create().transform(source,m,{atmosphere:'standard',
   settings:{shootingWarmStart:false}});
  const optimized=optics.create().transform(source,m,{atmosphere:'standard'});
  const a=previous.stats,b=optimized.stats;
  for(const key of ['visibleSegments','unresolved','hiddenLeaves','boundaryClipped',
    'groundHorizon','fillTriangles','fillUnresolved','fillHidden'])
   assert.equal(b[key],a[key],key+' at '+h);
  const ps=previous.composition.scene.primitives,qs=optimized.composition.scene.primitives;
  assert.equal(qs.length,ps.length);
  let maxDelta=0;
  for(let i=0;i<ps.length;i++){
   const p=ps[i],q=qs[i];
   assert.equal(q.type,p.type);assert.equal(q.mode,p.mode);
   assert.equal(q.points.length,p.points.length);
   for(let j=0;j<p.points.length;j++){
    assert.equal(q.points[j].length,p.points[j].length);
    for(let k=0;k<p.points[j].length;k++)
     maxDelta=Math.max(maxDelta,Math.abs(q.points[j][k]-p.points[j][k]));
   }
  }
  assert.ok(maxDelta<2e-5,'presentation sphere deviated by '+maxDelta+' at '+h);
  const old=a.fieldStats,fast=b.fieldStats;
  for(const key of ['solves','hits','interpolations','fallbacks','points'])
   assert.equal(fast[key],old[key]);
  assert.ok(fast.shootEvaluations<old.shootEvaluations*.85);
  assert.ok(fast.shootRK4Calls<old.shootRK4Calls*.85);
  assert.equal(fast.warmStartAccepted+fast.warmStartMisses,fast.warmStartAttempts);
  assert.equal(fast.warmStartAccepted+fast.predictorAccepted,fast.solves);
  for(const key of ['warmStartAttempts','warmStartAccepted','warmStartMisses']){
   const work=b.opticalWork;
   assert.equal(work.ground[key]+work.outlines[key]+work.fills[key],fast[key]);
  }
  savedCalls+=old.shootEvaluations-fast.shootEvaluations;
  savedSteps+=old.shootRK4Calls-fast.shootRK4Calls;
  attempts+=fast.warmStartAttempts;accepted+=fast.warmStartAccepted;
 }
 assert.ok(savedCalls>5000&&savedSteps>75000);
 assert.ok(attempts>3000&&accepted>2500);
});
