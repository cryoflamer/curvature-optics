'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const conformal=require('../src/diagnostics/CurvatureCpuConformalGlobe141243');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const options={geometry:'globe',radius:R,observerHeight:15,atmosphere:'standard'};

test('surface-matched inverse exponential has a physical effective radius and stable angles',()=>{
  const c=conformal.constants(options);
  assert.ok(Math.abs(c.effectiveRadius-8539056.1523)<0.001);
  assert.ok(Math.abs(c.effectiveRadius/c.R-1.34030076)<1e-7);
  const p=conformal.surfaceTarget(R,25000,10);
  const t=conformal.transform(c,p);
  assert.ok(Math.abs(t.h-10)<1e-7);
  assert.ok(t.X>0);
  const a=conformal.inverseAngle(c,p,c.effectiveRadius);
  assert.equal(a.status,'candidate');
  const b=projection.solve({...options,target:p,step:50,shootingPredictor:true});
  assert.ok(Math.abs(a.angle-b.angle)<1e-6);
  assert.equal(a.groundVerdict,null);
  assert.equal(a.certified,false);
});

test('exact conformal coarse Newton predicts standard Globe RK4 within warm-start tolerances',()=>{
  const c=conformal.constants(options);
  const points=[[1000,20],[3000,20],[10000,20],[25000,10],[25000,40]];
  for(const [x,h] of points){
    const target=conformal.surfaceTarget(R,x,h);
    const q=conformal.conformalCandidate(c,target,{steps:2,corrections:2});
    assert.equal(q.status,'candidate',`${x} ${h} ${q.reason}`);
    const verified=projection.solve({...options,target,step:50,shootingPredictor:true,shootingWarmStartAngle:q.angle});
    const baseline=projection.solve({...options,target,step:50,shootingPredictor:true});
    assert.equal(verified.status,baseline.status);
    assert.equal(!!verified.ray?.hitGround,!!baseline.ray?.hitGround);
    assert.equal(verified.warmStartAccepted,1,`${x} ${h} ${verified.residual}`);
    assert.ok(Math.abs(verified.angle-baseline.angle)<1e-7);
  }
});

test('experimental modes retain unchanged RK4 visibility and ground contact including blocked case',()=>{
  const targets=conformal.stressTargets(R,15);
  const report=conformal.experiment({...options,targets,controls:{step:50}},
    {steps:2,corrections:2,repeats:2});
  assert.equal(report.summary.targets,8);
  assert.equal(report.rounds.length,2);
  assert.equal(report.summary.analyticStatusMismatches,0);
  assert.equal(report.summary.conformalStatusMismatches,0);
  assert.equal(report.summary.conformalGroundMismatches,0);
  assert.ok(report.rows.some(r=>r.cpuStatus==='blocked'));
  assert.ok(report.rows.some(r=>r.conformalFallback));
  assert.equal(report.summary.productionEligible,false);
  assert.ok(report.mediansMs.conformalTotalMs>=0);
  assert.equal(report.rows.every(r=>r.conformalParity.status===false),true);
});

test('full experiment separately reports approximation error and certified speed',()=>{
  const targets=[conformal.surfaceTarget(R,2000,30),conformal.surfaceTarget(R,10000,5)];
  const r=conformal.experiment({...options,targets,controls:{step:100}},
    {steps:2,corrections:2,repeats:2});
  assert.equal(r.rows.length,2);
  assert.ok(r.summary.maxInverseErrorArcseconds>=0);
  assert.ok(r.summary.maxClassicErrorArcseconds>=0);
  assert.ok(r.summary.maxConformalErrorArcseconds>=0);
  assert.equal(r.rounds.length,2);
  assert.ok(Number.isFinite(r.mediansMs.analyticPredictionMs));
  assert.ok(Number.isFinite(r.mediansMs.conformalRK4Ms));
  assert.ok(Number.isFinite(r.mediansMs.conformalTotalMs));
  assert.equal(r.summary.productionEligible,false);
});

test('nonphysical or unsupported atmospheric configurations fail closed',()=>{
  assert.equal(conformal.constants({...options,atmosphere:'vacuum'}),null);
  assert.equal(conformal.constants({...options,geometry:'flat'}),null);
  assert.equal(conformal.constants({...options,profileOptions:{refractivity:0.5}}),null);
  assert.equal(conformal.inverseAngle(conformal.constants(options),[-1,0],8539056).status,'unsupported');
  assert.throws(()=>conformal.experiment({...options,atmosphere:'vacuum',targets:[[100,15]]}),/requires Globe/);
  assert.throws(()=>conformal.conformalCandidate(conformal.constants(options),[1000,1],{steps:0}),/coarse/);
});

test('Modern Compare uses the versioned diagnostic and exports a real-data ZIP',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureCpuConformalGlobe141243\.js\?v=140\.12\.43/);
  assert.match(html,/id="ModernCpuConformalRun"/);
  assert.match(html,/conformal=140\.12\.43/);
  assert.match(js,/runCpuConformalBenchmark141243/);
  assert.match(js,/curvature-compare-140\.12\.43-cpu-f64-conformal-globe\.zip/);
  assert.match(js,/envelope-eye-100m\.csv/);
  assert.match(js,/conformal\.stressTargets/);
  assert.match(js,/sceneSignature/);
});
