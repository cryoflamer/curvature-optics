'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fit=require('../src/calibration/CameraPhysicalFit');
const bridge=require('../src/calibration/CameraPhysicalPose');
const projection=require('../src/calibration/CameraLandmarkProjection');
const perspective=require('../src/calibration/CameraPerspectiveSeed');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const width=1920,height=1080;
const base={rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,
  CameraEast:-300,CameraNorth:-600,Height:45,Pan:26.56505117707799,Nick:2,Roll:13,
  FocalLengthField:43,deviceRatio:1.5,viewcenterHorizon:3};
const points=Array.from({length:12},(_,i)=>({id:`p${i}`,east:35*Math.sin(i*2.1),north:70*Math.cos(i*1.3),height:50+12*Math.sin(i*3.7)}));
const temperatureProfile={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
function pose(m){return Object.fromEntries(fit.fields.map(k=>[k,m[k]]));}
function observe(m,landmarks,opt,noise=0){const session=projection.create(m,bridge.photoCamera(m,width,height),width,height,opt);
  return landmarks.map((landmark,i)=>{const q=session.metric(landmark);assert.equal(q.status,'visible');return {landmark,pixel:q.pixel.map((v,j)=>v+noise*Math.sin(i*13.7+j*9.1))};});}
function perturbed(m){return {...pose(m),CameraEast:m.CameraEast+12,CameraNorth:m.CameraNorth-15,Height:m.Height+5,Pan:m.Pan+1.2,Nick:m.Nick-.75,Roll:m.Roll-1.5,FocalLengthField:m.FocalLengthField*1.07};}
function checkRecovered(result,m,tol){assert.ok(result.evaluation.valid,result.reason);assert.ok(result.evaluation.rmsPx<1e-5,JSON.stringify({status:result.status,reason:result.reason,rms:result.evaluation.rmsPx}));
  for(const k of fit.fields)assert.ok(Math.abs(result.pose[k]-m[k])<tol,`${k}: ${result.pose[k]} vs ${m[k]}`);assert.equal(result.complete,false);}
for(const showModel of [1,2])for(const [method,atmosphere] of [['accurate','standard'],['canvas-direct','temperature-lapse']]){
  test(`seven free parameters: ${showModel} ${method} ${atmosphere}`,t=>{
    const m={...base,showModel},opt={width,height,method,atmosphere,temperatureProfile},obs=observe(m,points,opt),initial=perturbed(m),before=JSON.stringify([m,obs,initial]);
    const r=fit.fit(m,initial,obs,opt);checkRecovered(r,m,1e-3);assert.equal(JSON.stringify([m,obs,initial]),before);
    assert.ok(r.evaluation.rmsPx<r.initialRmsPx);t.diagnostic(`${r.initialRmsPx.toFixed(3)} -> ${r.evaluation.rmsPx.toExponential(3)} px; ${r.status}; ${r.evaluations} evaluations`);
  });
}
test('perspective seed refined against distant refracted observations',t=>{
  const m={...base,showModel:1,CameraEast:-1500,CameraNorth:-6000,Height:40,Pan:Math.atan2(1500,22000)*180/Math.PI,Nick:-.06,Roll:2,FocalLengthField:200};
  const p=Array.from({length:12},(_,i)=>({id:`far${i}`,east:140*Math.sin(i*2.2),north:16000+1600*Math.cos(i*1.7),height:45+20*Math.sin(i*1.1)}));
  const opt={width,height,method:'accurate',atmosphere:'standard'},obs=observe(m,p,opt);
  const s=surface.createFromCurvature(1/m.rEarth),seeds=perspective.initialize(obs.map(o=>({world:s.surfacePoint3(o.landmark.east,o.landmark.north,o.landmark.height),pixel:o.pixel})),{width,height});
  assert.equal(seeds.status,'candidates',seeds.reason);
  const initial=bridge.fromPerspective(seeds.candidates[0],m,width,height).pose;
  const direct=fit.fit(m,initial,obs,{...opt,method:'canvas-direct'});assert.ok(direct.evaluation.valid);
  const r=fit.fit(m,direct.pose,obs,opt);checkRecovered(r,m,.1);
  t.diagnostic(`seed ${fit.evaluate(m,initial,obs,opt).rmsPx.toFixed(3)} px; direct ${direct.evaluation.rmsPx.toExponential(3)} px; accurate ${r.evaluation.rmsPx.toExponential(3)} px`);
});
test('locked parameters and active bound remain exact',()=>{
  const m={...base,showModel:2},opt={width,height},obs=observe(m,points,opt),initial={...pose(m),Pan:m.Pan-2};
  const r=fit.fit(m,initial,obs,{...opt,freeParameters:['Pan'],bounds:{Pan:[m.Pan-3,m.Pan-1]}});
  assert.equal(r.pose.Pan,m.Pan-1);assert.equal(r.status,'converged');
  for(const k of fit.fields.filter(k=>k!=='Pan'))assert.equal(r.pose[k],initial[k]);
});
test('weights and Euclidean pixel RMS include every observation',()=>{
  const m={...base,showModel:2},opt={width,height},obs=observe(m,points.slice(0,2),opt);
  obs[0].pixel[0]+=3;obs[0].pixel[1]+=4;obs[0].weight=4;
  const e=fit.evaluate(m,m,obs,opt);assert.ok(e.valid);assert.equal(e.points.length,2);assert.equal(e.residuals.length,4);
  assert.ok(Math.abs(e.rmsPx-Math.sqrt(25/2))<1e-9);assert.ok(Math.abs(e.weightedRmsPx-Math.sqrt(100/5))<1e-9);
  assert.ok(Math.abs(e.cost-50)<1e-9);assert.equal(fit.fit(m,m,obs,{...opt,freeParameters:[]}).status,'fixed');
  assert.equal(fit.fit(m,m,obs,opt).status,'underdetermined');
});
test('blocked and behind-camera observations invalidate entire fit',()=>{
  const m={...base,showModel:1,CameraEast:0,CameraNorth:0,Height:10,Pan:0,Nick:0,Roll:0},opt={width,height};
  const obs=[{landmark:{id:'visible',east:0,north:1000,height:20},pixel:[960,540]},
    {landmark:{id:'blocked',east:0,north:100000,height:1},pixel:[960,540]},
    {landmark:{id:'behind',east:0,north:-1000,height:20},pixel:[960,540]}];
  const r=fit.fit(m,m,obs,opt);assert.equal(r.status,'invalid_initial');assert.equal(r.evaluation.rmsPx,null);assert.equal(r.evaluation.residuals,null);
  assert.deepEqual(r.evaluation.points.map(p=>p.status),['visible','blocked','behind_camera']);
});
test('out-of-frame finite projections remain in residuals',()=>{
  const m={...base,showModel:2,Pan:0,Nick:0,Roll:0,CameraEast:0,CameraNorth:0},opt={width,height};
  const e=fit.evaluate(m,m,[{landmark:{id:'off',east:1000,north:100,height:50},pixel:[900,500]}],opt);
  assert.ok(e.valid);assert.equal(e.points[0].status,'out_of_frame');assert.ok(e.rmsPx>1000);
});
test('deterministic noisy fit and explicit iteration-limit status',()=>{
  const m={...base,showModel:2},opt={width,height},obs=observe(m,points,opt,.5),initial=perturbed(m);
  const a=fit.fit(m,initial,obs,opt),b=fit.fit(m,initial,obs,opt);assert.deepEqual(a,b);assert.ok(a.evaluation.rmsPx<.8);
  const limited=fit.fit(m,initial,obs,{...opt,maxIterations:1});assert.equal(limited.status,'iteration_limit');assert.ok(limited.evaluation.cost<=fit.evaluate(m,initial,obs,opt).cost);
});
test('malformed inputs and infeasible bounds are rejected',()=>{
  const m={...base,showModel:2},opt={width,height},obs=observe(m,points,opt);
  assert.throws(()=>fit.fit(m,m,obs,{...opt,bounds:{Height:[0,2]}}),/initial/);
  assert.throws(()=>fit.fit(m,m,obs,{...opt,freeParameters:['Height','Height']}),/free/);
  assert.throws(()=>fit.fit(m,m,[obs[0],obs[0]],opt),/duplicate/);
  assert.throws(()=>fit.fit(m,m,[{...obs[0],weight:0}],opt),/weight/);
  assert.throws(()=>fit.fit(m,m,obs,{...opt,atmosphere:'inverse-temperature'}),/Unsupported/);
});
test('authored mesh vertex correspondences use the same physical objective',()=>{
  const m={...base,showModel:1,Pan:0,CameraEast:0,CameraNorth:0,Height:12,Nick:0,Roll:0,
    ObjType:[8,3],NObjects:[3,0],ObjDist:[1700,0],ObjDeltaDist:[300,100],ObjSize:[1,10],ObjSizeVar:[0,0],
    ObjSideType:[0,0],ObjSidePos:[6,0],ObjSideVar:[0,0],ObjSizeType:[0,0]};
  const opt={width,height,method:'accurate',atmosphere:'standard'},session=projection.create(m,bridge.photoCamera(m,width,height),width,height,opt);
  const obs=[0,1].map(vertex=>{const landmark={id:'bridge:'+vertex,bank:0,objectType:8,primitive:0,vertex};
    const q=session.vertex(landmark);assert.equal(q.status,'visible');return {kind:'vertex',landmark,pixel:q.pixel};});
  const r=fit.fit(m,{...m,Pan:.5},obs,{...opt,freeParameters:['Pan']});assert.ok(r.evaluation.rmsPx<1e-6);assert.ok(Math.abs(r.pose.Pan)<1e-7);
});
