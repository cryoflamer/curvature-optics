'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const diagnostic=require('../src/diagnostics/CurvatureWebGPUBatchDiagnostics14121');
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005},
 targets:[[1000,20],[1100,20],[1200,20]]};}
function result(target,angle,status='visible',event=null){
 const length=target[0];return {target:target.slice(),status,angle,residual:0,
  pathLength:length,ground:{hitGround:!!event,travelled:event?event.pathLength:length,event},reason:null};
}
test('140.12.1: WGSL writes bracket selection/count and refinement interval into unused output slots',()=>{
 assert.match(gpu.WGSL_REFINE,/candidateBrackets=candidateBrackets\+1u/);
 assert.match(gpu.WGSL_REFINE,/usedIterations=iter\+1u/);
 assert.match(gpu.WGSL_REFINE,/vec4f\(f32\(bracket\),f32\(usedIterations\),a\.x,b\.x\)/);
 assert.match(gpu.WGSL_REFINE,/shot\.valid/);
 assert.match(gpu.WGSL_REFINE,/vec4f\(-1\.0,0\.0,0\.0,0\.0\)/);
});
test('140.12.1: telemetry decodes per-target shader diagnostic slots in request order',()=>{
 const req=request(),raw=new Float32Array(36);
 raw.set([0.01,0,1000,1,-1,0,1,2,3,14,0.01,0.01001],0);
 raw.set([0,0,0,0,-1,0,0,0,-1,0,0,0],12);
 raw.set([0,0,0,0,-1,0,0,1,0,28,0.02,0.03],24);
 const t=gpu.decodeTelemetry(req,raw);
 assert.equal(t[0].targetIndex,0);
 assert.equal(t[0].bracketIndex,3);
 assert.equal(t[0].bracketCount,2);
 assert.equal(t[0].refineIterations,14);
 assert.ok(Math.abs(t[0].finalBracketWidthRadians-0.00001)<1e-8);
 assert.equal(t[1].bracketIndex,-1);
 assert.equal(t[1].finalBracketWidthRadians,null);
 assert.equal(t[2].refineIterations,28);
 assert.throws(()=>gpu.decodeTelemetry(req,new Float32Array(8)),/length mismatch/);
});
test('140.12.1: detailed parity shares contract gates, identifies flags and preserves evidence',()=>{
 const req=request(),a=req.targets.map((t)=>result(t,0.01));
 const b=[result(req.targets[0],0.01),result(req.targets[1],0.011),
   result(req.targets[2],0.01,'blocked',{kind:'ground',contact:'crossing',pathLength:1000})];
 const cpu={backend:'cpu-reference',branch:contract.BRANCH,results:a};
 const candidate={backend:'gpu-experimental',branch:contract.BRANCH,results:b};
 const telemetry=[{targetIndex:0,bracketIndex:3,bracketCount:1},
  {targetIndex:1,bracketIndex:2,bracketCount:2},{targetIndex:2,bracketIndex:-1,bracketCount:0}];
 const d=diagnostic.details(req,cpu,candidate,telemetry);
 assert.equal(d.flaggedCount,2);
 assert.equal(d.noBracketCount,1);
 assert.equal(d.multipleBracketCount,1);
 assert.deepEqual(d.targets[0].flags,[]);
 assert.deepEqual(d.targets[1].flags,['angleMismatch']);
 assert.deepEqual(d.targets[2].flags,['statusMismatch','groundEventMismatch']);
 assert.equal(d.targets[1].differences.angleRadians,0.0009999999999999992);
 assert.equal(d.targets[2].gpu.ground.eventPathLength,1000);
 const aggregate=contract.compare(req,cpu,candidate);
 assert.equal(d.targets.filter(t=>t.flags.includes('angleMismatch')).length,aggregate.angleMismatch);
 assert.equal(d.targets.filter(t=>t.flags.includes('statusMismatch')).length,aggregate.statusMismatch);
 assert.throws(()=>diagnostic.details(req,cpu,candidate,telemetry.slice(1)),/cover every target/);
 assert.throws(()=>diagnostic.details(req,cpu,candidate,[telemetry[1],telemetry[0],telemetry[2]]),/target order/);
});
test('140.12.1: warm repeats re-use one device, two pipelines and five buffers',async()=>{
 const req=request(),usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
 let adapters=0,devices=0,pipelines=0,mapCount=0,dispatches=0;
 const buffers=[];
 const device={limits:{maxStorageBufferBindingSize:1e7},
  createShaderModule(){return {getCompilationInfo:async()=>({messages:[]})}},
  async createComputePipelineAsync(){pipelines++;return {getBindGroupLayout:()=>({})}},
  createBuffer({size}){let b={bytes:new ArrayBuffer(size),destroyed:false,
   async mapAsync(){mapCount++},getMappedRange(){return this.bytes},unmap(){},
   destroy(){this.destroyed=true}};buffers.push(b);return b},
  createBindGroup(){return {}},
  createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
   dispatchWorkgroups(){dispatches++},end(){}}},
   copyBufferToBuffer(src,_start,dest){dest.bytes=src.bytes.slice(0)},finish(){return {}}}},
  queue:{writeBuffer(b,offset,data){new Uint8Array(b.bytes).set(
   new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset)},submit(){}},
  destroy(){this.destroyed=true}};
 const deps={navigator:{gpu:{requestAdapter:async()=>{adapters++;return {
  requestDevice:async()=>{devices++;return device}}}}},GPUBufferUsage:usage,GPUMapMode:{READ:1}};
 const out=await gpu.solveBatch(req,deps,{warmRepeats:3});
 assert.equal(adapters,1);assert.equal(devices,1);assert.equal(pipelines,2);
 assert.equal(buffers.length,5);assert.equal(mapCount,4);assert.equal(dispatches,8);
 assert.equal(out.telemetry.length,3);
 assert.equal(out.timing.warmRunMs.length,3);
 assert.equal(out.timing.warmOutputBitwiseStable,true);
 assert.equal(typeof out.timing.gpuWarmMedianMs,'number');
 assert.ok(buffers.every(b=>b.destroyed));assert.ok(device.destroyed);
 await assert.rejects(gpu.solveBatch(req,deps,{warmRepeats:6}),/repeat count/);
});
test('140.12.1: diagnostic browser mode remains in single canonical HTML',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/CurvatureWebGPUBatchDiagnostics14121\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.1-diagnostics\.json/);
 assert.match(html,/value="5" selected/);
 assert.match(html,/for\(var i=0;i<6;i\+\+\)/);
 const named=fs.readdirSync(path.join(__dirname,'../tools')).filter(x=>/webgpu-optics.*\.html/.test(x));
 assert.deepEqual(named,['webgpu-optics.html']);
});

test('140.12.1: missing WebGPU fails closed without claiming measurements or production readiness',async()=>{
 const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
 const r=await diagnostic.run(fixture,{navigator:{}});
 assert.equal(r.version,'140.12.1');
 assert.equal(r.status,'incomplete');
 assert.equal(r.decision.verdict,'INCONCLUSIVE');
 assert.equal(r.decision.productionAuthorized,false);
 assert.ok(r.scenes.every(s=>s.status==='unavailable'&&s.reason==='WebGPU unavailable'));
});
