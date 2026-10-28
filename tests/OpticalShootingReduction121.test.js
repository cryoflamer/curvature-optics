'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const {atHeight}=require('../tools/benchmark-height-change-120');
const R=6371000;

// This tests the shortcut in isolation: no change to the ground event,
// travelled distance, path state or contact classification is permitted.
test('121: proven-clear standard ray steps preserve full ground event results',()=>{
  const profile=rt.atmosphere('standard');
  let skipped=0,checked=0;
  for(const geometry of ['globe','flat'])
    for(const height of [0,0.2,2,15,100])
      for(const angle of [-0.1,-0.025,-0.005,-0.0001,0,0.002,0.01,0.05]){
        const setup={geometry,radius:R,profile,observerHeight:height,angle,
          length:40000,step:2000,eventSubsteps:8};
        const reference=rt.trace(setup);
        const optimized=rt.trace({...setup,fastClearGround:true});
        assert.equal(optimized.hitGround,reference.hitGround,JSON.stringify({geometry,height,angle}));
        assert.equal(optimized.termination,reference.termination);
        assert.deepEqual(optimized.event,reference.event);
        for(const key of ['x','z','angle','height','travelled'])
          assert.equal(optimized[key],reference[key],key+' '+JSON.stringify({geometry,height,angle}));
        skipped+=optimized.fastGroundSkips;
        checked+=optimized.fullGroundChecks;
      }
  assert.ok(skipped>100,'a large number of full event searches must be avoided');
  assert.ok(checked>0,'potentially contacting paths must retain the original detector');
});

test('121: guarded shooting predictor matches the original high-accuracy target oracle',()=>{
  let accepted=0,attemptsOld=0,attemptsNew=0;
  for(const geometry of ['globe','flat'])
    for(const height of [2,15,100])
      for(const distance of [300,1500,8000,14000,22000,40000])
        for(const altitude of [0,1,10,30,100]){
          const target=geometry==='flat'?[distance,altitude]:
            [(R+altitude)*Math.sin(distance/R),(R+altitude)*Math.cos(distance/R)-R];
          const opts={geometry,radius:R,observerHeight:height,target,
            atmosphere:'standard',step:2000};
          const reference=projection.solve(opts);
          const optimized=projection.solve({...opts,shootingPredictor:true});
          assert.equal(optimized.status,reference.status,
            'Visibility status changed: '+JSON.stringify({geometry,height,distance,altitude}));
          if(reference.angle!==null){
            assert.ok(Math.abs(optimized.angle-reference.angle)<2e-8,
              'Arrival angle changed too much: '+JSON.stringify({geometry,height,distance,altitude}));
            assert.ok(Math.abs(optimized.residual) <= (altitude===0?1e-8:1e-6),
              'Predicted ray missed the original shooting tolerance');
          }
          accepted+=optimized.predictorAccepted||0;
          attemptsOld+=reference.evaluations;
          attemptsNew+=optimized.evaluations;
        }
  assert.ok(accepted>30,'typical standard rays should accept the verified predictor');
  assert.ok(attemptsNew<attemptsOld*.9,'predictor should avoid full shooting attempts');
});

test('121: nonlinear standard rays fall back to the original bracket rather than guessed angles',()=>{
  const opts={geometry:'flat',radius:R,observerHeight:15,target:[40000,30],
    atmosphere:'standard',profileOptions:{refractivity:0.000293,scaleHeight:1000},step:500};
  const reference=projection.solve(opts);
  const optimized=projection.solve({...opts,shootingPredictor:true});
  assert.equal(optimized.predictorFallbacks,1);
  assert.ok(optimized.predictorAttempts>0);
  assert.equal(optimized.predictorAccepted,0);
  assert.equal(optimized.status,reference.status);
  assert.equal(optimized.angle,reference.angle,'fallback must return original bracketed result');
});

test('121: full Globe/Standard scene preserves physical fragments, statuses and sub-pixel angles',()=>{
  const eyeHeights=[15,15.3];
  for(const h of eyeHeights){
    const m=atHeight(model(85,'globe'),h);
    const c=composition.composeOpticalMain(m,true);
    const base=optics.create().transform(c,m,{atmosphere:'standard',
      settings:{shootingOptimization:false}});
    const fast=optics.create().transform(c,m,{atmosphere:'standard'});
    const a=base.stats,b=fast.stats;
    for(const key of ['visibleSegments','unresolved','hiddenLeaves','boundaryClipped',
      'groundHorizon','fillTriangles','fillUnresolved','fillHidden'])
      assert.equal(b[key],a[key],key+' '+h);
    const reference=base.composition.scene.primitives;
    const improved=fast.composition.scene.primitives;
    assert.equal(improved.length,reference.length);
    let maxDelta=0;
    for(let i=0;i<reference.length;i++){
      const p=reference[i],q=improved[i];
      assert.equal(q.type,p.type,'primitive type '+i);
      assert.equal(q.mode,p.mode,'primitive mode '+i);
      assert.equal(q.points.length,p.points.length,'primitive vertices '+i);
      for(let j=0;j<p.points.length;j++){
        assert.equal(q.points[j].length,p.points[j].length);
        for(let k=0;k<p.points[j].length;k++)
          maxDelta=Math.max(maxDelta,Math.abs(q.points[j][k]-p.points[j][k]));
      }
    }
    // These arrival points use the common 1,000 m presentation sphere. The
    // bound here represents < 0.00004 px at 1920px / 60deg, NOT an assertion
    // about the continuous optical curve or near-horizon global completeness.
    assert.ok(maxDelta<2e-5,'screen arrival points diverged: '+maxDelta);
    const ref=b.fieldStats,old=a.fieldStats;
    assert.equal(ref.solves,old.solves);
    assert.equal(ref.interpolations,old.interpolations);
    assert.equal(ref.fallbacks,old.fallbacks);
    assert.ok(ref.shootEvaluations<old.shootEvaluations*.8);
    assert.ok(ref.shootRK4Calls<old.shootRK4Calls*.8);
    assert.equal(ref.predictorAccepted,ref.solves);
    assert.equal(ref.predictorFallbacks,0);
    assert.ok(ref.clearGroundSteps>0);
    assert.ok(ref.fullGroundEventSteps>0);
  }
});

test('121: nonstandard atmosphere uses the original shooting and event path',()=>{
  const m=model(2,'flat'),c=composition.composeOpticalMain(m,false);
  const r=optics.create().transform(c,m,{atmosphere:'inverse-spherical'});
  assert.equal(r.stats.fieldStats.predictorAttempts,0);
  assert.equal(r.stats.fieldStats.clearGroundSteps,0);
  assert.ok(r.stats.fieldStats.shootEvaluations>0);
});
