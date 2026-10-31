'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const p=require('../src/diagnostics/CurvatureGpuBouguerPrecision141230');
const bouguer=require('../src/diagnostics/CurvatureBouguerInvariant141227');
const precision=require('../src/diagnostics/CurvatureGpuPrecisionFoundation141228');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const coordinates=[{distanceMetres:60,heightMetres:0},{distanceMetres:350,heightMetres:1e-6}];
function request(coords=coordinates){
  const surface=surfaces.createFromCurvature(1/6371000);
  return {branch:contract.BRANCH,geometry:'globe',radius:6371000,
    observerHeight:15,atmosphere:'standard',controls:{step:500,targetTolerance:0.005,eventSubsteps:8},
    targets:coords.map(c=>surface.surfacePoint2(c.distanceMetres,c.heightMetres))};
}
test('140.12.30: target input packs independent distance and radius limbs, never pre-rounded d/R',()=>{
  let c=[{distanceMetres:5400.000001,heightMetres:.1}];
  const data=p.input(c,6371000);
  assert.deepEqual(Array.from(data.slice(0,2)),precision.split64(5400.000001));
  assert.deepEqual(Array.from(data.slice(2,4)),precision.split64(6371000));
  assert.notEqual(data[1],0);
  assert.throws(()=>p.input([],6371000),/Invalid Bouguer target/);
  assert.throws(()=>p.decode(request(),[-.2,-.1],new Float32Array(8),new Float32Array(1)),/low-part readback mismatch/);
  assert.throws(()=>p.input(c,0),/Invalid Bouguer target/);
  assert.throws(()=>p.input([{distanceMetres:0,heightMetres:0}],6371000),/Invalid Bouguer target/);
  assert.throws(()=>p.input([{distanceMetres:60,heightMetres:-1}],6371000),/Invalid Bouguer target/);
});
test('140.12.30: original 256-node log-invariant integrand is retained byte-for-byte in all three modes',()=>{
  assert.deepEqual(p.MODES,['direct_f32','classic_ds','integer_residual_ds']);
  for(let i=0;i<p.MODES.length;i++){
    const s=p.wgsl(p.MODES[i]);
    assert.match(s,new RegExp('const MODE:u32='+i+'u;'));
    assert.match(s,/var thetaLo=0\.0/);
    assert.match(s,/if\(MODE!=0u\)/);
    assert.match(s,/let polar=dsDiv\(ds\(d\.x,d\.y\),ds\(d\.z,d\.w\)\)/);
    assert.match(s,/let theta=|var theta=d\.x\*k/);
    assert.match(s,/\(\(theta-phi\)\+thetaLo\)\/k/);
    assert.match(s,/logF\(h,k,N,H\)-logB/);
    assert.match(s,/compensation=\(tmp-sum\)-y/);
    assert.match(s,/let h=t\.z\*u\*u/);
    assert.match(s,/angleLows\[i\]=thetaLo/);
    assert.match(s,/@group\(0\) @binding\(4\) var<storage, read_write> angleLows/);
    assert.match(s,/@group\(0\) @binding\(3\) var<storage, read> precise: Rays/);
    assert.doesNotMatch(s,/let theta=atan2\(k\*t\.x/);
    assert.doesNotMatch(s,/rootSolve|raySolve|trace\(/);
    // A mechanical comparison ensures that the old Bouguer WGSL is
    // unchanged except for three explicitly audited substitutions.
    const old=bouguer.WGSL;
    assert.equal(old.includes('let theta=atan2(k*t.x,1.0+k*t.y);'),true);
    assert.equal(old.includes('(theta-phi)/k'),true);
  }
  assert.throws(()=>p.wgsl('f64'),/Unknown Bouguer precision mode/);
});
test('140.12.30: comparison preserves the same GPU angles and separates target and quadrature errors',()=>{
  const coords=Array.from({length:48},(_,i)=>({distanceMetres:60+i*40,heightMetres:0}));
  const req=request(coords),angle=-.25,phi=.000001,theta=60/6371000;
  const original={version:'140.12.27',assumptions:'radial monotone',gpuBouguerTiming:{gpuUploadToReadbackMs:1},
    perTargetResults:coords.map((c,i)=>({gpuAngleRadians:angle,
      gpuShootingStatus:'visible',cpuShootingStatus:'visible',
      gpuBouguer:{targetIndex:i,angleRadians:angle,phase:'ground_reachable',
        contactBeforeTarget:false,groundPolarAngleRadians:phi,targetPolarAngleRadians:theta-1e-7,
        contactMarginSurfaceMetres:-.4},
      cpuF64Bouguer:{angleRadians:angle,status:'before_target',
        targetPolarAngleRadians:c.distanceMetres/6371000,
        groundPolarAngleRadians:phi,contactMarginSurfaceMetres:.1},
      cpuF64Quadrature256:null}))};
  const runs={};
  for(const mode of p.MODES){runs[mode]={timing:{gpuDispatchToReadbackMs:2},traces:coords.map((c,i)=>({
    targetIndex:i,angleRadians:angle,phase:'ground_reachable',contactBeforeTarget:true,
    groundPolarAngleRadians:phi,targetPolarAngleRadians:c.distanceMetres/6371000,
    contactMarginSurfaceMetres:.1}))};}
  const result=p.analyze(original,{request:req,coordinates:coords},runs);
  assert.equal(result.version,'140.12.30');
  assert.equal(result.perCase.length,192);
  assert.equal(result.nearSurfaceCases.length,120); // 30 of 48 coordinates at distances <= 1250, each across four modes
  assert.equal(result.summary.legacy_f32.contactDisagreements,48);
  assert.equal(result.summary.direct_f32.contactDisagreements,0);
  assert.equal(result.summary.classic_ds.changedClassificationFromLegacy,48);
  assert.equal(result.summary.classic_ds.maxAbsoluteGroundAngleDeltaFromLegacyMetres,0);
  assert.equal(result.productionAuthorized,false);
  assert.equal(result.framePaintingChanged,false);
  assert.equal(result.shootingChanged,false);
  assert.match(result.precisionScope,/No DS quadrature/);
  runs.classic_ds.traces[0].angleRadians=0;
  assert.throws(()=>p.analyze(original,{request:req,coordinates:coords},runs),/angle\/target mismatch/);
});
test('140.12.30: Compare action stages every GPU pass before any CPU f64 oracle',()=>{
  assert.match(html,/CurvatureGpuBouguerPrecision141230\.js/);
  assert.match(html,/ModernGpuBouguerPrecisionRun/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.30/);
  assert.match(app,/addEventListener\('click',runGpuBouguerPrecision141230\)/);
  assert.match(app,/curvature-compare-140\.12\.30-bouguer-precision\.json/);
  const body=app.slice(app.indexOf('async function runGpuBouguerPrecision141230(){'),
    app.indexOf('// #140.12.28: self-contained WebGPU arithmetic bench.'));
  assert.ok(body.indexOf('await shooting.solve')<body.indexOf('await originalSession.solve'));
  assert.ok(body.indexOf('await originalSession.solve')<body.indexOf('await precisionSession.solve'));
  assert.ok(body.indexOf('await precisionSession.solve')<body.indexOf('await groundSession.solve'));
  assert.ok(body.indexOf('await groundSession.solve')<body.indexOf('await contract.solveCpuBatch'));
  assert.doesNotMatch(body,/renderComposition|renderPhysical|cpuFallback|status='visible'/);
});
test('140.12.30: mocked WebGPU produces three independent readbacks and closes resources',async()=>{
  const req=request(),angles=[-.25,-.05];
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const buffers=[],writes=[],passes=[],modules=[],copies=[];
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
      new Uint8Array(b.bytes,o,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const session=await p.createSession(48,deps);
  try{
    const results=await session.solve(req,angles,coordinates);
    assert.equal(modules.length,3);
    assert.equal(writes.length,3);
    assert.deepEqual(copies,[32,8,32,8,32,8]);
    assert.equal(passes.length,3);
    for(const mode of p.MODES){assert.equal(results[mode].traces.length,2);}
    await assert.rejects(()=>session.solve(req,angles,[coordinates[1],coordinates[0]]),/coordinate\/target mismatch/);
    await assert.rejects(()=>session.solve(req,[Infinity,0],coordinates),/must align/);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
});
