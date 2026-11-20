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
