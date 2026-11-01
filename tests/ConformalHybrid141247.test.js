'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fields=require('../src/optics/OpticalSharedRayField');
const projection=require('../src/optics/OpticalTargetProjection');
const predictor=require('../src/optics/OpticalConformalPredictor');
const previous=require('../src/diagnostics/CurvatureCpuConformalGlobe141243');
const R=6371000;
const settings={geometry:'globe',radius:R,atmosphere:'standard',observerHeight:15,
  step:500,shootingPredictor:true};
function field(extra={}){return fields.create({...settings,
  distances:[1000,5000,25000,100000],heights:[0,15,100,500],
  adaptiveDepth:0,...extra});}

test('late candidate never runs before the inexpensive predictor succeeds, and never replaces certification',()=>{
  const target=previous.surfaceTarget(R,8000,100);
  const original=projection.solve({...settings,target,profileShootingStages:true});
  let invoked=0;
  const same=projection.solve({...settings,target,profileShootingStages:true,
    shootingLateWarmStart:()=>{invoked++;return 0;}});
  assert.equal(original.status,'visible');
  assert.equal(same.status,original.status);
  assert.equal(invoked,0);
  assert.equal(same.lateWarmAttempts,0);
  assert.equal(same.shootingStages.rk4.direction+same.shootingStages.rk4.predictor,
    same.shootRK4Calls);
  const noProfiling=projection.solve({...settings,target});
  assert.equal(noProfiling.shootingStages,undefined);
});

test('late proposal is never trusted, out-of-range / exception / wrong candidate falls back',()=>{
  const target=previous.surfaceTarget(R,100000,0);
  const baseline=projection.solve({...settings,target,profileShootingStages:true});
  const invalid=projection.solve({...settings,target,
    shootingLateWarmStart:()=>{throw Error('diagnostic unavailable');}});
  const huge=projection.solve({...settings,target,shootingLateWarmStart:()=>2});
  for(const v of [invalid,huge]){
    assert.equal(v.status,baseline.status);
    assert.equal(!!v.ray?.hitGround,!!baseline.ray?.hitGround);
    assert.equal(v.lateWarmAttempts,0);
  }
  let invoked=0;
  const wrong=projection.solve({...settings,target,profileShootingStages:true,
    shootingLateWarmStart:()=>{invoked++;return Math.atan2(target[1]-15,target[0]);}});
  if(invoked){
    assert.equal(wrong.lateWarmAttempts,1);
    assert.equal(wrong.lateWarmAccepted,0);
    assert.equal(wrong.lateWarmMisses,1);
    assert.ok(wrong.shootingStages.rk4.late>0);
  }
  assert.equal(wrong.status,baseline.status);
});

test('a cheap failure can be rescued by a late RK4-certified angle',()=>{
  const target=previous.surfaceTarget(R,100000,0);
  const initial=projection.solve({...settings,target});
  assert.equal(initial.predictorFallbacks,1);
  assert.ok(Number.isFinite(initial.angle));
  let calls=0;
  const rescued=projection.solve({...settings,target,profileShootingStages:true,
    shootingLateWarmStart:()=>{calls++;return initial.angle;}});
  assert.equal(calls,1);
  assert.equal(rescued.lateWarmAttempts,1);
  assert.equal(rescued.lateWarmAccepted,1);
  assert.equal(rescued.lateWarmMisses,0);
  assert.equal(rescued.status,initial.status);
  assert.equal(!!rescued.ray?.hitGround,!!initial.ray?.hitGround);
  assert.ok(rescued.shootRK4Calls>0);
  assert.equal(Object.values(rescued.shootingStages.rk4).reduce((a,b)=>a+b,0),
    rescued.shootRK4Calls);
});

test('actual hybrid and baseline agree on stressed and ground target physics at 15 and 100 m',()=>{
  for(const eye of [15,100]){
    const normal=field({observerHeight:eye});
    const hybrid=field({observerHeight:eye,shootingOptimization:'conformal-hybrid',
      profileShootingStages:true});
    for(const target of previous.envelopeTargets(R).concat(previous.stressTargets(R,eye))){
      const d=R*Math.atan2(target[0],target[1]+R);
      const h=Math.hypot(target[0],target[1]+R)-R;
      const base=normal.exact(d,Math.max(0,Math.round(h*1e7)/1e7));
      const got=hybrid.exact(d,Math.max(0,Math.round(h*1e7)/1e7));
      assert.equal(got.status,base.status,`eye=${eye},d=${d},h=${h}`);
      if(Number.isFinite(got.angle)&&Number.isFinite(base.angle))
        assert.ok(Math.abs(got.angle-base.angle)<1e-7,`angle eye=${eye},d=${d},h=${h}`);
    }
    const stats=hybrid.stats();
    assert.equal(stats.hybridLateAttempts,stats.hybridLateAccepted+stats.conformalFallbacks);
    assert.ok(stats.conformalAttempts>=stats.hybridLateAttempts);
    assert.ok(stats.conformalPredictionMs>=0);
    assert.equal(Object.values(stats.shootingStageRK4).reduce((a,b)=>a+b,0),
      stats.shootRK4Calls);
    assert.equal(Object.values(stats.shootingStageEvaluations).reduce((a,b)=>a+b,0),
      stats.shootEvaluations);
  }
});

test('hybrid is explicitly opt-in, and unsupported optical profiles never invoke conformal',()=>{
  const regular=field(),hybrid=field({shootingOptimization:'conformal-hybrid'});
  regular.exact(8000,20);hybrid.exact(8000,20);
  assert.equal(regular.stats().conformalAttempts,0);
  assert.equal(hybrid.stats().shootingStageMs.direction,undefined);
  for(const config of [{geometry:'flat'},{atmosphere:'vacuum'},
    {atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R}}]){
    const f=field({...config,shootingOptimization:'conformal-hybrid'});
    f.exact(8000,20);
    assert.equal(f.stats().conformalAttempts,0);
    assert.equal(f.stats().hybridLateAttempts,0);
  }
});

test('Compare UI provides hot rotated full-frame hybrid ZIP and true pixel comparison',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/ModernHybridShooting141247Run/);
  assert.match(ui,/function runHybridShootingAudit141247/);
  assert.match(ui,/modes=\['baseline','hybrid','conformal'\]/);
  assert.match(ui,/rounds=8,warmups=1/);
  assert.match(ui,/shift=r%modes.length/);
  assert.match(ui,/cacheSession:optics.create\(\)/);
  assert.match(ui,/compareAdapter\.compareFramePixels\(frames\.baseline,frames\[mode\]\)/);
  assert.match(ui,/hybrid-real-frame\.png/);
  assert.match(ui,/baseline-vs-hybrid-diff\.png/);
  assert.match(ui,/shootingStageMs/);
  assert.match(ui,/conformal-hybrid/);
  assert.match(ui,/profileShootingStages:true/);
  assert.match(ui,/productionDefaultUnchanged:true/);
  assert.match(ui,/state\.probeBusy=true;button\.disabled=true/);
});
