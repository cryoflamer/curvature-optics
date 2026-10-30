'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
function request(extra={}){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005},
 targets:[[1000,20],[1100,20]],...extra};}
test('140.12: independent GPU stages contain sweep, bracket refinement, on-device ground samples',()=>{
 assert.match(gpu.WGSL_SWEEP,/sampleIndex=i%config\[9\]/);
 assert.match(gpu.WGSL_SWEEP,/advanceCompensated\(s,ds,correction\)/);
 assert.match(gpu.WGSL_REFINE,/a\.y\*b\.y<=0\.0/);
 assert.match(gpu.WGSL_REFINE,/for\(var iter=0u;iter<config\[12\]/);
 assert.match(gpu.WGSL_REFINE,/let shot=arrival\(t,angle,true\)/);
 assert.match(gpu.WGSL_REFINE,/var low=previousT/);
 assert.match(gpu.WGSL_REFINE,/status=2\.0/);
 assert.doesNotMatch(gpu.WGSL_REFINE,/shootingWarmStartAngle|CPU|projection\.solve/);
});
test('140.12: only explicit transferable model and bounded GPU resources are allowed',()=>{
 const data=gpu.pack(request());
 assert.equal(data.input.length,8);
 assert.equal(data.config[9],33);
 assert.equal(data.config[12],28);
 assert.equal(data.config[13],8);
 for(const overrides of [{controls:{step:0.1}},{controls:{step:1}},
  {controls:{step:50,maxIterations:48}},
  {targets:[[100001,15]]},{targets:[[1,1000]]},
  {profileOptions:{wrong:2}},{branch:'multipath'},
  {targets:Array(257).fill([100,1])}]){
  assert.throws(()=>gpu.checked(request(overrides)),Error);
 }
});
test('140.12: current scene fixture creates separate GPU/CPU comparable target batches',()=>{
 const entries=gpu.fixtureRequests(fixture);
 assert.deepEqual(entries.map(x=>x.id),['towers-12.flat','towers-12.globe']);
 for(const {request:r} of entries){
  assert.equal(r.targets.length,64);assert.equal(r.branch,contract.BRANCH);
  assert.equal(gpu.pack(r).input.length,256);
 }
});
test('140.12: missing GPU roots fail closed, never become a fictitious visible ray',()=>{
 const r=request(),raw=new Float32Array(r.targets.length*12);
 const out=gpu.decode(r,raw);
 assert.deepEqual(out.results.map(x=>x.status),['solver_failed','solver_failed']);
 assert.ok(out.results.every(x=>x.angle===null&&x.ground===null&&x.reason));
});
test('140.12: independently emitted resolved GPU results require contact evidence',()=>{
 const r=request(),raw=new Float32Array(24);
 raw.set([0.005,0,1000,1,-1,0,1,0,0,0,0,0],0);
 raw.set([0.004,0.001,1100,2,900,1,1,0,0,0,0,0],12);
 const out=gpu.decode(r,raw);
 assert.equal(out.results[0].status,'visible');
 assert.equal(out.results[1].status,'blocked');
 assert.equal(out.results[1].ground.event.contact,'crossing');
 assert.equal(contract.validateResponse(r,out),out);
 raw[12+3]=1; // Visible cannot carry a prior ground event.
 assert.equal(gpu.decode(r,raw).results[1].status,'solver_failed');
 raw[12+3]=2;raw[12+4]=1100;
 assert.equal(gpu.decode(r,raw).results[1].status,'solver_failed');
 raw[12+3]=3;raw[12+4]=1099;raw[12+5]=2;
 assert.equal(gpu.decode(r,raw).results[1].status,'indeterminate');
});
test('140.12: numerical parity takes priority over apparent speedup; stages cannot authorize production',()=>{
 function row(match,speed){return {status:'measured',comparison:{sampleMatches:match},
   timing:{coldSpeedup:speed}};}
 assert.equal(gpu.decision([row(false,100)]).verdict,'BATCH_NUMERICAL_STOP');
 assert.equal(gpu.decision([row(true,0.9)]).verdict,'BATCH_PERFORMANCE_STOP');
 assert.equal(gpu.decision([row(true,3),row(true,4)]).verdict,'BATCH_STAGE_PASS_ONLY');
 assert.equal(gpu.decision([row(true,3)]).productionAuthorized,false);
 assert.equal(gpu.decision([row(true,3),{status:'unavailable'}]).verdict,'INCONCLUSIVE');
});
test('140.12: WebGPU absence reports unavailable rather than calling CPU inside the solver',async()=>{
 await assert.rejects(gpu.solveBatch(request(),{navigator:{}}),/WebGPU unavailable/);
 const result=await gpu.run(fixture,{navigator:{}});
 assert.equal(result.status,'incomplete');
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.equal(result.decision.productionAuthorized,false);
 assert.deepEqual(result.scenes.map(s=>s.status),['unavailable','unavailable']);
});
test('140.12: GPU compute dispatch and readback are independent of CPU baseline (mock checks orchestration only)',async()=>{
 const r=request(),created=[],usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
 const makeBuffer=({size})=>{
  const b={bytes:new ArrayBuffer(size),destroyed:false,mapAsync:async()=>{},
   getMappedRange(){return this.bytes},unmap(){},destroy(){this.destroyed=true}};
  created.push(b);return b;
 };
 let pipelines=0,dispatches=[];
 const device={limits:{maxStorageBufferBindingSize:1e7},
  createShaderModule({code}){assert.ok([gpu.WGSL_SWEEP,gpu.WGSL_REFINE].includes(code));
   return {getCompilationInfo:async()=>({messages:[]})};},
  async createComputePipelineAsync(){pipelines++;return {getBindGroupLayout:()=>({})};},
  createBuffer:makeBuffer,createBindGroup({entries}){return entries;},
  createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
   dispatchWorkgroups(n){dispatches.push(n);},end(){}}},
   copyBufferToBuffer(a,_,b){b.bytes=a.bytes.slice(0);},finish(){return {}}}},
  queue:{writeBuffer(b,offset,data){new Uint8Array(b.bytes).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset)},submit(){}},
  destroy(){this.destroyed=true}};
 const result=await gpu.solveBatch(r,{navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
  GPUBufferUsage:usage,GPUMapMode:{READ:1}});
 assert.equal(pipelines,2);
 assert.deepEqual(dispatches,[Math.ceil(2*33/64),Math.ceil(2/64)]);
 assert.deepEqual(result.response.results.map(x=>x.status),['solver_failed','solver_failed']);
 assert.ok(created.every(x=>x.destroyed));assert.ok(device.destroyed);
});
test('140.12: canonical browser page hosts the fifth mode, not another numbered HTML',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/CurvatureWebGPUBatchShooting1412\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12-independent-shooting\.json/);
 assert.match(html,/for\(var i=0;i<7;i\+\+\)/);
 const named=fs.readdirSync(path.join(__dirname,'../tools')).filter(x=>/webgpu-optics.*\.html/.test(x));
 assert.deepEqual(named,['webgpu-optics.html']);
});
test('140.12: WGSL shader compiler errors stop the experiment and destroy the GPU device',async()=>{
 let destroyed=false;
 const device={createShaderModule(){return {getCompilationInfo:async()=>({messages:[
   {type:'error',message:'simulated WGSL compile failure'}]})};},
   destroy(){destroyed=true;}};
 await assert.rejects(gpu.solveBatch(request(),{
  navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
  GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},GPUMapMode:{READ:1}
 }),/GPU shooting WGSL compilation failed: simulated WGSL compile failure/);
 assert.equal(destroyed,true);
});
