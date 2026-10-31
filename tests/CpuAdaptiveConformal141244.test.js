'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const adaptive=require('../src/diagnostics/CurvatureCpuAdaptiveConformal141244');
const old=require('../src/diagnostics/CurvatureCpuConformalGlobe141243');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const options={geometry:'globe',radius:R,observerHeight:15,atmosphere:'standard',controls:{step:50}};

test('short non-grazing path stays fixed 2-step; no gratuitous step doubling',()=>{
  const c=old.constants(options),target=old.surfaceTarget(R,10000,100);
  for(const mode of ['fixed2','adaptive','richardson']){
    const got=adaptive.adaptiveCandidate(c,target,{mode});
    const reference=old.conformalCandidate(c,target,{steps:2,corrections:2});
    assert.equal(got.status,'candidate');
    assert.equal(got.stepsUsed,2);
    assert.deepEqual(got.evaluatedLevels,[2]);
    assert.equal(got.angle,reference.angle);
    assert.equal(got.certified,false);
    assert.equal(got.groundVerdict,null);
  }
});

test('adaptive Richardson recovers long and surface stress candidates without changing RK4 solver',()=>{
  for(const eye of [15,100]){
    const req={...options,observerHeight:eye,targets:old.envelopeTargets(R)};
    const result=adaptive.experiment(req,{repeats:1});
    assert.equal(result.summary.targets,20);
    assert.equal(result.summary.productionEligible,false);
    assert.equal(result.summary.fixed2.warmAccepted,10);
    assert.ok(result.summary.adaptive.warmAccepted>=17);
    assert.ok(result.summary.richardson.warmAccepted>=18);
    for(const mode of ['fixed2','adaptive','richardson']){
      assert.equal(result.summary[mode].statusMismatches,0);
      assert.equal(result.summary[mode].groundMismatches,0);
      assert.equal(result.summary[mode].angleMismatches,0);
    }
    assert.ok(result.rows.some(r=>r.cpuStatus==='blocked'));
    assert.ok(result.rows.some(r=>r.richardsonFallback));
    assert.ok(result.rows.some(r=>r.richardsonSteps===16));
    assert.ok(result.rows.some(r=>r.richardsonExtrapolationRadians!==0));
    assert.ok(result.mediansMs.richardsonTotalMs>=0);
  }
});

test('same strict Globe RK4 checks are invoked for the candidate angle, with fallback intact',()=>{
  const c=old.constants(options);
  const target=old.surfaceTarget(R,100000,500);
  const q=adaptive.adaptiveCandidate(c,target,{mode:'richardson'});
  assert.equal(q.status,'candidate');
  const verified=projection.solve({...options,...options.controls,target,
    shootingPredictor:true,shootingWarmStartAngle:q.angle});
  const baseline=projection.solve({...options,...options.controls,target,shootingPredictor:true});
  assert.equal(verified.status,baseline.status);
  assert.equal(!!verified.ray?.hitGround,!!baseline.ray?.hitGround);
  assert.equal(verified.warmStartAccepted,1);
  assert.ok(Math.abs(verified.angle-baseline.angle)<1e-7);
});

test('invalid modes/thresholds and unsupported physical model fail closed',()=>{
  const c=old.constants(options),target=old.surfaceTarget(R,10000,15);
  assert.throws(()=>adaptive.adaptiveCandidate(c,target,{mode:'fake'}),/Invalid adaptive/);
  assert.throws(()=>adaptive.adaptiveCandidate(c,target,{angularResidualMetres:-1}),/Invalid adaptive/);
  assert.throws(()=>adaptive.experiment({...options,atmosphere:'vacuum',targets:[target]}),/Globe standard/);
  assert.throws(()=>adaptive.experiment({...options,targets:[]}),/Invalid adaptive/);
  assert.throws(()=>adaptive.experiment({...options,targets:[target]},{repeats:0}),/Invalid adaptive/);
});

test('diagnostic Modern Compare integration exports actual physical target data in ZIP',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureCpuConformalGlobe141243\.js\?v=140\.12\.43/);
  assert.match(html,/CurvatureCpuAdaptiveConformal141244\.js\?v=140\.12\.44/);
  assert.match(html,/id="ModernCpuAdaptiveConformalRun"/);
  assert.match(html,/adaptiveConformal=140\.12\.44/);
  assert.match(js,/runCpuAdaptiveConformalBenchmark141244/);
  assert.match(js,/curvature-compare-140\.12\.44-cpu-f64-adaptive-conformal\.zip/);
  assert.match(js,/adaptive\.stressTargets/);
  assert.match(js,/adaptive\.envelopeTargets/);
  assert.match(js,/sceneSignature/);
  assert.match(js,/richardsonTotalMs/);
});
