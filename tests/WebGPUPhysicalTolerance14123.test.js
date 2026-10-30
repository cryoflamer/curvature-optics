'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const physical=require('../src/diagnostics/CurvatureWebGPUPhysicalTolerance14123');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
const clone=object=>JSON.parse(JSON.stringify(object));
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
 targets:[[56,20.47]]};}
async function responses(){
 const req=request(),cpu=await contract.solveCpuBatch(req),gpuResponse=clone(cpu);
 gpuResponse.backend='gpu-experimental';return {req,cpu,gpuResponse};
}
test('140.12.3: 5 mm is the physical arrival criterion; angular mismatches are diagnostic, not vetoes',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const r=gpuResponse.results[0];r.angle+=3e-5;r.residual=0.0017;
 // Both solver-reported arrivals and an independently integrated CPU replay
 // are within 5 mm, despite a >1e-7 rad angle difference.
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.physicallyAdequate,true);
 assert.equal(assessed.strictParityDiagnostic.angleMismatch,1);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuReplayResidualExceeded,0);
 assert.equal(assessed.targets[0].flags.length,0);
 assert.ok(assessed.targets[0].cpuReplayOfGpuAngle.absoluteResidualMetres<0.005);
});
test('140.12.3: individual residuals are tested; the difference between them is NOT a failure',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 cpu.results[0].residual=-0.003;
 gpuResponse.results[0].residual=0.003;
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.physicallyAdequate,true);
 assert.equal(assessed.strictParityDiagnostic.residualMismatch,1);
 assert.equal(assessed.counts.cpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.max.cpuAbsoluteResidualMetres,0.003);
 assert.equal(assessed.max.gpuAbsoluteResidualMetres,0.003);
});
test('140.12.3: exceeding 5 mm in any arrival fails closed',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0].residual=0.005001;
 let assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.gpuResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
 gpuResponse.results[0].residual=0.002;
 cpu.results[0].residual=-0.005001;
 assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.cpuResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: independent f64 replay catches a false GPU self-reported 5 mm hit',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0].angle+=0.0001;
 gpuResponse.results[0].residual=0.002;
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuReplayResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
 assert.ok(assessed.targets[0].cpuReplayOfGpuAngle.absoluteResidualMetres>0.005);
});
test('140.12.3: ground/visibility disagreement and unresolved rays cannot pass at 5 mm',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const r=gpuResponse.results[0];
 r.status='indeterminate';r.reason='uncertain crossing';
 r.ground={hitGround:true,travelled:r.pathLength-0.01,
   event:{kind:'ground',contact:'grazing',pathLength:r.pathLength-0.01}};
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.statusMismatch,1);
 assert.equal(assessed.counts.groundEventMismatch,1);
 assert.equal(assessed.counts.unresolved,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: fixed angle replay agrees analytically with straight ray in vacuum',()=>{
 const req=request(),angle=Math.atan2(20.47-15,56);
 const exact={target:req.targets[0],angle,pathLength:Math.hypot(56,5.47),status:'visible'};
 const tracer=require('../src/optics/OpticalRayTracer');
 const profile=tracer.atmosphere('vacuum');
 const prepared={profile,advance:tracer.prepareStepper({geometry:'flat',radius:req.radius,profile},true)};
 let result=physical.cpuReplay(req,exact,prepared);
 assert.equal(result.status,'measured');
 assert.ok(Math.abs(result.residualMetres)<1e-10);
 assert.ok(result.targetXErrorMetres<1e-8);
 const away=Object.assign({},exact,{angle:angle+0.0001});
 result=physical.cpuReplay(req,away,prepared);
 assert.equal(result.status,'measured');
 assert.ok(result.absoluteResidualMetres>0.005);
});
test('140.12.3: historical Flat #54 CPU replay exceeds 5 mm despite 3.4 mm GPU residual',()=>{
 const req=gpu.fixtureRequests(fixture)[0].request;
 const tracer=require('../src/optics/OpticalRayTracer');
 const profile=tracer.atmosphere(req.atmosphere,req.profileOptions);
 const prepared={profile,advance:tracer.prepareStepper({geometry:req.geometry,radius:req.radius,profile},true)};
 const target=req.targets[54];
 assert.ok(Math.abs(target[0]-25550.01097343013)<1e-6);
 const result=physical.cpuReplay(req,{target,angle:0.0018239873461425304,
   pathLength:25550.033203125,status:'visible'},prepared);
 assert.equal(result.status,'measured');
 assert.ok(Math.abs(result.residualMetres-0.005171501392233324)<1e-6);
 assert.ok(Math.abs(0.003406524658203125)<req.controls.targetTolerance);
 assert.ok(result.absoluteResidualMetres>req.controls.targetTolerance);
});
test('140.12.3: missing GPU ray fails closed; cannot gain success from null residual',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0]={target:req.targets[0],status:'solver_failed',angle:null,
  residual:null,pathLength:null,ground:null,reason:'no bracket'};
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.unresolved,1);
 assert.equal(assessed.counts.gpuReplayUnavailable,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: decision prioritizes physics, then stable repeats, then retained 2x cold gate',()=>{
 const counts={cpuResidualExceeded:0,gpuResidualExceeded:0,gpuReplayResidualExceeded:0,
  gpuReplayUnavailable:0,statusMismatch:0,groundEventMismatch:0,unresolved:0,physicallyAdequate:1};
 const scene={status:'measured',physical:{counts,physicallyAdequate:true},
  timing:{warmOutputBitwiseStable:true,coldSpeedup:3}};
 assert.equal(physical.decide([scene]).verdict,'BATCH_STAGE_PASS_ONLY');
 assert.equal(physical.decide([scene]).productionAuthorized,false);
 assert.equal(physical.decide([scene]).thresholdColdSpeedup,2);
 for(const [field,expected] of [['cpuResidualExceeded','CPU_REFERENCE_STOP'],
  ['gpuResidualExceeded','GPU_ARRIVAL_STOP'],['gpuReplayResidualExceeded','GPU_REPLAY_STOP'],
  ['groundEventMismatch','GROUND_STATUS_STOP'],['unresolved','GROUND_STATUS_STOP']]){
  const altered=clone(scene);altered.physical.counts[field]=1;
  assert.equal(physical.decide([altered]).verdict,expected);
 }
 assert.equal(physical.decide([Object.assign({},scene,{timing:{coldSpeedup:3,warmOutputBitwiseStable:false}})]).verdict,
  'BATCH_REPEAT_INSTABILITY_STOP');
 assert.equal(physical.decide([Object.assign({},scene,{timing:{coldSpeedup:1.5,warmOutputBitwiseStable:true}})]).verdict,
  'BATCH_PERFORMANCE_STOP');
 assert.equal(physical.decide([{status:'unavailable'}]).verdict,'INCONCLUSIVE');
});
test('140.12.3: orchestrator retains original 5 mm residual-stop GPU policy and independent CPU reference',async()=>{
 const policies=[];
 const mock={async solveBatch(req,_deps,opts){
  policies.push(opts);const reference=await contract.solveCpuBatch(req);
  return {response:{branch:contract.BRANCH,backend:'gpu-experimental',results:reference.results},
   timing:{gpuColdMs:100000,gpuWarmMedianMs:200,warmOutputBitwiseStable:true,
    warmRunMs:[200,200,200]},device:{adapterInfo:null}};
 }};
 const result=await physical.run(fixture,{}, {solver:mock});
 assert.equal(result.status,'finished');
 assert.equal(result.version,'140.12.3');
 assert.equal(result.scenes.length,2);
 assert.deepEqual(policies,[{refinement:'residual-stop',warmRepeats:3},
  {refinement:'residual-stop',warmRepeats:3}]);
 assert.ok(result.scenes.every(s=>s.physical.physicallyAdequate));
 assert.equal(result.decision.verdict,'BATCH_PERFORMANCE_STOP');
 assert.equal(result.decision.productionAuthorized,false);
});
test('140.12.3: no WebGPU returns INCONCLUSIVE and no invented scene accuracy or performance',async()=>{
 const result=await physical.run(fixture,{navigator:{}});
 assert.equal(result.status,'incomplete');
 assert.ok(result.scenes.every(s=>s.status==='unavailable'));
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.equal(result.decision.productionAuthorized,false);
});
test('140.12.3: single canonical diagnostics HTML and physical gate controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="7" selected/);
 assert.match(html,/CurvatureWebGPUPhysicalTolerance14123\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.3-physical-tolerance\.json/);
 assert.match(html,/for\(var i=0;i<8;i\+\+\)/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(s=>/webgpu-optics.*\.html/.test(s)),['webgpu-optics.html']);
 assert.match(gpu.WGSL_REFINE,/if\(abs\(shot\.residual\)<=bitcast<f32>\(config\[11\]\)\)/);
});
