'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const predictor=require('../src/optics/OpticalConformalPredictor');
const previous=require('../src/diagnostics/CurvatureCpuConformalGlobe141243');
const profile=require('../src/diagnostics/CurvatureConformalProfile141246');
const fields=require('../src/optics/OpticalSharedRayField');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const controls={geometry:'globe',radius:R,atmosphere:'standard',step:500,shootingPredictor:true};
function makeField(engine){return fields.create({...controls,observerHeight:15,
  distances:[1000,5000,25000,100000],heights:[0,15,100,500],adaptiveDepth:0,
  shootingOptimization:engine});}

test('reference, gradient-only, scalar RK4: numerical candidate parity over stressed 15/100 m eyes',()=>{
  for(const eye of [15,100]){
    const c=predictor.constants({...controls,observerHeight:eye});
    for(const target of previous.envelopeTargets(R).concat(previous.stressTargets(R,eye))){
      const reference=predictor.adaptiveCandidate(c,target,{mode:'richardson',engine:'reference'});
      for(const engine of ['gradient','fast']){
        const candidate=predictor.adaptiveCandidate(c,target,{mode:'richardson',engine});
        assert.equal(candidate.status,reference.status,`${engine} status ${target}`);
        assert.equal(candidate.stepsUsed,reference.stepsUsed,`${engine} steps ${target}`);
        assert.deepEqual(candidate.evaluatedLevels,reference.evaluatedLevels);
        assert.equal(candidate.coarseCalls,reference.coarseCalls);
        if(reference.status==='candidate'){
          assert.ok(Math.abs(candidate.angle-reference.angle)<1e-12,
            `${engine} launch angle drift ${target}`);
          assert.equal(candidate.certified,false);
          assert.equal(candidate.groundVerdict,null);
        }
      }
    }
  }
});

test('strict original RK4 retains all ground/blocked decisions for all candidate engines',()=>{
  const c=predictor.constants({...controls,observerHeight:15}),
    targets=previous.envelopeTargets(R);
  for(const target of targets){
    const original=projection.solve({...controls,observerHeight:15,target});
    for(const engine of ['reference','gradient','fast']){
      const q=predictor.adaptiveCandidate(c,target,{mode:'richardson',engine});
      const got=projection.solve({...controls,observerHeight:15,target,
        ...(q.status==='candidate'?{shootingWarmStartAngle:q.angle}:{})});
      assert.equal(got.status,original.status,`${engine} status ${target}`);
      assert.equal(!!got.ray?.hitGround,!!original.ray?.hitGround,`${engine} ground ${target}`);
      if(Number.isFinite(got.angle)&&Number.isFinite(original.angle))
        assert.ok(Math.abs(got.angle-original.angle)<1e-7,`${engine} angle ${target}`);
    }
  }
});

test('production field modes are explicitly opt-in, with unchanged strict solver and stats',()=>{
  const baseline=makeField(undefined),reference=makeField('conformal-reference'),
    gradient=makeField('conformal-gradient'),fast=makeField('conformal-experimental');
  for(const [d,h] of [[1000,0],[1000,15],[10000,100],[25000,15],[50000,500],
    [100000,0],[100000,500]]){
    const a=baseline.exact(d,h);
    for(const f of [reference,gradient,fast]){
      const b=f.exact(d,h);
      assert.equal(b.status,a.status,`field ${d}/${h}`);
      if(Number.isFinite(b.angle)&&Number.isFinite(a.angle))
        assert.ok(Math.abs(a.angle-b.angle)<1e-7,`field ${d}/${h}`);
    }
  }
  assert.equal(baseline.stats().conformalAttempts,0);
  for(const f of [reference,gradient,fast]){
    assert.equal(f.stats().conformalAttempts,7);
    assert.ok(f.stats().conformalGradientCalls>0);
  }
  for(const flag of ['conformal-gradient','conformal-reference','conformal-experimental']){
    const flat=fields.create({geometry:'flat',radius:R,observerHeight:15,atmosphere:'standard',
      shootingOptimization:flag,distances:[1000,2000],heights:[0,30]});
    flat.exact(1500,15);
    assert.equal(flat.stats().conformalAttempts,0);
  }
});

test('scene-exact request profiler exposes attributable stages and parity, without images',()=>{
  const actual=[[1000,0],[1000,15],[5000,100],[10000,0],[25000,15],[50000,500],[100000,0]];
  const data=profile.benchmark(actual,{radius:R,observerHeight:15,rounds:2,iterations:2});
  assert.equal(data.version,'140.12.46');
  assert.equal(data.capturedCount,actual.length);
  assert.equal(data.validSampleCount,actual.length);
  for(const key of ['gradientReference','gradientFast','rk4Reference','rk4Gradient',
    'rk4Fast','candidateReference','candidateGradient','candidateFast']){
    assert.equal(data.samplesMs[key].length,2);
    assert.ok(data.mediansMs[key]>=0);
  }
  assert.equal(data.parity.statusMismatches,0);
  assert.equal(data.parity.stepMismatches,0);
  assert.ok(data.parity.maxCandidateAngleDeltaRadians<1e-12);
  assert.throws(()=>profile.benchmark(actual,{radius:R,observerHeight:15,rounds:0}),/Invalid/);
  assert.throws(()=>predictor.adaptiveCandidate(predictor.constants({...controls,observerHeight:15}),
    previous.surfaceTarget(R,1000,10),{engine:'unknown'}),/Invalid conformal integrator/);
});

test('Compare audit rotates eight timed rounds, preserves old audit, exports real frames',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureConformalProfile141246\.js\?v=140\.12\.46/);
  assert.match(html,/ModernConformalProfile141246Run/);
  assert.match(html,/conformalProfile=140\.12\.46/);
  assert.match(ui,/runConformalFrameProfile141246/);
  assert.match(ui,/rounds=8,warmups=1/);
  assert.match(ui,/shift=round%modes\.length/);
  assert.match(ui,/cacheSession:optics\.create\(\)/);
  assert.match(ui,/profile[r]?\.benchmark\(captured/);
  assert.match(ui,/onExactTarget=function\(d,h\)\{captured\.push\(\[d,h\]\);\}/);
  assert.match(ui,/reference-real-frame\.png/);
  assert.match(ui,/fast-real-frame\.png/);
  assert.match(ui,/reference-vs-fast-diff\.png/);
  assert.match(ui,/function runConformalFrameParity141245/);
  assert.match(html,/id="ModernConformalProductionToggle" type="checkbox"/);
});
