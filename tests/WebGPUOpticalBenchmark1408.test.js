'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const b=require('../src/diagnostics/CurvatureWebGPUOpticsBenchmark');
const tracer=require('../src/optics/OpticalRayTracer');

test('140.8: deterministic f32-quantized seeds and configuration for independent RK4 rays',()=>{
 const p={count:5,steps:10,step:75,geometry:'globe',atmosphere:'inverse-spherical'};
 const seed=b.seeds(p),cfg=b.config(p);
 assert.equal(seed.length,20);assert.equal(cfg.length,9);
 assert.equal(cfg[0],5);assert.equal(cfg[1],10);assert.equal(cfg[2],2);assert.equal(cfg[3],1);
 assert.deepEqual(seed,b.seeds(p));
 for(let i=0;i<5;i++)assert.ok(Math.abs(Math.hypot(seed[4*i+2],seed[4*i+3])-1)<1e-7);
 assert.match(b.WGSL,/@compute @workgroup_size\(64\)/);
 assert.match(b.WGSL,/if\(i>=config\[0\]\)/);
 assert.match(b.WGSL,/out\.zw=out\.zw\*inv/);
});

test('140.8: CPU benchmark matches the prepared production RK4 stepper for every supported atmosphere',()=>{
 for(const atmosphere of ['vacuum','standard','exponential-occlusion','inverse-spherical']){
  for(const geometry of ['flat','globe']){
   const p={atmosphere,geometry,count:3,steps:7,step:100};
   const seed=b.seeds(p),actual=b.cpuIntegrate(p,seed);
   const step=tracer.prepareStepper({geometry,atmosphere,profileOptions:{occlusionRadius:6371000}},true);
   for(let i=0;i<3;i++){
    let state=Array.from(seed.subarray(i*4,i*4+4));
    for(let j=0;j<p.steps;j++)state=step(state,p.step);
    assert.deepEqual(Array.from(actual.slice(i*4,i*4+4)),state);
   }
  }
 }
});

test('140.8: vacuum CPU preserves straight-line solution to f64 precision',()=>{
 const p={count:4,steps:30,step:100,atmosphere:'vacuum',geometry:'flat'};
 const seed=b.seeds(p),out=b.cpuIntegrate(p,seed);
 for(let i=0;i<p.count;i++){
  const o=4*i,L=p.step*p.steps;
  const vx=seed[o+2],vz=seed[o+3],norm=Math.hypot(vx,vz);
  // First RK4 stage receives the same f32-quantized input as the GPU,
  // then the existing integrator renormalizes its direction each step.
  const xExpected=p.step*vx+(L-p.step)*vx/norm;
  const zExpected=seed[o+1]+p.step*vz+(L-p.step)*vz/norm;
  assert.ok(Math.abs(out[o]-xExpected)<1e-9);
  assert.ok(Math.abs(out[o+1]-zExpected)<1e-9);
 }
});

test('140.8: numeric gate is fail-closed on f32 error, angle drift or nonfinite output',()=>{
 const p={count:2,steps:1},seed=b.seeds(p);
 const reference=b.cpuIntegrate(p,seed),gpu=Float32Array.from(reference);
 assert.equal(b.compare(reference,gpu,p).qualified,true);
 gpu[0]+=10;
 const bad=b.compare(reference,gpu,p);
 assert.equal(bad.qualified,false);assert.equal(bad.failedRays,1);
 gpu[0]=reference[0];gpu[3]=NaN;
 const nan=b.compare(reference,gpu,p);
 assert.equal(nan.qualified,false);assert.equal(nan.nonFiniteRays,1);
});

test('140.8: invalid/oversized workloads rejected before GPU access',()=>{
 for(const v of [{count:0},{steps:0},{count:65536,steps:10000},
   {repeats:21},{step:0},{atmosphere:'custom'},{geometry:'cube'},
   {maxPositionError:0},{maxAngularError:-1}])assert.throws(()=>b.check(v));
});

test('140.8: missing WebGPU is reported as unavailable, never as a measured speedup',async()=>{
 const report=await b.run({count:1,steps:1},{navigator:{}});
 assert.equal(report.status,'unavailable');assert.equal(report.qualified,false);
});

test('140.8: GPU buffer protocol is independently testable without claiming actual GPU execution',async()=>{
 // Fake device validates host-side dispatch, input/result buffer layout,
 // upload/readback collection and comparison. It does NOT execute WGSL.
 const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
 const buffers=[];let pipelineCompile=false,dispatches=0;
 const device={limits:{maxStorageBufferBindingSize:10000000},
  createShaderModule:({code})=>({getCompilationInfo:async()=>({messages:[]}),code}),
  createComputePipelineAsync:async()=>{pipelineCompile=true;return {getBindGroupLayout:()=>({})};},
  createBuffer:({size})=>{const obj={raw:new Uint8Array(size),destroy(){},
    async mapAsync(){},getMappedRange(){return this.raw.buffer;},unmap(){}};
   buffers.push(obj);return obj;},
  createBindGroup:({entries})=>({entries}),
  createCommandEncoder:()=>{const task={};return {
   beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(n){task.n=n;},end(){}};},
   copyBufferToBuffer(src,_,dst,__,n){task.src=src;task.dst=dst;task.size=n;},
   finish(){return task;}};},destroy(){}};
 device.queue={writeBuffer(buf,offset,typed){buf.raw.set(new Uint8Array(typed.buffer,typed.byteOffset,typed.byteLength),offset);},
  submit(tasks){for(const task of tasks){
   dispatches++;const inp=new Float32Array(buffers[0].raw.buffer);
   const out=b.cpuIntegrate({count:2,steps:3,step:10,atmosphere:'vacuum'},inp);
   const computed=new Float32Array(out);
   buffers[1].raw.set(new Uint8Array(computed.buffer));
   task.dst.raw.set(task.src.raw.subarray(0,task.size));
  }}};
 const report=await b.run({count:2,steps:3,step:10,atmosphere:'vacuum',repeats:2},
  {navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
   GPUBufferUsage:usage,GPUMapMode:{READ:1}});
 assert.equal(pipelineCompile,true);assert.equal(dispatches,3); // 1 warmup + 2 measured
 assert.equal(report.status,'measured');assert.equal(report.qualified,true);
 assert.equal(report.validation.failedRays,0);
 assert.equal(report.timing.gpuUploadToReadbackSamplesMs.length,2);
 assert.equal(report.timing.cpuSamplesMs.length,2);
 assert.equal(report.device.hardwareAcceleration,'unverified');
});
