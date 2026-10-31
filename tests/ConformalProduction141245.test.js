'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fields=require('../src/optics/OpticalSharedRayField');
const projected=require('../src/optics/OpticalTargetProjection');
const predictor=require('../src/optics/OpticalConformalPredictor');
const diagnostic=require('../src/diagnostics/CurvatureCpuAdaptiveConformal141244');
const R=6371000;
function makeField(overrides={}){
  return fields.create({geometry:'globe',radius:R,observerHeight:15,
    atmosphere:'standard',step:500,distances:[1000,5000,10000],
    heights:[0,15,100],adaptiveDepth:0,...overrides});
}
test('production default and explicit non-conformal modes do not generate candidates',()=>{
  for(const flag of [undefined,false,'engineered-experimental']){
    const field=makeField({shootingOptimization:flag});
    const got=field.exact(8000,100);
    assert.equal(got.status,'visible');
    const stats=field.stats();
    assert.equal(stats.conformalAttempts,0);
    assert.equal(stats.conformalCandidates,0);
  }
  const flat=makeField({geometry:'flat',shootingOptimization:'conformal-experimental'});
  flat.exact(8000,100);
  assert.equal(flat.stats().conformalAttempts,0);
  const custom=makeField({atmosphere:'exponential-occlusion',
    profileOptions:{occlusionRadius:R},shootingOptimization:'conformal-experimental'});
  custom.exact(8000,100);
  assert.equal(custom.stats().conformalAttempts,0);
});
test('production opt-in uses identical candidate as benchmark; strict RK4 parity and fallback',()=>{
  const baseline=makeField(),experimental=makeField({shootingOptimization:'conformal-experimental'});
  const cases=[[3000,0],[3000,20],[3000,100],[8000,0],[8000,20],[8000,100],
    [10000,0],[10000,15],[10000,100]];
  for(const [d,h] of cases){
    const a=baseline.exact(d,h),b=experimental.exact(d,h);
    assert.equal(a.status,b.status,`status for ${d}/${h}`);
    if(Number.isFinite(a.angle)&&Number.isFinite(b.angle))
      assert.ok(Math.abs(a.angle-b.angle)<=1e-7,`angle ${d}/${h}: ${a.angle} vs ${b.angle}`);
  }
  const stats=experimental.stats();
  assert.equal(stats.conformalAttempts,cases.length);
  assert.equal(stats.conformalCandidates,cases.length);
  assert.ok(stats.conformalWarmAccepted>0);
  assert.ok(stats.conformalGradientCalls>0);
  assert.ok(stats.conformalPredictionMs>=0);
  const options={geometry:'globe',radius:R,observerHeight:15,atmosphere:'standard'};
  const c=predictor.constants(options),target=predictor.transform(c,[10000,100]);
  assert.ok(target);
  const q=predictor.adaptiveCandidate(c,[10000,100],{mode:'richardson'});
  const previous=diagnostic.adaptiveCandidate(c,[10000,100],{mode:'richardson'});
  assert.deepEqual(q,previous);
  assert.equal(q.certified,false);
  assert.equal(q.groundVerdict,null);
});
test('actual strict Globe RK4 remains the sole contact classifier for opt-in warm angles',()=>{
  const base={geometry:'globe',radius:R,observerHeight:15,atmosphere:'standard',step:500,
    shootingPredictor:true};
  const c=predictor.constants(base);
  for(const d of [10000,50000,100000])for(const h of [0,100,500]){
    const theta=d/R,p=[(R+h)*Math.sin(theta),(R+h)*Math.cos(theta)-R];
    const candidate=predictor.adaptiveCandidate(c,p,{mode:'richardson'});
    const normal=projected.solve({...base,target:p});
    const enabled=projected.solve({...base,target:p,
      ...(candidate.status==='candidate'?{shootingWarmStartAngle:candidate.angle}:{})});
    assert.equal(enabled.status,normal.status,`status ${d},${h}`);
    assert.equal(!!enabled.ray?.hitGround,!!normal.ray?.hitGround,`ground ${d},${h}`);
    if(Number.isFinite(normal.angle)&&Number.isFinite(enabled.angle))
      assert.ok(Math.abs(normal.angle-enabled.angle)<1e-7,`angle ${d},${h}`);
  }
});
test('Modern Compare explicit opt-in and genuine full-frame PNG ZIP wiring',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const field=fs.readFileSync(path.join(__dirname,'../src/optics/OpticalSharedRayField.js'),'utf8');
  assert.match(html,/OpticalConformalPredictor\.js\?v=140\.12\.45/);
  assert.match(html,/id="ModernConformalProductionToggle" type="checkbox"/);
  assert.match(html,/id="ModernConformalFrameParityRun"/);
  assert.match(js,/function runConformalFrameParity141245/);
  assert.match(js,/renderer\.renderPhysical\(graphs\.A,model/);
  assert.match(js,/renderer\.renderPhysical\(graphs\.B,model/);
  assert.match(js,/baseline-real-frame\.png/);
  assert.match(js,/conformal-real-frame\.png/);
  assert.match(js,/pixel-difference\.png/);
  assert.match(js,/compareAdapter\.compareFramePixels\(imageA,imageB\)/);
  assert.match(js,/shootingOptimization:'conformal-experimental'/);
  assert.match(field,/conformal\.adaptiveCandidate\(conformalConstants,shootOpts\.target/);
});
