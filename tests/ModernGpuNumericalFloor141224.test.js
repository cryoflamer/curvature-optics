'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const audit=require('../src/diagnostics/CurvatureGpuNumericalFloor141224');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
  observerHeight:15,atmosphere:'standard',controls:{step:500,targetTolerance:0.0001},
  targets:[[60,0],[350,0]]};}
test('140.12.24: new opt-in trace shaders keep the baseline untouched',()=>{
  assert.match(gpu.WGSL_REFINE_TRACE,/@binding\(4\) var<storage, read_write> iterationTrace/);
  assert.match(gpu.WGSL_REFINE_TRACE,/iterationTrace\.data\[i\*12u\+\(iter%12u\)\]/);
  assert.match(gpu.WGSL_REFINE_TRACE,/altitude\(endpoint\)-altitude\(vec4f\(t\.x,t\.y/);
  assert.match(gpu.WGSL_REFINE_ANGLE_BRACKET_TRACE,/iterationTrace\.data\[i\*12u\+\(iter%12u\)\]/);
  assert.match(gpu.WGSL_PREDICT_GATED_REFINE_TRACE,/results\.data\[i\*3u\]\.w>0\.5/);
  assert.doesNotMatch(gpu.WGSL_REFINE,/@binding\(4\)|iterationTrace|localResidual/);
  assert.doesNotMatch(gpu.WGSL_PREDICT,/@binding\(4\)|iterationTrace/);
});
test('140.12.24: trace ring decodes last 12 iterations in order and ignores predictor hits',()=>{
  const r=request(),raw=new Float32Array(2*12*4);
  for(let i=0;i<raw.length;i+=4)raw[i]=-999;
  for(let iter=16;iter<28;iter++){
    const offset=(iter%12)*4;
    raw.set([Math.fround(0.1+iter*0.00001),Math.fround(0.001/iter),
      Math.fround(0.01/iter),Math.fround(0.0009/iter)],offset);
  }
  const out=gpu.decodeRefinementTrace(r,raw,[
    {bracketIndex:8,refineIterations:28},{bracketIndex:-2,refineIterations:2}]);
  assert.equal(out[0].trace.length,12);
  assert.deepEqual(out[0].trace.map(x=>x.iteration),Array.from({length:12},(_,i)=>17+i));
  assert.equal(out[0].trace[0].residualMetres,Math.fround(0.001/16));
  assert.equal(out[0].trace[11].localAltitudeResidualMetres,Math.fround(0.0009/27));
  assert.deepEqual(out[1].trace,[]);
  assert.throws(()=>gpu.decodeRefinementTrace(r,new Float32Array(4),[]),/shape/);
});
test('140.12.24: unit-in-the-last-place diagnostic is f32-aware at signed angles',()=>{
  assert.equal(audit.ulp32(0),Math.pow(2,-149));
  assert.equal(audit.ulp32(1),Math.pow(2,-23));
  assert.equal(audit.ulp32(-1),Math.pow(2,-24));
  assert.equal(audit.ulp32(NaN),null);
});
function fakeAudit(){
  const targets=Array.from({length:48},(_,i)=>[60+i,0]);
  const ladder={request:{targets},coordinates:targets.map(([d])=>({distanceMetres:d,heightMetres:0}))};
  const cpu={results:targets.map(t=>({target:t.slice(),status:'visible',angle:0}))};
  const batches={};
  for(const name of ['predictor5mm','predictorStrict','sweepStrict','bracketStrict']){
    const telemetry=targets.map((_,i)=>({bracketIndex:name==='predictor5mm'?-2:3,
      refineIterations:name==='predictor5mm'?2:28}));
    const trace=targets.map((target,i)=>({targetIndex:i,target:target.slice(),trace:i===0&&name!=='predictor5mm'?
      [{iteration:26,angleRadians:Math.fround(.01),residualMetres:.0003,
        localAltitudeResidualMetres:.00029,bracketWidthRadians:Math.pow(2,-29)},
       {iteration:27,angleRadians:Math.fround(.01),residualMetres:.0003,
        localAltitudeResidualMetres:.00029,bracketWidthRadians:Math.pow(2,-30)}]:[]}));
    batches[name]={response:{results:targets.map(t=>({target:t.slice(),
      status:name==='predictor5mm'?'visible':'solver_failed',angle:null,residual:null}))},
      telemetry,refinementTrace:name==='predictor5mm'?null:trace};
  }
  return {ladder,cpu,batches};
}
test('140.12.24: numerical floor is an audit label, never a visibility override',()=>{
  const {ladder,cpu,batches}=fakeAudit();
  const out=audit.measured(ladder,batches,cpu);
  assert.equal(out.version,'140.12.24');
  assert.equal(out.variants.predictor5mm.solverFailed,0);
  assert.equal(out.variants.sweepStrict.solverFailed,48);
  assert.equal(out.variants.sweepStrict.numericFloorCandidates,1);
  assert.equal(out.variants.sweepStrict.angularPlateauSteps,1);
  assert.equal(out.variants.sweepStrict.tracedTargets,1);
  assert.ok(out.variants.sweepStrict.maxDirectVsLocalResidualGapMetres>0);
  assert.equal(out.perTargetResults.find(x=>x.variant==='sweepStrict').gpuStatus,'solver_failed');
  assert.equal(out.productionAuthorized,false);
  assert.equal(out.framePaintingChanged,false);
  batches.sweepStrict.refinementTrace[0].trace[1].iteration=26;
  assert.throws(()=>audit.measured(ladder,batches,cpu),/Corrupt GPU refinement trace/);
});
test('140.12.24: optional trace allocates and reads only active target bytes',async()=>{
  const r=request(),usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},copies=[],buffers=[];
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){assert.ok(code.length>100);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBindGroup({entries}){return entries;},
    createBuffer({size}){const buffer={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(o,l){return this.bytes.slice(o,o+l);},unmap(){}};
      buffers.push(buffer);return buffer;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(src,o,dst,q,len){copies.push(len);
        new Uint8Array(dst.bytes,q,len).set(new Uint8Array(src.bytes,o,len));},finish(){return {}}};},
    queue:{writeBuffer(b,o,arr){new Uint8Array(b.bytes,o,arr.byteLength).set(
      new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const session=await gpu.createSession(48,deps,{algorithm:'sweep',traceRefinement:true});
  try{
    const out=await session.solve(r);
    assert.equal(out.refinementTrace.length,2);
    assert.deepEqual(copies,[2*48,2*12*16]);
    assert.equal(out.response.results.length,2);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
});
