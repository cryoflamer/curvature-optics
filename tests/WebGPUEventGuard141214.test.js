'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const guard=require('../src/diagnostics/CurvatureWebGPUEventGuard141214');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
const {selectedRequest}=require('../src/diagnostics/CurvatureWebGPUPredictor141213');
const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
const request={branch:contract.BRANCH,geometry:'flat',radius:6371000,
  observerHeight:15,atmosphere:'vacuum',controls:{step:500,targetTolerance:0.005},
  targets:[[1000,20],[1100,20]]};
function fakeGpuDevice(){
 let code=[],dispatch=[];
 let device={limits:{maxStorageBufferBindingSize:10000000},
  createShaderModule({code:source}){code.push(source);return {getCompilationInfo:async()=>({messages:[]})};},
  createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
  createBuffer({size}){return {bytes:new ArrayBuffer(size),destroy(){},
    async mapAsync(){},getMappedRange(o=0,n=size){return this.bytes.slice(o,o+n);},unmap(){}};},
  createBindGroup({entries}){return entries;},
  createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
    dispatchWorkgroups(n){dispatch.push(n);},end(){}};},
    copyBufferToBuffer(a,o,b,d,n){new Uint8Array(b.bytes,d,n).set(new Uint8Array(a.bytes,o,n));},
    finish(){return {};}};},
  queue:{writeBuffer(b,o,data){new Uint8Array(b.bytes,o,data.byteLength).set(
    new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(){}},destroy(){}};
 return {code,dispatch,deps:{navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
  GPUBufferUsage:usage,GPUMapMode:{READ:1}}};
}
test('140.12.14: guard rejects grazing predictor samples before the gated sweep',()=>{
 assert.notEqual(gpu.WGSL_PREDICT_GUARDED,gpu.WGSL_PREDICT);
 assert.match(gpu.WGSL_PREDICT_GUARDED,/if\(status==3\.0\)\{status=0\.0;\}/);
 assert.doesNotMatch(gpu.WGSL_PREDICT,/if\(status==3\.0\)\{status=0\.0;\}/);
 assert.match(gpu.WGSL_PREDICT_GUARDED,/select\(-3\.0,-2\.0,status>0\.5\)/);
 assert.match(gpu.WGSL_PREDICT_GATED_SWEEP,/if\(predicted\.data\[targetIndex\*3u\]\.w>0\.5\)\{return;\}/);
 assert.match(gpu.WGSL_PREDICT_GATED_REFINE,/if\(results\.data\[i\*3u\]\.w>0\.5\)\{return;\}/);
 assert.equal(gpu.WGSL_PREDICT_GUARDED.includes('status=1.0;'),true);
});
test('140.12.14: guarded session has three GPU passes, default sweep remains two',async()=>{
 const m=fakeGpuDevice();
 const original=await gpu.solveBatch(request,m.deps);
 assert.deepEqual(m.dispatch,[2,1]);
 assert.equal(original.algorithm.kind,'sweep');
 const guarded=await gpu.solveBatch(request,m.deps,{algorithm:'predictor-guarded',warmRepeats:1});
 assert.equal(guarded.algorithm.kind,'predictor-guarded');
 assert.equal(guarded.algorithm.predictorAccepted,0);
 assert.equal(guarded.algorithm.predictorFallbacks,2);
 assert.deepEqual(m.dispatch,[2,1,1,2,1,1,2,1]);
 assert.deepEqual(m.code,[gpu.WGSL_SWEEP,gpu.WGSL_REFINE,gpu.WGSL_PREDICT_GUARDED,
   gpu.WGSL_PREDICT_GATED_SWEEP,gpu.WGSL_PREDICT_GATED_REFINE]);
 assert.deepEqual(guarded.response.results.map(r=>r.status),['solver_failed','solver_failed']);
});
test('140.12.14: status failure triage retains target order, near-ground and independent replay',async()=>{
 const cpu=await contract.solveCpuBatch(request);
 const bad=structuredClone(cpu.results);
 bad[0].status='indeterminate';
 bad[0].ground={hitGround:true,travelled:bad[0].pathLength-0.1,
   event:{kind:'ground',contact:'grazing',pathLength:bad[0].pathLength-0.1}};
 const response=contract.validateResponse(request,{backend:'gpu-experimental',branch:contract.BRANCH,results:bad});
 const result=guard.analyze(request,{response:cpu,ms:20},{response,
   algorithm:{kind:'predictor-guarded'},
   telemetry:[{bracketIndex:-2,refineIterations:2},{bracketIndex:0,refineIterations:1}],
   timing:{gpuSetupMs:1,gpuWarmMedianMs:2,warmOutputBitwiseStable:true}});
 assert.equal(result.predictorAccepted,1);
 assert.equal(result.predictorFallbacks,1);
 assert.equal(result.mismatchBreakdown.count,1);
 assert.equal(result.statusCases[0].targetIndex,0);
 assert.equal(result.statusCases[0].gpuStatus,'indeterminate');
 assert.equal(result.statusCases[0].nearGroundCentimetre,false);
 assert.equal(result.statusCases[0].f64ReplayOfGpuAngle.status,'measured');
 assert.equal(result.comparison.statusMismatch,1);
 assert.equal(result.productionAuthorized,false);
});
test('140.12.14: gating is not authorization when status or event disagreements remain',()=>{
 const row={status:'measured',variants:['sweep','predictor','predictor-guarded'].map(
   (algorithm,i)=>({algorithm,physical:{counts:{physicallyAdequate:i===2?1023:1024}},
     comparison:{statusMismatch:i===2?1:0},timing:{warmOutputBitwiseStable:true,gpuWarmMedianMs:i+1}}))};
 assert.equal(guard.verdict([row]),'NUMERICAL_OR_EVENT_STOP');
 assert.equal(guard.verdict([{status:'unavailable'}]),'INCONCLUSIVE');
});
test('140.12.14: canonical page exposes separate guarded A/B; older #13 remains available',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="12" selected/);
 assert.match(html,/id="panel-11" class="experiment" hidden/);
 assert.match(html,/id="panel-12" class="experiment"/);
 assert.match(html,/CurvatureWebGPUEventGuard141214\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.14-event-guard\.json/);
 assert.match(html,/for\(var i=0;i<13;i\+\+\)/);
 assert.equal(selectedRequest(fixture,'globe').targets.length,1024);
});
test('140.12.14: three variants share 1024 exact ordered scene targets at both RK4 steps',async()=>{
 const calls=[];
 const solver={async createSession(count,_deps,opts){
   assert.equal(count,1024);
   return {close(){},async solve(r){
     calls.push({algorithm:opts.algorithm,step:r.controls.step,
       targets:r.targets.map(t=>t.slice())});
     const reference=await contract.solveCpuBatch(r);
     return {algorithm:{kind:opts.algorithm},
       response:{backend:'gpu-experimental',branch:contract.BRANCH,results:reference.results},
       telemetry:r.targets.map(()=>({bracketIndex:opts.algorithm==='sweep'?0:-2,
         refineIterations:0})),
       timing:{gpuSetupMs:2,gpuWarmMedianMs:opts.algorithm==='sweep'?20:5,
         warmOutputBitwiseStable:true}};
   }};
 }};
 const oracle=async r=>({response:await contract.solveCpuBatch(r),ms:100,
   shooting:{evaluations:0,rk4Calls:0,predictorAccepted:0}});
 const report=await guard.run(fixture,undefined,{geometry:'globe',solver,cpuOracle:oracle,
   warmRepeats:1});
 assert.equal(report.version,'140.12.14');
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.fullFrameSpeedupProven,false);
 assert.deepEqual(calls.map(c=>[c.step,c.algorithm]),[
   [50,'sweep'],[50,'predictor'],[50,'predictor-guarded'],
   [500,'sweep'],[500,'predictor'],[500,'predictor-guarded']]);
 for(let i=0;i<6;i+=3){
   assert.deepEqual(calls[i].targets,calls[i+1].targets);
   assert.deepEqual(calls[i+1].targets,calls[i+2].targets);
 }
 assert.equal(report.rows[1].variants[2].predictorAccepted,1024);
 assert.equal(report.rows[1].variants[2].predictorFallbacks,0);
 assert.equal(report.rows[1].variants[2].comparison.statusMismatch,0);
 assert.equal(report.verdict,'GUARDED_BATCH_FASTER_ONLY');
});
