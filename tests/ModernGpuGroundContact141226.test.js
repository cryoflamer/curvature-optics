'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const moduleUnderTest=require('../src/diagnostics/CurvatureGpuGroundContact141226');
const batch=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function request(targets=[[60,0],[350,0]]){
  return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
    observerHeight:15,atmosphere:'standard',
    controls:{step:500,targetTolerance:0.005,eventSubsteps:8},targets};
}
test('140.12.26: bounded separate fixed-angle WGSL uses the same f32 RK4/altitude, not shooting',()=>{
  const s=moduleUnderTest.WGSL;
  assert.match(s,/fn advanceCompensated/);
  assert.match(s,/return s\.y\+k\*s\.x\*s\.x\//);
  assert.match(s,/let t=seeds\.data\[i\]/);
  assert.match(s,/cos\(t\.w\),sin\(t\.w\)/);
  assert.match(s,/previousH>0\.0 && h<0\.0/);
  assert.match(s,/if\(proximity<0\.0 && h<=contactTol\)/);
  assert.match(s,/if\(h<minimumH\)/);
  assert.match(s,/if\(firstNegative<0\.0 && h<0\.0\)/);
  assert.match(s,/results\.data\[out\+3u\]/);
  assert.doesNotMatch(s,/sampleIndex|coarse\.data|bestAngle|candidateBrackets/);
  assert.doesNotMatch(batch.WGSL_PREDICT,/crossingSampleWidth|firstNegative/);
  assert.deepEqual(moduleUnderTest.GPU_MODES.map(x=>[x.step,x.eventSubsteps]),
    [[500,8],[500,16],[50,8]]);
});
test('140.12.26: independently decoded GPU event evidence retains sub-millimetre terminal distance',()=>{
  const r=request(),a=[0.002,-0.0003],raw=new Float32Array(32);
  raw.set([1,60.123,-0.000075,0,60.1227,0.00002,-0.00007,59.99,
    60.12,-0.00002,-0.00007,60.122,0.000001,0.013,60.12,-0.00007]);
  raw.set([1,350.02,-0.0024,-0.0024,349.964,0.00001,-0.0024,349.95,
    349.9,0.000001,-0.0024,350.02,0.00002,0.25,349.9,-0.0024],16);
  const trace=moduleUnderTest.decode(r,a,raw);
  assert.equal(trace.length,2);
  assert.equal(trace[0].firstCrossingPathMetres,Math.fround(60.1227));
  assert.equal(trace[1].minSampledAltitudeMetres,Math.fround(-0.0024));
  assert.equal(trace[1].crossingBeforeAltitudeMetres,Math.fround(0.00001));
  assert.equal(trace[0].angleRadians,0.002);
  assert.throws(()=>moduleUnderTest.decode(r,a,new Float32Array(3)),/mismatch/);
  raw[0]=2;assert.throws(()=>moduleUnderTest.decode(r,a,raw),/validity/);
  raw[0]=1;raw[6]=NaN;assert.throws(()=>moduleUnderTest.decode(r,a,raw),/Nonfinite/);
});
test('140.12.26: no event, grazing, and CPU f64 fixed-angle trace remain distinct',()=>{
  const req=request([[60,0]]);
  const replay=moduleUnderTest.cpuFixedAngle(req,Math.atan2(-15,60),
    Math.hypot(60,15),50,8);
  assert.equal(replay.status,'measured');
  assert.equal(typeof replay.endpointAltitudeMetres,'number');
  assert.equal(typeof replay.endpointXErrorMetres,'number');
  const unavailable=moduleUnderTest.cpuFixedAngle(req,0,null,50,8);
  assert.equal(unavailable.status,'unavailable');
});
function fixture(){
  const distances=[60,350,1250,2100,3900,5400],heights=[0,.000001,.01,.1,1,5,20,50];
  const targets=distances.flatMap(d=>heights.map(h=>[d,h]));
  const r=request(targets),coords=distances.flatMap(d=>heights.map(h=>({distanceMetres:d,heightMetres:h})));
  const angles=targets.map(([d,h])=>Math.atan2(h-15,d));
  const source={response:{results:targets.map((target,i)=>({target:target.slice(),angle:angles[i],
    status:coords[i].distanceMetres<=1250&&coords[i].heightMetres<=.000001?'indeterminate':'visible',
    pathLength:Math.hypot(target[0],target[1]-15),
    ground:{event:null}}))}};
  const cpu={results:targets.map((target,i)=>({target:target.slice(),angle:angles[i],status:'visible'}))};
  const traces=targets.map((target,i)=>({targetIndex:i,angleRadians:angles[i],valid:true,
    pathLengthMetres:Math.hypot(target[0],target[1]-15),firstCrossingPathMetres:null,
    firstProximityPathMetres:null,minSampledAltitudeMetres:.00001}));
  const replays={};for(const mode of moduleUnderTest.GPU_MODES)replays[mode.id]={traces};
  return {ladder:{request:r,coordinates:coords},source,replays,cpu};
}
test('140.12.26: all 144 rows, six near-surface targets per mode; no status promotion',()=>{
  const f=fixture(),out=moduleUnderTest.analyze(f.ladder,f.source,f.replays,f.cpu);
  assert.equal(out.version,'140.12.26');
  assert.equal(out.perTargetResults.length,144);
  assert.equal(out.nearSurfaceCases.length,18);
  assert.equal(out.summaries.step500Sub8.angleStatusMismatches,6);
  assert.deepEqual(out.modes.map(x=>x.id),['step500Sub8','step500Sub16','step50Sub8']);
  assert.equal(out.productionAuthorized,false);
  assert.equal(out.framePaintingChanged,false);
  assert.equal(out.cpuShootingFallback,false);
  const row=out.nearSurfaceCases[0];
  assert.equal(row.originalGpuStatus,'indeterminate');
  assert.equal(row.cpuShootingStatus,'visible');
  assert.equal(row.cpuF64SameAngle.status,'measured');
  assert.equal(row.gpuCrossingBeforeEndMetres,null);
  f.replays.step50Sub8.traces[0]=Object.assign({},f.replays.step50Sub8.traces[0],{angleRadians:0.8});
  assert.throws(()=>moduleUnderTest.analyze(f.ladder,f.source,f.replays,f.cpu),/identical GPU angle/);
});
test('140.12.26: Compare button, export, GPU-first before f64 replay, no painting',()=>{
  assert.match(html,/CurvatureGpuGroundContact141226\.js/);
  assert.match(html,/ModernGpuGroundAuditRun/);
  assert.match(app,/addEventListener\('click',runGpuGroundAudit141226\)/);
  assert.match(app,/curvature-compare-140\.12\.26-gpu-ground-contact\.json/);
  const body=app.slice(app.indexOf('async function runGpuGroundAudit141226(){'),
    app.indexOf('function bindCompareGpuProbe(){'));
  assert.ok(body.indexOf('await contract.solveCpuBatch')>body.indexOf('await groundSession.solve'));
  assert.ok(body.indexOf('await groundSession.solve')>body.indexOf('await shooting.solve'));
  assert.match(body,/angles=source\.response\.results\.map/);
  assert.match(body,/if\(!angles\.every/);
  assert.doesNotMatch(body,/renderComposition|renderPhysical|cpuFallback|status='visible'/);
});
test('140.12.26: WebGPU fake session writes GPU angles, reads only active rows and tears down',async()=>{
  const r=request(),angles=[0.003,0.004],usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},
    copies=[],buffers=[],writes=[];
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){assert.equal(code,moduleUnderTest.WGSL);
      return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBindGroup({entries}){return entries;},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(o,l){return this.bytes.slice(o,o+l);},unmap(){}};
      buffers.push(b);return b;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(src,o,dst,q,len){copies.push(len);
        new Uint8Array(dst.bytes,q,len).set(new Uint8Array(src.bytes,o,len));},finish(){return {}}};},
    queue:{writeBuffer(b,o,arr){if(arr instanceof Float32Array)writes.push(Array.from(arr));
      new Uint8Array(b.bytes,o,arr.byteLength).set(new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const session=await moduleUnderTest.createSession(48,deps);
  try{
    const report=await session.solve(r,angles);
    assert.deepEqual(copies,[2*64]);
    assert.equal(report.traces.length,2);
    assert.equal(report.traces[0].valid,false);
    assert.equal(writes[0][3],Math.fround(angles[0]));
    assert.equal(writes[0][7],Math.fround(angles[1]));
    await assert.rejects(()=>session.solve(r,[NaN,0]),/must align/);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
  await assert.rejects(()=>moduleUnderTest.createSession(1,{navigator:{}}),/unavailable/);
});
