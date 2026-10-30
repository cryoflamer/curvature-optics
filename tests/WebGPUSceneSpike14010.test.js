'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const precise=require('../src/diagnostics/CurvatureWebGPUOpticsPrecision14091');
const matrix=require('../src/diagnostics/CurvatureWebGPUOpticsMatrix1409');
const spike=require('../src/diagnostics/CurvatureWebGPUSceneSpike14010');
const generated=require('../tools/generate-webgpu-scene-targets-14010');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics-14010.html'),'utf8');
function passedCase(id){return {id,count:64,status:'measured',
 baseline:{ms:200,shootRK4Calls:200},
 hybrid:{gpuBatchMs:2,cpuCertificationMs:20,warmStartAccepted:25,warmStartAttempts:64,shootRK4Calls:100},
 comparison:{statusMismatch:0,angleMismatch:0,maxAngularErrorRadians:1e-10,unresolved:0}};}
function passingReport(){return {scenes:[passedCase('towers-12.flat'),passedCase('towers-12.globe')],
 timing:{coldSpeedup:3}};}

test('140.10: stale naive 100-km Vacuum analytic failures do not invalidate compensated 18/18 pass',()=>{
 const cases=matrix.cases();
 const rows=cases.map(x=>({id:x.id,parameters:x.parameters,
  naive:{status:'measured',qualified:!x.id.endsWith('.long'),
   validation:{qualified:!x.id.endsWith('.long'),failedRays:0,nonFiniteRays:0},
   analyticVacuum:x.parameters.atmosphere==='vacuum'?{
    cpuVsAnalytic:{qualified:true},gpuVsAnalytic:{qualified:!x.id.endsWith('.long')}}:null},
  compensated:{status:'measured',qualified:true,timing:{ratioCpuToGpu:8},
   validation:{qualified:true,failedRays:0,nonFiniteRays:0},
   analyticVacuum:x.parameters.atmosphere==='vacuum'?{
    cpuVsAnalytic:{qualified:true},gpuVsAnalytic:{qualified:true}}:null}}));
 const decision=precise.evaluate(rows,18);
 assert.equal(decision.verdict,'SPIKE_CANDIDATE');
 assert.equal(decision.failedAnalyticalChecks,0);
 assert.equal(decision.baselineFailedAnalyticalChecks,2);
 rows[1].compensated.analyticVacuum.gpuVsAnalytic.qualified=false;
 assert.equal(precise.evaluate(rows,18).verdict,'NUMERICAL_STOP');
});

test('140.10: committed target fixture exactly regenerates from real production meshes',()=>{
 assert.deepEqual(fixture,generated.fixture());
 assert.deepEqual(fixture.scenes.map(s=>s.id),['towers-12.flat','towers-12.globe']);
 assert.ok(fixture.scenes.every(s=>s.targets.length===64&&s.sourceVertexCount>=64));
 assert.equal(spike.validateFixture(fixture),fixture);
 for(const scene of fixture.scenes){
  const points=spike.targets(scene),input=spike.seeds(scene);
  assert.equal(points.length,64);assert.equal(input.length,256);
  assert.ok(points.every(p=>p[0]>0&&Number.isFinite(p[1])));
 }
});

