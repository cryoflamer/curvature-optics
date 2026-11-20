'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fit=require('../src/calibration/CameraPhysicalFit');
const {model,observations,options}=require('./fixtures/soundly-mixed-calibration.json');
test('Soundly mixed material/legacy correspondences start a physical fit',()=>{
  const before=JSON.stringify({model,observations,options});
  const initial=fit.evaluate(model,model,observations,options);
  assert.equal(initial.valid,true,JSON.stringify(initial.points.filter(p=>!p.residual)));
  assert.equal(initial.points.length,14);
  assert.equal(initial.points[13].status,'out_of_frame');
  assert.ok(Math.abs(initial.rmsPx-314.7555157775399)<1e-5);
  const result=fit.fit(model,model,observations,options);
  assert.equal(result.evaluation.valid,true);
  assert.ok(result.acceptedSteps>=1);
  assert.ok(result.evaluation.rmsPx<70);
  assert.equal(JSON.stringify({model,observations,options}),before);
});

const effective=require('../src/optics/OpticalEffectiveRadiusPreview');
const tracer=require('../src/optics/OpticalRayTracer');
test('Soundly camera fit uses the shared local refractive curvature for each atmosphere and trial height',()=>{
  const before=JSON.stringify({model,observations,options});
  const variants=[
    {atmosphere:'vacuum'},
    {atmosphere:'standard'},
    {atmosphere:'temperature-lapse',temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5}},
    {atmosphere:'temperature-lapse',temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:10}}
  ];
  const predictions=[];
  for(const physics of variants){
    const p=effective.canvasDirectParameters(model,physics);
    const profile=tracer.atmosphere(physics.atmosphere,physics.temperatureProfile);
    assert.ok(Math.abs(p.effectiveCurvature-(1/model.rEarth+profile.dn(model.Height)/profile.n(model.Height)))<1e-20);
    assert.equal(p.radius,model.rEarth);
    const opts={...options,...physics,method:'canvas-direct',maxIterations:1};
    // Use the same mixed material correspondences. Some hypotheses can block
    // points at the initial camera; never silently drop them.
    const evaluation=fit.evaluate(model,model,observations,opts);
    assert.equal(evaluation.points.length,14);
    predictions.push(evaluation.points.map(q=>q.predicted));
    if(evaluation.valid){
      const result=fit.fit(model,model,observations,opts);
      assert.equal(result.atmosphere,physics.atmosphere);
      assert.ok(result.evaluation.valid);
      assert.ok(result.evaluation.cost<=evaluation.cost+1e-6);
    }
    const raised={...model,Height:model.Height+100};
    const q=effective.canvasDirectParameters(raised,physics);
    assert.equal(q.radius,model.rEarth);
    if(physics.atmosphere!=='vacuum')assert.notEqual(p.effectiveCurvature,q.effectiveCurvature);
  }
  for(let i=1;i<predictions.length;i++)assert.notDeepEqual(predictions[i],predictions[0]);
  assert.equal(JSON.stringify({model,observations,options}),before);
});
test('Globe Canvas Direct explicitly rejects nonpositive effective curvature',()=>{
  const p={atmosphere:'temperature-lapse',temperatureProfile:{temperatureC:-30,pressureHpa:1100,gradientKPerKm:20}};
  const low={...model,Height:1,rEarth:2e7};
  const support=effective.canvasDirectSupport(low,p);
  assert.equal(support.supported,false);
  assert.match(support.reason,/positive effective curvature/);
  const result=fit.evaluate(low,low,observations,{...options,...p,method:'canvas-direct'});
  assert.equal(result.valid,false);
  assert.match(result.reason,/positive effective curvature/);
});
