'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const experiment=require('../src/diagnostics/CurvatureWebGPUPredictor141213');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005},
 targets:[[1000,20],[1100,20]]};}
const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
function mockDevice(){
 const shaders=[],dispatches=[],destroyed=[];
 const device={limits:{maxStorageBufferBindingSize:10000000},
  createShaderModule({code}){shaders.push(code);return {getCompilationInfo:async()=>({messages:[]})};},
  async createComputePipelineAsync(){return {getBindGroupLayout:()=>({})};},
  createBuffer({size}){const buffer={bytes:new ArrayBuffer(size),destroy(){destroyed.push(buffer);},
   async mapAsync(){},getMappedRange(offset=0,length=size){return this.bytes.slice(offset,offset+length);},
   unmap(){}};return buffer;},
  createBindGroup({entries}){return entries;},
  createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
   dispatchWorkgroups(n){dispatches.push(n);},end(){}};},
   copyBufferToBuffer(a,offset,b,destOffset,length){new Uint8Array(b.bytes,destOffset,length).set(
    new Uint8Array(a.bytes,offset,length));},finish(){return {};}};},
  queue:{writeBuffer(b,offset,data){new Uint8Array(b.bytes,offset,data.byteLength).set(
   new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(){}},
  destroy(){destroyed.push('device');}};
 return {device,shaders,dispatches,destroyed,deps:{navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
 GPUBufferUsage:usage,GPUMapMode:{READ:1}}};
}
test('140.12.13: independent GPU predictor verifies arrival and ground before accepting',()=>{
 assert.match(gpu.WGSL_PREDICT,/var shot=arrival\(t,angle,false\)/);
 assert.match(gpu.WGSL_PREDICT,/for\(var k=0u;k<3u/);
 assert.match(gpu.WGSL_PREDICT,/abs\(trial\.residual\)>=abs\(shot\.residual\)\*0\.9/);
 assert.match(gpu.WGSL_PREDICT,/let verified=arrival\(t,angle,true\)/);
 assert.match(gpu.WGSL_PREDICT,/status=2\.0/);
 assert.match(gpu.WGSL_PREDICT,/select\(-3\.0,-2\.0,status>0\.5\)/);
 assert.doesNotMatch(gpu.WGSL_SWEEP,/predicted/);
 assert.match(gpu.WGSL_PREDICT_GATED_SWEEP,/if\(predicted\.data\[targetIndex\*3u\]\.w>0\.5\)\{return;\}/);
 assert.match(gpu.WGSL_PREDICT_GATED_REFINE,/if\(results\.data\[i\*3u\]\.w>0\.5\)\{return;\}/);
});
test('140.12.13: modes allocate original two or guarded three passes, with unchanged contracts',async()=>{
 const m=mockDevice(),r=request();
 const old=await gpu.solveBatch(r,m.deps);
 assert.equal(old.algorithm.kind,'sweep');
 assert.deepEqual(m.dispatches,[2,1]);
 const fast=await gpu.solveBatch(r,m.deps,{algorithm:'predictor',warmRepeats:1});
 assert.equal(fast.algorithm.kind,'predictor');
 assert.equal(fast.algorithm.predictorAccepted,0);
 assert.equal(fast.algorithm.predictorFallbacks,2);
 assert.deepEqual(m.dispatches,[2,1,1,2,1,1,2,1]);
 assert.deepEqual(m.shaders,[gpu.WGSL_SWEEP,gpu.WGSL_REFINE,
  gpu.WGSL_PREDICT,gpu.WGSL_PREDICT_GATED_SWEEP,gpu.WGSL_PREDICT_GATED_REFINE]);
 assert.deepEqual(fast.response.results.map(x=>x.status),['solver_failed','solver_failed']);
 assert.equal(m.destroyed.filter(x=>x==='device').length,2);
});
test('140.12.13: invalid predictor modes cannot silently change original solver',async()=>{
 await assert.rejects(gpu.createSession(2,{navigator:{}},{algorithm:'wrong'}),/algorithm/);
 await assert.rejects(gpu.createSession(2,{navigator:{}},{algorithm:'predictor',refinement:'angle-bracket'}),/requires residual-stop/);
 assert.equal(gpu.pack(request()).config[9],33);
 assert.notEqual(gpu.pack(experiment.withStep(request(),500)).config[4],gpu.pack(request()).config[4]);
 assert.throws(()=>experiment.withStep(request(),2000),/step/);
});
test('140.12.13: both geometries use 1024 distinct real target coordinates without replication',()=>{
 for(const geometry of ['flat','globe']){
  const a=experiment.selectedRequest(fixture,geometry);
  const b=experiment.selectedRequest(fixture,geometry);
  assert.equal(a.targets.length,1024);
  assert.equal(new Set(a.targets.map(x=>x.join('/'))).size,1024);
  assert.deepEqual(a.targets,b.targets);
  assert.equal(a.geometry,geometry);
 }
});
test('140.12.13: CPU f64 predictor oracle independently solves the same ordered targets',async()=>{
 const r=request();const c=await experiment.cpuReference(r);
 assert.equal(c.response.results.length,2);
 assert.equal(c.response.backend,'cpu-reference');
 assert.ok(c.shooting.evaluations>=2);
 assert.ok(c.ms>=0);
});
test('140.12.13: paired sweep/predictor comparison uses exactly same requests per step',async()=>{
 const calls=[];
 const solver={async createSession(_count,_deps,opts){
  const algorithm=opts.algorithm;
  return {close(){},async solve(r){calls.push({algorithm,step:r.controls.step,
   targets:r.targets.map(t=>t.slice())});
   const cpu=await contract.solveCpuBatch(r);
   return {algorithm:{kind:algorithm},response:{backend:'gpu-experimental',branch:contract.BRANCH,results:cpu.results},
    telemetry:r.targets.map(()=>({bracketIndex:algorithm==='predictor'?-2:0,refineIterations:0})),
    timing:{gpuWarmMedianMs:10,gpuSetupMs:4,warmOutputBitwiseStable:true}};
  }};
 }};
 const cpuOracle=async r=>{const c=await contract.solveCpuBatch(r);return {response:c,ms:100,
  shooting:{evaluations:0,rk4Calls:0,predictorAccepted:0}};};
 const report=await experiment.run(fixture,undefined,{geometry:'flat',warmRepeats:1,
  solver,cpuOracle});
 assert.equal(report.productionAuthorized,false);
 assert.equal(report.fullFrameSpeedupProven,false);
 assert.equal(report.targets,1024);
 assert.equal(report.rows.length,2);
 assert.deepEqual(calls.map(c=>[c.step,c.algorithm]),[[50,'sweep'],[50,'predictor'],[500,'sweep'],[500,'predictor']]);
 for(const [i,j] of [[0,1],[2,3]])assert.deepEqual(calls[i].targets,calls[j].targets);
 assert.equal(report.rows[0].variants[1].predictorAccepted,1024);
});
test('140.12.13: rejects numerical parity discrepancies even with artificial GPU speed advantage',()=>{
 const row={status:'measured',variants:[{physical:{counts:{physicallyAdequate:1024}},
  comparison:{statusMismatch:0},timing:{warmOutputBitwiseStable:true,gpuWarmMedianMs:10}},
 {physical:{counts:{physicallyAdequate:1023}},comparison:{statusMismatch:1},
  timing:{warmOutputBitwiseStable:true,gpuWarmMedianMs:1}}]};
 assert.equal(experiment.verdict([row]),'NUMERICAL_OR_EVENT_STOP');
 assert.equal(experiment.verdict([{status:'unavailable'}]),'INCONCLUSIVE');
});
test('140.12.13: canonical diagnostics page exposes predictor and preserves older modes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/CurvatureWebGPUPredictor141213\.run/);
 assert.match(html,/value="12" selected/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.13-predictor-ab\.json/);
 assert.match(html,/for\(var i=0;i<13;i\+\+\)/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(x=>/webgpu-optics.*\.html/.test(x)),['webgpu-optics.html']);
});
