'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');

function request(overrides={}){
  return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
    observerHeight:10,atmosphere:'vacuum',controls:{step:20},
    targets:[[100,12],[250,14]],...overrides};
}
function copy(x){return JSON.parse(JSON.stringify(x));}

test('140.11: async batch CPU reference keeps target order and full first-event result',async()=>{
  const input=request();
  const pending=contract.solveCpuBatch(input);
  assert.equal(typeof pending.then,'function');
  const result=await pending;
  assert.equal(contract.validateResponse(input,result),result);
  assert.equal(result.backend,'cpu-reference');
  assert.equal(result.branch,'first-forward-x');
  assert.deepEqual(result.results.map(x=>x.target),input.targets);
  assert.ok(result.results.every(x=>x.status==='visible'&&Number.isFinite(x.angle)&&
    Math.abs(x.residual)<=1e-6&&x.ground.hitGround===false&&x.ground.event===null));
  assert.equal(contract.compare(input,result,{...copy(result),backend:'gpu-experimental'}).sampleMatches,true);
});

test('140.11: flat and globe atmospheric CPU batches use unchanged point-to-point oracle',async()=>{
  const projection=require('../src/optics/OpticalTargetProjection');
  const surface=require('../src/geometry/CurvatureSurfaceGeometry');
  for(const geometry of ['flat','globe']){
    const r=request({geometry,atmosphere:'standard',controls:{step:200},
      targets:[surface.createFromCurvature(geometry==='flat'?0:1/6371000).surfacePoint2(1000,20)]});
    const result=await contract.solveCpuBatch(r);
    const scalar=projection.solve({geometry,radius:r.radius,observerHeight:r.observerHeight,
      atmosphere:r.atmosphere,step:r.controls.step,target:r.targets[0]});
    assert.equal(result.results[0].status,scalar.status);
    assert.equal(result.results[0].angle,scalar.angle);
    assert.equal(result.results[0].residual,scalar.residual);
    assert.equal(result.results[0].ground.hitGround,scalar.ray.hitGround);
  }
});

test('140.11: invalid/unsupported scope and target payload fail closed',()=>{
  for(const bad of [
    {branch:'all-rays'}, {geometry:'both'}, {atmosphere:'custom'},
    {targets:[]}, {targets:[[0,1]]}, {targets:[[Infinity,0]]},
    {targets:[[100,0,1]]}, {profile:{n:()=>1}},
    {surfaceArithmetic:'legacy'}, {controls:{warp:1}}, {controls:{step:NaN}},
    {profileOptions:{occlusionRadius:Infinity}}
  ])assert.throws(()=>contract.validateRequest(request(bad)),Error);
  assert.throws(()=>contract.validateRequest(request({targets:Array(16385).fill([1,1])})),/targets/);
});

test('140.11: GPU response may not silently omit first ground-event evidence or reorder targets',async()=>{
  const input=request(),reference=await contract.solveCpuBatch(input);
  function invalid(modify){
    const report=copy(reference);report.backend='gpu-experimental';modify(report);
    assert.throws(()=>contract.validateResponse(input,report),Error);
  }
  invalid(x=>{x.results[0].target=[999,999];});
  invalid(x=>{x.results[0].ground=null;});
  invalid(x=>{x.results[0].status='blocked';});
  invalid(x=>{x.results[0].angle=NaN;});
  invalid(x=>{x.results[0].status='solver_failed';});
  invalid(x=>{x.results[0].status='visible';x.results[0].ground.hitGround=true;});
  invalid(x=>{x.results[0].status='blocked';x.results[0].ground={hitGround:true,travelled:1000,
    event:{kind:'ground',contact:'crossing',pathLength:1000}};});
  invalid(x=>{x.results.pop();});
  invalid(x=>{x.branch='all-rays';});
});

test('140.11: comparison separately records angular, status, and unresolved differences',async()=>{
  const input=request(),cpu=await contract.solveCpuBatch(input),gpu=copy(cpu);
  gpu.backend='gpu-experimental';
  assert.deepEqual(contract.compare(input,cpu,gpu),{
    statusMismatch:0,angleMismatch:0,residualMismatch:0,groundEventMismatch:0,
    maxAngularErrorRadians:0,maxResidualErrorMetres:0,maxGroundEventErrorMetres:0,
    unresolved:0,sampleMatches:true});
  gpu.results[0].angle+=2e-7;
  assert.equal(contract.compare(input,cpu,gpu).angleMismatch,1);
  gpu.results[0].residual+=2e-6;
  assert.equal(contract.compare(input,cpu,gpu).residualMismatch,1);
  gpu.results[1].status='indeterminate';
  assert.deepEqual((({statusMismatch,unresolved,sampleMatches})=>({statusMismatch,unresolved,sampleMatches}))(
    contract.compare(input,cpu,gpu)),{statusMismatch:1,unresolved:1,sampleMatches:false});
});

test('140.11: production transformation and UI remain synchronous; WebGPU probing does not dispatch optics',()=>{
  const root=path.join(__dirname,'..');
  const content=name=>fs.readFileSync(path.join(root,name),'utf8');
  const field=content('src/optics/OpticalSharedRayField.js');
  const scene=content('src/optics/CurvaturePhysicalSceneOptics.js');
  const painter=content('src/app/CurvatureMainCanvasRenderer.js');
  const ui=content('src/ui/modern/ModernApp.js');
  assert.match(field,/var result=projection\.solve\(/);
  assert.match(field,/return \{sample:sample,exact:exact,warm:warm,stats:stats/);
  assert.match(scene,/var projected=silhouette\.projectPrimitives\(/);
  assert.match(scene,/var fills=polygonFills\.project\(/);
  assert.match(scene,/return field\.sample\(d,h\)/);
  assert.match(painter,/var opticalFrame=session\.transform\(/);
  assert.match(ui,/function bindGpuDiagnostics\(/);
  assert.match(ui,/gpuCapabilities\.probe\(/);
  assert.doesNotMatch(painter,/CurvatureOpticalBatchContract1411|solveCpuBatch/);
  assert.doesNotMatch(scene,/CurvatureOpticalBatchContract1411|solveCpuBatch/);
});

test('140.11: contact differences cannot pass just because angle and status match',async()=>{
  const input=request(),cpu=await contract.solveCpuBatch(input),gpu=copy(cpu);
  gpu.backend='gpu-experimental';
  // Inject an artificial first-ground event while keeping visible status.
  gpu.results[0].ground={hitGround:true,travelled:gpu.results[0].pathLength-0.1,
    event:{kind:'ground',contact:'grazing',pathLength:gpu.results[0].pathLength-0.1}};
  contract.validateResponse(input,gpu);
  const result=contract.compare(input,cpu,gpu);
  assert.equal(result.statusMismatch,0);
  assert.equal(result.groundEventMismatch,1);
  assert.equal(result.sampleMatches,false);
});