test('140.10: GPU shader is based on compensated RK4 and emits only candidate angles',()=>{
 assert.match(spike.WGSL,/advanceCompensated\(s,ds,correction\)/);
 assert.match(spike.WGSL,/for\(var attempt=0u;attempt<4u/);
 assert.match(spike.WGSL,/results\.data\[i\]=vec4f\(angle,residual,endpoint\.x,endpoint\.y\)/);
 assert.doesNotMatch(spike.WGSL,/status|visible|blocked/);
});

test('140.10: unchanged CPU solver certifies all real scene targets and does not trust GPU status',()=>{
 const s=fixture.scenes[0],reference=spike.solveScene(s);
 const candidates=spike.solveScene(s,Array(64).fill(NaN));
 assert.deepEqual(candidates.results,reference.results);
 assert.equal(reference.results.length,64);
 assert.equal(candidates.warmStartAccepted,0);
 assert.equal(candidates.warmStartAttempts,0);
});

test('140.10: stage success never authorizes production',()=>{
 assert.deepEqual(spike.evaluate(passingReport()).verdict,'STAGE_PASS_ONLY');
 assert.equal(spike.evaluate(passingReport()).productionAuthorized,false);
 assert.equal(spike.evaluate(passingReport()).experimentsRemaining,0);
 const slow=passingReport();slow.timing.coldSpeedup=1.4;
 assert.equal(spike.evaluate(slow).verdict,'SCENE_PERFORMANCE_STOP');
 const mismatch=passingReport();mismatch.scenes[0].comparison.statusMismatch=1;
 assert.equal(spike.evaluate(mismatch).verdict,'SCENE_NUMERICAL_STOP');
 const unresolved=passingReport();unresolved.scenes[1].comparison.unresolved=1;
 assert.equal(spike.evaluate(unresolved).verdict,'SCENE_NUMERICAL_STOP');
 const cold=passingReport();cold.scenes[1].hybrid.warmStartAccepted=0;
 assert.equal(spike.evaluate(cold).verdict,'SCENE_PERFORMANCE_STOP');
 const partial=passingReport();partial.scenes[0].status='unavailable';
 assert.equal(spike.evaluate(partial).verdict,'INCONCLUSIVE');
});

test('140.10: scene equality requires both shooting status and direction agreement',()=>{
 const a=[{status:'visible',angle:0},{status:'blocked',angle:0.1}];
 assert.deepEqual(spike.compare(a,a).statusMismatch,0);
 assert.equal(spike.compare(a,[{status:'blocked',angle:0},{status:'blocked',angle:0.1}]).statusMismatch,1);
 assert.equal(spike.compare(a,[{status:'visible',angle:0.0001},{status:'blocked',angle:0.1}]).angleMismatch,1);
 assert.equal(spike.compare(a,[{status:'visible',angle:0},{status:'indeterminate',angle:0.1}]).unresolved,1);
});

test('140.10: malformed fixtures and WebGPU unavailability fail closed',async()=>{
 const malformed=JSON.parse(JSON.stringify(fixture));malformed.scenes[0].targets[0][0]=-1;
 assert.throws(()=>spike.validateFixture(malformed),/Invalid scene target/);
 assert.equal((await spike.run(fixture,{navigator:{}})).status,'unavailable');
 assert.equal((await spike.run(fixture,{navigator:{}})).productionAuthorized,false);
});

test('140.10: browser page uses production fixture and reports cold path without a selector',()=>{
 assert.match(html,/webgpu-real-scene-targets-14010\.json/);
 assert.match(html,/CurvatureWebGPUSceneSpike14010\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.10-scene-spike\.json/);
 assert.match(html,/hybridColdMs/);
 assert.doesNotMatch(html,/enableGPU|backendSelector/);
});

test('140.10: mocked GPU candidates reach the unchanged CPU scene solver and cold accounting',async()=>{
  const buffers=[];
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const makeBuffer=({size})=>{const buffer={array:new ArrayBuffer(size),destroyed:false,
    getMappedRange(){return this.array;},mapAsync:async()=>{},unmap(){},destroy(){this.destroyed=true;}};
    buffers.push(buffer);return buffer;};
  const device={limits:{maxStorageBufferBindingSize:1000000},destroy(){this.destroyed=true;},
    createShaderModule({code}){assert.equal(code,spike.WGSL);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBuffer:makeBuffer,createBindGroup:({entries})=>({entries}),
    createCommandEncoder:()=>{
      let binding,src,dst,read;
      return {beginComputePass(){return {setPipeline(){},setBindGroup(_,b){binding=b;},dispatchWorkgroups(){},end(){}};},
        copyBufferToBuffer(a,_ao,b){src=binding.entries[0].resource.buffer;
          dst=a;read=b;},finish(){return {execute(){
            const inp=new Float32Array(src.array),out=new Float32Array(dst.array);
            for(let i=0;i<inp.length;i+=4){out[i]=inp[i+3];out[i+1]=0;
              out[i+2]=inp[i];out[i+3]=inp[i+1];}
            new Uint8Array(read.array).set(new Uint8Array(dst.array));
          }};}};
    },queue:{writeBuffer(buffer,offset,values){new Uint8Array(buffer.array,offset).set(
      new Uint8Array(values.buffer,values.byteOffset,values.byteLength));},
      submit(commands){commands.forEach(x=>x.execute());}}};
  const result=await spike.run(fixture,{navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}});
  assert.equal(result.status,'finished');
  assert.equal(result.scenes.length,2);
  assert.equal(result.scenes[0].count,64);
  assert.ok(result.timing.hybridColdMs>=result.timing.cpuCertificationMs);
  assert.ok(result.timing.hybridColdMs>=result.timing.gpuSetupMs);
  assert.equal(result.decision.productionAuthorized,false);
  assert.ok(buffers.every(b=>b.destroyed));assert.equal(device.destroyed,true);
});

test('140.10: shader compilation failure cannot be reported as an authorized scene result',async()=>{
  const device={destroyed:false,destroy(){this.destroyed=true;},
    createShaderModule:()=>({getCompilationInfo:async()=>({messages:[
      {type:'error',message:'Deliberate WGSL compile error'}]})})};
  await assert.rejects(spike.run(fixture,{navigator:{gpu:{requestAdapter:async()=>({
    requestDevice:async()=>device})}},GPUBufferUsage:{},GPUMapMode:{}}),/Scene WGSL compilation failed/);
  assert.equal(device.destroyed,true);
});
