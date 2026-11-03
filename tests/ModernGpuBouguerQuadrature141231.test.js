'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const q=require('../src/diagnostics/CurvatureGpuBouguerQuadrature141231');
const bouguer=require('../src/diagnostics/CurvatureBouguerInvariant141227');
const precision=require('../src/diagnostics/CurvatureGpuPrecisionFoundation141228');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const coordinates=[{distanceMetres:60,heightMetres:0},{distanceMetres:1250,heightMetres:1e-6}];
function request(coords=coordinates){
  const globe=surfaces.createFromCurvature(1/6371000);
  return {branch:contract.BRANCH,geometry:'globe',radius:6371000,
    observerHeight:15,atmosphere:'standard',
    controls:{step:500,targetTolerance:.005,eventSubsteps:8},
    targets:coords.map(c=>globe.surfacePoint2(c.distanceMetres,c.heightMetres))};
}
test('140.12.31: DS invariant, atmosphere, quadrature, sqrt and contact subtraction are explicit and bounded',()=>{
  assert.deepEqual(q.NODES,[128,256,512]);
  assert.deepEqual(q.MODES,[
    'classic_ds_128','classic_ds_256','classic_ds_512',
    'integer_residual_ds_128','integer_residual_ds_256','integer_residual_ds_512']);
  assert.equal(q.shader('classic_ds_128',request()),q.shader('classic_ds_512',request()));
  assert.equal(q.shader('integer_residual_ds_128',request()),q.shader('integer_residual_ds_512',request()));
  assert.notEqual(q.shader('classic_ds_128',request()),q.shader('integer_residual_ds_128',request()));
  for(const mode of q.MODES){
    const s=q.shader(mode,request());
    assert.match(s,/let logB=dsAdd\(dsLogF/);
    assert.match(s,/let z=dsMul\(ds\(2\.0,0\.0\),dsSub\(dsLogF/);
    assert.match(s,/dsSqrt\(radicand\)/);
    assert.match(s,/sum=dsAdd\(sum,dsDiv\(numerator,denominator\)\)/);
    assert.match(s,/margin=dsMul\(dsSub\(theta,phi\),radius\)/);
    assert.match(s,/let arc=arcs\.data\[i\]/);
    assert.match(s,/let theta=dsDiv\(ds\(arc\.x,arc\.y\),radius\)/);
    assert.match(s,/const VACUUM:bool=false/);
    assert.doesNotMatch(s,/@VACUUM@|\bprecise\b/);
    assert.match(s,/let nodeCount=config\[1\];/);
    assert.match(s,/j<nodeCount/);
    assert.doesNotMatch(s,/const NODE_COUNT/);
    assert.doesNotMatch(s,/const MODE:u32|if\(MODE==|fn oneStep\(/);
    assert.equal((s.match(/fn twoSum\(/g)||[]).length,1);
    assert.equal((s.match(/fn twoProd\(/g)||[]).length,1);
    if(mode.startsWith('classic')){
      assert.doesNotMatch(s,/fn intTwoSum|fn u64add|fn classicTwoSum/);
      assert.match(s,/let e=\(a-\(s-v\)\)\+\(b-v\)/);
    }else{
      assert.doesNotMatch(s,/fn classicTwoSum|fn classicTwoProd/);
      assert.match(s,/fn u64add/);
    }
  }
  assert.match(q.shader('classic_ds_256',{...request(),atmosphere:'vacuum'}),/const VACUUM:bool=true/);
  assert.throws(()=>q.wgsl('f64'),/Unknown Bouguer quadrature mode/);
  assert.throws(()=>q.environment({...request([{distanceMetres:5400,heightMetres:0}]),observerHeight:250}),/domain exceeded/);
  assert.throws(()=>q.shader('classic_ds_256',{...request([{distanceMetres:5400,heightMetres:0}]),observerHeight:100,profileOptions:{scaleHeight:4000}}),/observer height \/ scale height/);
});
test('140.12.31: original f64 inputs survive separate hi/lo constants',()=>{
  const p=q.packedConstants(request());
  assert.equal(p.length,8);
  assert.deepEqual(Array.from(p.slice(0,2)),precision.split64(6371000));
  assert.deepEqual(Array.from(p.slice(2,4)),precision.split64(15));
  assert.deepEqual(Array.from(p.slice(4,6)),precision.split64(.000293));
  assert.deepEqual(Array.from(p.slice(6,8)),precision.split64(7350));
  const req=request();
  const raw=new Float32Array(24);
  raw.set([1,.0001,1e-12,.0002,2e-12,.2,3e-9,-.001,0,0,0,0],0);
  raw.set([0,0,0,.0002,2e-12,0,0,-.001,0,0,0,0],12);
  const t=q.decode(req,[-.1,-.05],raw);
  assert.equal(t[0].contactBeforeTarget,true);
  assert.equal(t[0].groundPolarAngleRadians,Math.fround(.0001)+Math.fround(1e-12));
  assert.equal(t[0].targetPolarAngleRadians,Math.fround(.0002)+Math.fround(2e-12));
  assert.equal(t[0].contactMarginSurfaceMetres,Math.fround(.2)+Math.fround(3e-9));
  assert.equal(t[1].contactBeforeTarget,null);
  assert.throws(()=>q.decode(req,[-.1,-.05],new Float32Array(10)),/readback mismatch/);
});
test('140.12.31: 48-case report keeps GPU angles, per-mode errors, CPU convergence and no production promotion',()=>{
  const coords=Array.from({length:48},(_,i)=>({distanceMetres:60+40*i,heightMetres:0}));
  const req=request(coords),angle=-.25;
  const cases=coords.map((c,i)=>({
    gpuAngleRadians:angle,
    gpuBouguer:{targetIndex:i,angleRadians:angle,phase:'ground_reachable',contactBeforeTarget:false,
      targetPolarAngleRadians:c.distanceMetres/req.radius,groundPolarAngleRadians:0,
      contactMarginSurfaceMetres:-.1},
    cpuF64Bouguer:{angleRadians:angle,status:'before_target',targetPolarAngleRadians:c.distanceMetres/req.radius,
      groundPolarAngleRadians:0,contactMarginSurfaceMetres:.1},
    cpuF64Quadrature256:{contactMarginSurfaceMetres:.1}
  }));
  const original={version:'140.12.27',assumptions:'monotone radial',perTargetResults:cases};
  const f32={traces:cases.map(c=>c.gpuBouguer),timing:{gpuDispatchToReadbackMs:3}};
  const variants={};
  for(const mode of q.MODES){variants[mode]={traces:coords.map((c,i)=>({
    targetIndex:i,angleRadians:angle,phase:'ground_reachable',contactBeforeTarget:true,
    targetPolarAngleRadians:c.distanceMetres/req.radius,groundPolarAngleRadians:0,
    contactMarginSurfaceMetres:.1})),timing:{gpuDispatchToReadbackMs:4}};}
  const report=q.analyze(original,{request:req,coordinates:coords},f32,variants);
  assert.equal(report.version,'140.12.31');
  assert.equal(report.integerResidualEvaluated,true);
  assert.equal(report.perCase.length,48*7);
  assert.equal(report.cpuNodeConvergence.length,48);
  assert.equal(report.summary.f32_quadrature_256.contactDisagreements,48);
  assert.equal(report.summary.classic_ds_256.contactDisagreements,0);
  assert.equal(report.productionAuthorized,false);
  assert.equal(report.framePaintingChanged,false);
  assert.equal(report.shootingChanged,false);
  assert.equal(report.cpuReferenceAfterGpu,true);
  variants.classic_ds_256.traces[0].angleRadians=0;
  assert.throws(()=>q.analyze(original,{request:req,coordinates:coords},f32,variants),/angle\/target mismatch/);
});
test('140.12.31: mocked WebGPU yields six independent readbacks, explicit DS inputs and cleanup',async()=>{
  const req=request(),angles=[.5280675292015076,-.05];
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const buffers=[],writes=[],nodeCounts=[],passes=[],modules=[],copies=[];
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){modules.push(code);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBindGroup({entries}){assert.equal(entries.length,5);return entries;},
    createBuffer({size}){let b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(o,l){return this.bytes.slice(o,o+l);},unmap(){}};
      buffers.push(b);return b;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
      dispatchWorkgroups(){passes.push(1);},end(){}};},
      copyBufferToBuffer(src,o,dst,q,len){copies.push(len);new Uint8Array(dst.bytes,q,len)
        .set(new Uint8Array(src.bytes,o,len));},finish(){return {};}};},
    queue:{writeBuffer(b,o,data){writes.push(data.constructor.name);
      if(data instanceof Uint32Array)nodeCounts.push(data[1]);
      new Uint8Array(b.bytes,o,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const compilationEvents=[];
  const session=await q.createSession(req,deps,{includeIntegerResidual:true,onCompileProgress:e=>compilationEvents.push(e)});
  try{
    const out=await session.solve(req,angles,coordinates);
    assert.equal(modules.length,2); // one compilation for each arithmetic, not each node count
    assert.equal(session.compilationTimings.length,6);
    assert.equal(compilationEvents.filter(e=>e.stage==='createComputePipelineAsync').length,2);
    assert.equal(writes.length,9); // three input buffers plus six per-dispatch node counts
    assert.deepEqual(copies,[96,96,96,96,96,96]);
    assert.equal(passes.length,6);
    for(const mode of q.MODES)assert.equal(out[mode].traces.length,2);
    assert.deepEqual(nodeCounts,[128,256,512,128,256,512]);
    assert.deepEqual(writes,[ 'Float32Array','Float32Array','Float32Array',
      'Uint32Array','Uint32Array','Uint32Array','Uint32Array','Uint32Array','Uint32Array' ]);
    assert.equal(q.validateSolveInputs(req,req,[.5280675292015076,-.05],coordinates),true);
    await assert.rejects(()=>session.solve(req,[-.75,-.05],coordinates),/inward polynomial angle domain exceeded at target 0/);
    await assert.rejects(()=>session.solve(req,angles,[coordinates[1],coordinates[0]]),/coordinate mismatch/);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
});

// Regression: the real #140.12.30 experiment included an outward ray at
// +0.5280675292 rad (60 m / 50 m). It must not reject the whole audit.
test('140.12.31.2: the 48-ray ladder accepts real upward GPU angle and rejects inward out-of-domain rays early',()=>{
  const ladder=require('../src/diagnostics/CurvatureGpuPrecisionAudit141222')
    .createLadder({branch:contract.BRANCH,geometry:'globe',radius:6371000,observerHeight:15},surfaces);
  const angles=Array(48).fill(-.01);
  angles[7]=.5280675292015076;
  assert.equal(q.validateSolveInputs(ladder.request,ladder.request,angles,ladder.coordinates),true);
  const wrongAngles=angles.slice();wrongAngles[7]=-.5280675292015076;
  assert.throws(()=>q.validateSolveInputs(ladder.request,ladder.request,wrongAngles,ladder.coordinates),
    /inward polynomial angle domain exceeded at target 7/);
  assert.throws(()=>q.validateSolveInputs(ladder.request,{...ladder.request},angles,ladder.coordinates),
    /request identity mismatch/);
  const wrongCoords=ladder.coordinates.map(x=>({...x}));wrongCoords[7].distanceMetres+=1;
  assert.throws(()=>q.validateSolveInputs(ladder.request,ladder.request,angles,wrongCoords),
    /coordinate mismatch 7/);
});

// The default mode must skip the expensive integer shader entirely, not
// merely skip its dispatch after spending time compiling it.
test('140.12.31.3: quick audit compiles classic only; full comparison remains opt-in',async()=>{
  assert.deepEqual(q.selectedArithmetic(),['classic_ds']);
  assert.deepEqual(q.selectedArithmetic({includeIntegerResidual:true}),['classic_ds','integer_residual_ds']);
  const req=request();
  const kinds=[],writes=[],buffers=[];let eagerInfoReads=0;
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){kinds.push(code);return {getCompilationInfo:async()=>{eagerInfoReads++;return {messages:[]};}};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBindGroup(){return {};},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){},mapAsync:async()=>{},
      getMappedRange(){return this.bytes.slice(0);},unmap(){}};buffers.push(b);return b;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(a,ao,b,bo,len){new Uint8Array(b.bytes).set(new Uint8Array(a.bytes,ao,len));},finish(){return {};}};},
    queue:{writeBuffer(){writes.push(true);},submit(){}},destroy(){}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const session=await q.createSession(req,deps);
  try{
    assert.equal(kinds.length,1);
    assert.deepEqual(session.modes,['classic_ds_128','classic_ds_256','classic_ds_512']);
    assert.equal(session.compilationTimings.length,3);
    assert.equal(session.inspectCompilation,false);
    assert.equal(eagerInfoReads,0); // pipeline validation is sufficient on successful fast path
    assert.equal(session.compilationTimings[1].stage,'getCompilationInfoSkipped');
    assert.doesNotMatch(kinds[0],/fn intTwoSum|fn intTwoProd|fn u64add/);
    const result=await session.solve(req,[-.2,-.05],coordinates);
    assert.deepEqual(Object.keys(result),session.modes);
  }finally{session.close();}
});
test('140.12.31.3: classic-only report is explicit and rejects incomplete integer mode',()=>{
  const coords=Array.from({length:48},(_,i)=>({distanceMetres:60+40*i,heightMetres:0}));
  const req=request(coords),angle=-.25;
  const cases=coords.map((c,i)=>({gpuAngleRadians:angle,
    cpuF64Bouguer:{status:'before_target',targetPolarAngleRadians:c.distanceMetres/req.radius,
      groundPolarAngleRadians:0,contactMarginSurfaceMetres:.1},cpuF64Quadrature256:{contactMarginSurfaceMetres:.1}}));
  const ref={version:'140.12.27',assumptions:'radial',perTargetResults:cases};
  const traces=coords.map((c,i)=>({targetIndex:i,angleRadians:angle,phase:'ground_reachable',contactBeforeTarget:true,
    targetPolarAngleRadians:c.distanceMetres/req.radius,groundPolarAngleRadians:0,contactMarginSurfaceMetres:.1}));
  const variants=Object.fromEntries(['classic_ds_128','classic_ds_256','classic_ds_512'].map(m=>[m,{traces}]));
  const report=q.analyze(ref,{request:req,coordinates:coords},{traces},variants);
  assert.deepEqual(report.modes,['f32_quadrature_256','classic_ds_128','classic_ds_256','classic_ds_512']);
  assert.equal(report.perCase.length,48*4);
  assert.equal(report.integerResidualEvaluated,false);
  assert.deepEqual(report.arithmetic,['f32_integrand_DS_target','classic_ds']);
  variants.integer_residual_ds_128={traces};
  assert.throws(()=>q.analyze(ref,{request:req,coordinates:coords},{traces},variants),/Incomplete Bouguer quadrature mode selection/);
});

test('140.12.31.3: failed asynchronous pipeline compilation collects WGSL diagnostics and releases device',async()=>{
  const req=request(),events=[];let infoCalls=0,destroyed=false;
  const device={
    createShaderModule(){return {getCompilationInfo:async()=>{infoCalls++;return {messages:[{type:'error',message:'synthetic WGSL failure'}]};}};},
    createComputePipelineAsync:async()=>{throw Error('pipeline rejected');},
    destroy(){destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:{STORAGE:1},GPUMapMode:{READ:1}};
  await assert.rejects(q.createSession(req,deps,{onCompileProgress:e=>events.push(e)}),/synthetic WGSL failure/);
  assert.equal(infoCalls,1);
  assert.equal(destroyed,true);
  assert.deepEqual(events.map(e=>e.stage),['start','createShaderModule','getCompilationInfoSkipped',
    'createComputePipelineAsync','getCompilationInfoOnFailure']);
  assert.equal(events[3].failed,true);
});
