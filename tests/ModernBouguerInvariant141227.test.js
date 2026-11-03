'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const m=require('../src/diagnostics/CurvatureBouguerInvariant141227');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
function request(targets=[[60,0],[350,0]],atmosphere='standard'){
  return {branch:contract.BRANCH,geometry:'globe',radius:6371000,
    observerHeight:15,atmosphere,
    controls:{step:500,targetTolerance:0.005,eventSubsteps:8},targets};
}
function exactVacuumGround(radius,h0,angle){
  const r=radius+h0,delta=r*r*Math.sin(angle)**2-(2*radius*h0+h0*h0);
  if(delta<0)return null;
  const t=-r*Math.sin(angle)-Math.sqrt(delta);
  if(!(t>=0))return null;
  return Math.atan2(t*Math.cos(angle),r+t*Math.sin(angle));
}
test('140.12.27: vacuum radial integral agrees with analytic ray/sphere intersection',()=>{
  const r=request([[60,0]],'vacuum');
  for(const angle of [-.3,-.25,-.2,-.1]){
    const exact=exactVacuumGround(r.radius,r.observerHeight,angle);
    const result=m.f64(r,angle,r.targets[0]);
    if(exact===null)assert.equal(result.status,'no_ground');
    else{
      assert.ok(Number.isFinite(result.groundPolarAngleRadians));
      assert.ok(Math.abs((result.groundPolarAngleRadians-exact)*r.radius)<0.00001,
        `vacuum first-ground mismatch angle ${angle}`);
    }
  }
  assert.equal(m.f64(r,.04,r.targets[0]).reason,'initially_outward');
});
test('140.12.27: f64 invariant reproduces measured near-ground contact geometry',()=>{
  // Deterministic angles and f64 first-contact x from the #140.12.26
  // measured same-angle replay; keep this test self-contained in the patch.
  const req=request();
  const points=[
    {distanceMetres:60,heightMetres:0,gpuShootingAngleRadians:-.24498309195041656,impactX:59.99969631044474},
    {distanceMetres:60,heightMetres:.000001,gpuShootingAngleRadians:-.24498307704925537,impactX:59.99970011024376},
    {distanceMetres:350,heightMetres:0,gpuShootingAngleRadians:-.04285835102200508,impactX:349.94299489272504},
    {distanceMetres:350,heightMetres:.000001,gpuShootingAngleRadians:-.04285834729671478,impactX:349.9430253765818},
    {distanceMetres:1250,heightMetres:0,gpuShootingAngleRadians:-.012072708457708359,impactX:1249.9924772421841},
    {distanceMetres:1250,heightMetres:.000001,gpuShootingAngleRadians:-.01207270659506321,impactX:1249.9926724851719}];
  for(const p of points){
    const a=m.f64(req,p.gpuShootingAngleRadians,[p.distanceMetres,p.heightMetres]);
    assert.equal(a.status,'before_target');
    const approximateImpact=p.impactX;
    const impactTheta=Math.atan2(approximateImpact,req.radius);
    assert.ok(Math.abs((a.groundPolarAngleRadians-impactTheta)*req.radius)<.003,
      `invariant vs RK4 impact differs at ${p.distanceMetres}m`);
  }
  const a=m.f64(req,points[4].gpuShootingAngleRadians,[1250,0],256);
  const b=m.f64(req,points[4].gpuShootingAngleRadians,[1250,0],2048);
  assert.ok(Math.abs(a.contactMarginSurfaceMetres-b.contactMarginSurfaceMetres)<.0001);
});
test('140.12.27: strict radial assumptions; flat, ducted profile, zero height rejected',()=>{
  const r=request();
  assert.equal(m.options(r).N,.000293);
  assert.throws(()=>m.options(Object.assign({},r,{geometry:'flat'})),/Globe/);
  assert.throws(()=>m.options(Object.assign({},r,{observerHeight:0})),/positive observer height/);
  assert.throws(()=>m.options(Object.assign({},r,{profileOptions:{refractivity:.03,scaleHeight:500}})),/monotone/);
  assert.throws(()=>m.options(Object.assign({},r,{atmosphere:'inverse-spherical'})),/Globe/);
  assert.throws(()=>m.f64(r,NaN,r.targets[0]),/Invalid Bouguer angle/);
  assert.throws(()=>m.f64(r,-.2,r.targets[0],12),/quadrature node/);
});
test('140.12.27: GPU invariant uses normalized radius and compensated quadrature, not RK4',()=>{
  assert.match(m.WGSL,/log1pStable/);
  assert.match(m.WGSL,/oneMinusExpNeg/);
  assert.match(m.WGSL,/expm1Stable/);
  assert.match(m.WGSL,/atan2\(k\*t\.x,1\.0\+k\*t\.y\)/);
  assert.match(m.WGSL,/logF\(t\.z,k,N,H\)/);
  assert.match(m.WGSL,/compensation=\(tmp-sum\)-y/);
  assert.match(m.WGSL,/let h=t\.z\*u\*u/);
  assert.doesNotMatch(m.WGSL,/advanceCompensated|fn derivative|groundEvent|trace\(/);
  assert.equal(m.GPU_NODES,256);
  assert.equal(m.CPU_NODES,2048);
});
test('140.12.27: GPU decode preserves raw signed surface-polar margins, including unresolved',()=>{
  const r=request();
  const g=m.decode(r,[-.25,-.04],new Float32Array([1,.000001,.000002,.006371,2,-1,.00005,0]));
  assert.equal(g[0].phase,'ground_reachable');
  assert.equal(g[0].contactBeforeTarget,true);
  assert.equal(g[1].phase,'no_ground');
  assert.equal(g[1].contactBeforeTarget,false);
  assert.equal(g[1].contactMarginSurfaceMetres,null);
  const u=m.decode(r,[0,1],new Float32Array([0,-1,0,0,1,.01,.02,-.1]));
  assert.equal(u[0].contactBeforeTarget,null);
  assert.equal(u[1].contactBeforeTarget,false);
  assert.throws(()=>m.decode(r,[0,1],new Float32Array(3)),/mismatch/);
  assert.throws(()=>m.decode(r,[0,1],new Float32Array([3,0,0,0,1,0,0,0])),/Invalid Bouguer/);
});
test('140.12.27: complete 48-target analysis never promotes visibility',()=>{
  const surface=surfaces.createFromCurvature(1/6371000),
    distances=[60,350,1250,2100,3900,5400],heights=[0,.000001,.01,.1,1,5,20,50],
    coords=distances.flatMap(d=>heights.map(h=>({distanceMetres:d,heightMetres:h}))),
    targets=coords.map(x=>surface.surfacePoint2(x.distanceMetres,x.heightMetres)),
    req=request(targets),angles=targets.map(t=>Math.atan2(t[1]-15,t[0]));
  const source={response:{results:targets.map((target,i)=>({target:target.slice(),angle:angles[i],
    status:coords[i].distanceMetres<=1250&&coords[i].heightMetres<.000002?'indeterminate':'visible'}))}};
  const cpu={results:targets.map((target,i)=>({target:target.slice(),angle:angles[i],status:'visible'}))};
  const analyticGpu={traces:angles.map((angle,i)=>({targetIndex:i,angleRadians:angle,
    phase:'no_ground',contactBeforeTarget:false,contactMarginSurfaceMetres:null}))};
  const groundGpu={traces:angles.map((angle,i)=>({targetIndex:i,angleRadians:angle,
    pathLengthMetres:Math.hypot(targets[i][0],targets[i][1]-15),
    firstCrossingPathMetres:null,endpointAltitudeMetres:0}))};
  const out=m.analyze({request:req,coordinates:coords},source,analyticGpu,groundGpu,cpu);
  assert.equal(out.version,'140.12.27');
  assert.equal(out.perTargetResults.length,48);
  assert.equal(out.nearSurfaceCases.length,6);
  assert.equal(out.summary.nearSurfaceStatusMismatches,6);
  assert.equal(out.productionAuthorized,false);
  assert.equal(out.framePaintingChanged,false);
  assert.equal(out.cpuShootingFallback,false);
  analyticGpu.traces[0].angleRadians=.3;
  assert.throws(()=>m.analyze({request:req,coordinates:coords},source,analyticGpu,groundGpu,cpu),/GPU angle\/target mismatch/);
});
test('140.12.27: mocked WebGPU pass stages f32 angles and cleans up GPU resources',async()=>{
  const r=request(),angles=[-.3,-.1],usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const writes=[],copies=[],buffers=[];
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){assert.equal(code,m.WGSL);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>({getBindGroupLayout:()=>({})}),
    createBindGroup({entries}){return entries;},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(o,l){return this.bytes.slice(o,o+l);},unmap(){}};
      buffers.push(b);return b;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(src,o,dst,q,len){copies.push(len);new Uint8Array(dst.bytes,q,len).set(new Uint8Array(src.bytes,o,len));},
      finish(){return {};}};},
    queue:{writeBuffer(b,o,arr){if(arr instanceof Float32Array)writes.push(Array.from(arr));
      new Uint8Array(b.bytes,o,arr.byteLength).set(new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  const session=await m.createSession(48,deps);
  try{
    const out=await session.solve(r,angles);
    assert.equal(out.traces.length,2);
    assert.deepEqual(copies,[32]);
    assert.equal(writes[0][3],Math.fround(angles[0]));
    await assert.rejects(()=>session.solve(r,[Infinity,1]),/must align/);
  }finally{session.close();}
  assert.ok(buffers.every(b=>b.destroyed));
  assert.equal(device.destroyed,true);
  await assert.rejects(()=>m.createSession(1,{navigator:{}}),/unavailable/);
});
