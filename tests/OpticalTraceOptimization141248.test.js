'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const fields=require('../src/optics/OpticalSharedRayField');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const {atHeight}=require('../tools/benchmark-height-change-120');
const R=6371000;

function standard(fused){return rt.atmosphere('standard',fused?{experimentalFusedGradient:true}:{});}
function target(geometry,d,h){return geometry==='flat'?[d,h]:
  [(R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}

// A shared exponential must preserve *both* the integrator's recurrence and
// exact ground-event results: neither the branch nor the contact point can
// change because of an optimisation intended to remove duplicate Math.exp.
test('140.12.48: fused exponential derivative is bitwise-equivalent in RK4 tracing',()=>{
  let seen=0;
  for(const geometry of ['globe','flat'])
    for(const eye of [0,0.2,2,15,100])
      for(const angle of [-0.025,-0.003,-0.0001,0,0.002,0.04])
        for(const step of [50,2000]){
          const setup={geometry,radius:R,observerHeight:eye,angle,
            length:5000,step,eventSubsteps:8,fastClearGround:true};
          const baseline=rt.trace({...setup,profile:standard(false)});
          const fused=rt.trace({...setup,profile:standard(true)});
          const scalar=rt.trace({...setup,profile:rt.atmosphere('standard',
            {experimentalFusedGradient:true,experimentalScalarRK4:true})});
          for(const variant of [fused,scalar]){
            for(const field of ['x','z','angle','height','hitGround','travelled','termination'])
              assert.equal(variant[field],baseline[field],field+JSON.stringify(setup));
            assert.deepEqual(variant.event,baseline.event);
          }
          seen++;
        }
  assert.ok(seen>=100);
});

test('140.12.48: conservative preflight skips work without changing ray contact or outcome',()=>{
  let skips=0,uncertain=0;
  for(const geometry of ['globe','flat'])
    for(const eye of [0,0.2,2,15,100])
      for(const angle of [-0.025,-0.003,-0.0001,0,0.002,0.04])
        for(const step of [50,500,2000]){
          const setup={geometry,radius:R,observerHeight:eye,angle,
            length:10000,step,eventSubsteps:8,fastClearGround:true,profile:standard(true)};
          const baseline=rt.trace(setup);
          const preflight=rt.trace({...setup,preflightClearGround:true});
          for(const field of ['x','z','angle','height','hitGround','travelled','termination',
             'fullGroundChecks','fastGroundSkips'])
            assert.equal(preflight[field],baseline[field],field+JSON.stringify(setup));
          assert.deepEqual(preflight.event,baseline.event);
          skips+=preflight.preflightGroundSkips;
          uncertain+=preflight.fullGroundChecks;
        }
  assert.ok(skips>30,'some clear segments must avoid the chord test');
  assert.ok(uncertain>0,'near-ground segments must still use the original event detector');
});

test('140.12.48: strict target shooting and opaque ground statuses remain unchanged',()=>{
  let accepted=0;
  for(const geometry of ['globe','flat'])
    for(const eye of [0,15,100])
      for(const distance of [200,1500,10000,40000])
        for(const h of [0,1,30,200]){
          const options={geometry,radius:R,observerHeight:eye,
            target:target(geometry,distance,h),atmosphere:'standard',shootingPredictor:true,
            step:2000};
          const baseline=projection.solve(projection.preparedOptions(options));
          for(const traceOptimization of ['fused-gradient','fused-preflight','scalar-rk4']){
            const variant=projection.solve(projection.preparedOptions({...options,traceOptimization}));
            assert.equal(variant.status,baseline.status,JSON.stringify({geometry,eye,distance,h,traceOptimization}));
            assert.equal(variant.angle,baseline.angle);
            assert.equal(variant.residual,baseline.residual);
            assert.equal(variant.shootRK4Calls,baseline.shootRK4Calls);
            if(baseline.ray){
              for(const field of ['x','z','angle','height','hitGround','travelled'])
                assert.equal(variant.ray[field],baseline.ray[field],field);
              assert.deepEqual(variant.ray.event,baseline.ray.event);
            }
            accepted++;
          }
        }
  assert.ok(accepted>100);
});

test('140.12.48: custom profiles cannot spoof the private standard-gradient opt-in',()=>{
  const custom={n:h=>1.0003+1e-8*h,dn:h=>1e-8,
    fusedGradient:()=>{throw Error('custom marker must not activate the fast path');},
    scalarRK4:true};
  const base={geometry:'flat',observerHeight:100,angle:0.002,length:1000,step:25,
    profile:custom};
  const result=rt.trace(base);
  assert.ok(result.x>900);
  assert.ok(Number.isFinite(result.height));
});

test('140.12.48: experimental modes require explicit standard atmosphere',()=>{
  const options={geometry:'globe',radius:R,observerHeight:15,
    distances:[1000,2000],heights:[0,20],step:2000};
  const baseline=fields.create({...options,atmosphere:'standard'});
  const fused=fields.create({...options,atmosphere:'standard',traceOptimization:'fused-gradient'});
  const preflight=fields.create({...options,atmosphere:'standard',traceOptimization:'fused-preflight'});
  const scalar=fields.create({...options,atmosphere:'standard',traceOptimization:'scalar-rk4'});
  for(const h of [0,20]){
    const a=baseline.exact(1000,h),b=fused.exact(1000,h),c=preflight.exact(1000,h);
    assert.deepEqual(b,a);assert.deepEqual(c,a);
    assert.deepEqual(scalar.exact(1000,h),a);
  }
  assert.equal(baseline.stats().preflightGroundSteps,0);
  assert.equal(fused.stats().preflightGroundSteps,0);
  assert.ok(preflight.stats().preflightGroundSteps>0);
  const inv=fields.create({...options,atmosphere:'inverse-spherical',
    profileOptions:{occlusionRadius:R},traceOptimization:'fused-preflight'});
  assert.equal(inv.stats().preflightGroundSteps,0);
  // A custom profile must not be silently replaced by a standard exponential.
  const custom=fields.create({...options,profile:rt.atmosphere('vacuum'),traceOptimization:'fused-preflight'});
  custom.exact(1000,10);
  assert.equal(custom.stats().preflightGroundSteps,0);
});

test('140.12.48: whole physical scene keeps exact geometric classification',()=>{
  const m=atHeight(model(2,'globe'),15);
  const composed=composition.composeOpticalMain(m,true);
  const render=mode=>optics.create().transform(composed,m,{atmosphere:'standard',
    settings:mode?{traceOptimization:mode}:{}});
  const base=render(null),fused=render('fused-gradient'),
    preflight=render('fused-preflight'),scalar=render('scalar-rk4');
  for(const variant of [fused,preflight,scalar]){
    for(const k of ['visibleSegments','unresolved','hiddenLeaves','boundaryClipped',
      'fillTriangles','fillUnresolved','fillHidden'])
      assert.equal(variant.stats[k],base.stats[k],k);
    assert.deepEqual(variant.composition.scene.primitives,base.composition.scene.primitives);
  }
  assert.ok(preflight.stats.fieldStats.preflightGroundSteps>0);
});
