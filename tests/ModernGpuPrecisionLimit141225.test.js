'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const audit=require('../src/diagnostics/CurvatureGpuPrecisionLimit141225');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
  observerHeight:15,atmosphere:'standard',controls:{step:500,targetTolerance:0.0001},
  targets:[[60,0],[350,0]]};}
test('140.12.25: isolated precision-aware shader uses f32 representability and verified ground',()=>{
  const s=gpu.WGSL_REFINE_PRECISION_AWARE;
  assert.match(s,/fn nextUpF32\(x:f32\)/);
  assert.match(s,/bestAngle=a\.x/);
  assert.match(s,/abs\(shot\.residual\)<abs\(bestResidual\)/);
  assert.match(s,/angle<=a\.x \|\| angle>=b\.x/);
  assert.match(s,/b\.x-a\.x<=2\.0\*angleUlp && noImprovement>=1u/);
  assert.match(s,/let shot=arrival\(t,angle,true\)/);
  assert.match(s,/status=4\.0/);
  assert.match(s,/status==0\.0 && precisionSaturated && shot\.valid>0\.5/);
  assert.doesNotMatch(gpu.WGSL_REFINE,/precisionSaturated|status=4\.0/);
  assert.doesNotMatch(gpu.WGSL_REFINE_ANGLE_BRACKET,/precisionSaturated|status=4\.0/);
  assert.doesNotMatch(gpu.WGSL_PREDICT,/precisionSaturated|status=4\.0/);
});
test('140.12.25: strict trace overwrites wrapped slot before early break',()=>{
  const s=gpu.WGSL_REFINE_ANGLE_BRACKET_TRACE;
  assert.match(s,/usedIterations=iter\+1u;\s*iterationTrace\.data\[i\*12u\+\(iter%12u\)\]=vec4f\(-999\.0/);
  assert.ok(s.indexOf('vec4f(-999.0')<s.indexOf('if(a.y==0.0)'));
  assert.match(gpu.WGSL_REFINE_PRECISION_AWARE_TRACE,/iterationTrace\.data\[i\*12u\+\(iter%12u\)\]=vec4f\(-999\.0/);
});
test('140.12.25: status 4 is an uncertified diagnostic, never an accepted response',()=>{
  const r=request(),raw=new Float32Array(r.targets.length*12);
  raw.set([0.01,0.0003,350,4,349.99,1,1,1,16,20,0.009999,0.010001],0);
  raw.set([0.02,0.00005,360,1,-1,0,1,1,16,20,0.019999,0.020001],12);
  const out=gpu.decode(r,raw),tel=gpu.decodeTelemetry(r,raw);
  assert.equal(out.results[0].status,'solver_failed');
  assert.equal(out.results[0].angle,null);
  assert.match(out.results[0].reason,/precision-limited candidate/);
  assert.equal(tel[0].precisionLimited,true);
  assert.equal(tel[0].candidateAngleRadians,Math.fround(0.01));
  assert.equal(tel[0].candidateContactCode,1);
  assert.equal(tel[1].precisionLimited,false);
  assert.equal(tel[1].candidateAngleRadians,null);
  assert.equal(out.results[1].status,'visible');
});
function fixture(){
  const targets=Array.from({length:48},(_,i)=>[60+i,0]);
  const ladder={request:{targets},coordinates:targets.map(([d])=>({distanceMetres:d,heightMetres:0}))};
  const cpu={results:targets.map(t=>({target:t.slice(),status:'visible',angle:0}))};
  const batches={};
  for(const name of ['predictor5mm','predictorStrict','sweepStrict','bracketStrict','precisionAware']){
    const report=targets.map((target,i)=>({target:target.slice(),status:name==='precisionAware'&&i===0?'solver_failed':'visible',
      angle:name==='precisionAware'&&i===0?null:0.0001,residual:null}));
    const telemetry=targets.map((_,i)=>({targetIndex:i,bracketIndex:name==='predictor5mm'?-2:16,
      rawStatusCode:name==='precisionAware'&&i===0?4:1,
      precisionLimited:name==='precisionAware'&&i===0,
      candidateAngleRadians:name==='precisionAware'&&i===0?0.00001:null,
      candidateResidualMetres:name==='precisionAware'&&i===0?0.0002:null,
      candidatePathLengthMetres:name==='precisionAware'&&i===0?150:null,
      candidateImpactPathLengthMetres:name==='precisionAware'&&i===0?149.99:null,
      candidateContactCode:name==='precisionAware'&&i===0?1:null,
      refineIterations:name==='predictor5mm'?2:20,
      finalBracketWidthRadians:name==='predictor5mm'?null:1e-9}));
    const trace=targets.map((_,i)=>({targetIndex:i,trace:i===0?
      [{iteration:18,angleRadians:.01,bracketWidthRadians:2e-8,residualMetres:.001},
       {iteration:19,angleRadians:.01,bracketWidthRadians:1e-8,residualMetres:.0002}]:[]}));
    batches[name]={response:{results:report},telemetry,
      refinementTrace:name==='predictor5mm'?null:trace};
  }
  return {ladder,cpu,batches};
}
test('140.12.25: per-target candidate remains solver_failed and maintains independent angle',()=>{
  const f=fixture(),out=audit.measured(f.ladder,f.batches,f.cpu);
  assert.equal(out.version,'140.12.25');
  assert.equal(out.variants.precisionAware.precisionLimited,1);
  assert.equal(out.variants.precisionAware.solverFailed,1);
  assert.equal(out.variants.precisionAware.candidateAngles,1);
  assert.equal(out.variants.precisionAware.nearEndpointCandidates,1);
  assert.equal(out.variants.precisionAware.reportedVisibleFromCandidates,0);
  assert.equal(out.traceIntervalWideningViolations.length,0);
  const candidate=out.perTargetResults.find(x=>x.variant==='precisionAware'&&x.distanceMetres===60);
  assert.equal(candidate.diagnosticOutcome,'precision_limited');
  assert.equal(candidate.gpuStatus,'solver_failed');
  assert.equal(candidate.candidateIsCertified,false);
  assert.equal(candidate.candidateGroundContact,'crossing');
  assert.equal(out.productionAuthorized,false);
  assert.equal(out.framePaintingChanged,false);
});
test('140.12.25: widened trace and unsafe candidate are flagged, never silently accepted',()=>{
  const f=fixture();
  f.batches.bracketStrict.refinementTrace[0].trace[1].bracketWidthRadians=0.1;
  const out=audit.measured(f.ladder,f.batches,f.cpu);
  assert.equal(out.variants.bracketStrict.intervalWideningViolations,1);
  assert.equal(out.traceIntervalWideningViolations.length,1);
  f.batches.precisionAware.telemetry[0].candidateResidualMetres=0.00001;
  assert.throws(()=>audit.measured(f.ladder,f.batches,f.cpu),/Unsafe or invalid/);
});
test('140.12.25: opt-in precision aware session composes trace bind group and tears down',async()=>{
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
  const session=await gpu.createSession(48,deps,{algorithm:'sweep',refinement:'precision-aware',traceRefinement:true});
  try{
    const out=await session.solve(r);
    assert.equal(out.algorithm.refinement,'precision-aware');
    assert.equal(out.refinementTrace.length,2);
    assert.deepEqual(copies,[2*48,2*12*16]);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
  await assert.rejects(()=>gpu.createSession(2,deps,{algorithm:'predictor',refinement:'precision-aware'}),
    /requires residual-stop/);
});
