'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const s=require('../src/diagnostics/CurvatureGpuHighPrecisionShooting141232');
const ladderFactory=require('../src/diagnostics/CurvatureGpuPrecisionAudit141222');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const q=require('../src/diagnostics/CurvatureGpuBouguerQuadrature141231');
// Real GPU predictor angles captured in #140.12.31.3; test is standalone.
const recordedGpuAngles=[
  -0.24498309195041656,
  -0.24498307704925537,
  -0.24482622742652893,
  -0.24341385066509247,
  -0.22923636436462402,
  -0.1651531308889389,
  0.08313629776239395,
  0.5280675292015076,
  -0.04285835102200508,
  -0.04285834729671478,
  -0.04282983019948006,
  -0.04257315769791603,
  -0.04000610485672951,
  -0.028591081500053406,
  0.014257235452532768,
  0.09964068233966827,
  -0.012072708457708359,
  -0.01207270659506321,
  -0.012064696289598942,
  -0.011992725543677807,
  -0.01127287745475769,
  -0.00807334203273058,
  0.003926753997802734,
  0.02791883982717991,
  -0.007265942171216011,
  -0.007265941239893436,
  -0.007261187303811312,
  -0.007218388840556145,
  -0.006789811886847019,
  -0.00488504022359848,
  0.0022579003125429153,
  0.016541752964258194,
  -0.004074635915458202,
  -0.004074635449796915,
  -0.004072130192071199,
  -0.0040489849634468555,
  -0.0038182386197149754,
  -0.0027926494367420673,
  0.0010535061592236161,
  0.008745724335312843,
  -0.003094172105193138,
  -0.0030941718723624945,
  -0.0030922566074877977,
  -0.0030756129417568445,
  -0.0029089387971907854,
  -0.002168245380744338,
  0.0006095040589570999,
  0.0061649433337152
];
function ladder(){return ladderFactory.createLadder({branch:contract.BRANCH,geometry:'globe',radius:6371000,observerHeight:15},surfaces);}
function angles(){return recordedGpuAngles.slice();}
test('140.12.32: validates exact 48 real GPU predictor angles and radial-leg domain BEFORE WebGPU compilation',()=>{
  const l=ladder(),a=angles();
  assert.equal(a.length,48);assert.equal(s.validate(l.request,l.coordinates,a),true);
  const wrong=a.slice();wrong[7]=-.5280675292015076;
  assert.throws(()=>s.validate(l.request,l.coordinates,wrong),/radial-leg domain exceeded at target 7/);
  const wrong2=a.slice();wrong2[0]=.24;
  assert.throws(()=>s.validate(l.request,l.coordinates,wrong2),/radial-leg domain exceeded at target 0/);
  const wrong3=l.coordinates.map(v=>({...v}));wrong3[0].heightMetres=15;
  assert.throws(()=>s.validate(l.request,wrong3,a),/radial-leg domain exceeded at target 0/);
  wrong3[0].heightMetres=0;wrong3[0].distanceMetres++;
  assert.throws(()=>s.validate(l.request,wrong3,a),/coordinates\/targets mismatch 0/);
  wrong3[0].distanceMetres=60;wrong3[0].heightMetres=0.01;
  assert.throws(()=>s.validate(l.request,wrong3,a),/coordinates\/targets mismatch 0/);
  assert.throws(()=>s.validate(l.request,l.coordinates,a.slice(1)),/48 matched targets/);
});
test('140.12.32: GPU-owned secant shooting reuses classic DS arithmetic and evaluates 256/512-node polar/ground integrals',()=>{
  const wgsl=s.shader(ladder().request);
  assert.match(wgsl,/fn evaluate\(angle:DS/);
  // WGSL does not support JavaScript-style comma-separated let declarations.
  assert.match(wgsl,/let radius=ds\(c\.x,c\.y\);/);
  assert.match(wgsl,/let observer=ds\(c\.z,c\.w\);/);
  assert.match(wgsl,/let targetHeight=ds\(heightParts\.x,heightParts\.y\);/);
  assert.match(wgsl,/let n=ds\(d\.x,d\.y\);/);
  assert.match(wgsl,/let scale=ds\(d\.z,d\.w\);/);
  assert.doesNotMatch(wgsl,/\blet\s+[^;\n]+,[a-zA-Z_]\w*\s*=/,"WGSL let declarations must not be chained");
  assert.doesNotMatch(wgsl,/\btarget\b/,"WGSL reserved keyword must not be used as identifier");
  assert.match(wgsl,/fn dsSinHalf\(angle:DS\)/);
  assert.match(wgsl,/fn twoSum\(/);
  assert.match(wgsl,/fn twoProd\(/);
  assert.match(wgsl,/for\(var iteration=0u;iteration<9u/);
  assert.match(wgsl,/let proposal=dsSub\(angle,dsDiv\(/);
  assert.match(wgsl,/let ground=evaluate\(angle,observer,ds\(0\.0,0\.0\)/);
  assert.match(wgsl,/results\.data\[i\*4u\+3u\]/);
  assert.match(wgsl,/if\(inward\)\{lower=targetHeight;upper=observer;\}/);
  assert.doesNotMatch(wgsl,/fn intTwoSum|fn intTwoProd|@MODE@|CPU_REFERENCE|cpuRoot/);
  assert.ok(wgsl.length<10000,'short specialized shader, not benchmark helper dump');
  assert.deepEqual(s.NODE_COUNTS,[256,512]);
});
test('140.12.32: independent 2048-node CPU f64 root converges for all actual 48 GPU seeds',()=>{
  const l=ladder();let maxAbs=0;
  for(let i=0;i<48;i++){
    const coord={...l.coordinates[i],targetIndex:i};
    const cpu=s.cpuRoot(l.request,coord,angles()[i]);
    assert.ok(cpu&&cpu.converged,'CPU numerical reference converges at '+i);
    maxAbs=Math.max(maxAbs,Math.abs(cpu.residualMetres));
    const residual=s.targetResidualF64(l.request,cpu.angleRadians,coord,2048);
    assert.ok(residual&&Math.abs(residual.residualMetres)<1e-5,'independent target integral '+i);
  }
  assert.ok(maxAbs<1e-5);
});
test('140.12.32: low limbs and uncertain ground contacts survive readback, non-finite/invalid flags fail hard',()=>{
  const l=ladder(),a=angles(),raw=new Float32Array(48*16);
  for(let i=0;i<48;i++){
    raw[i*16]=1;raw[i*16+1]=a[i];raw[i*16+2]=1e-11;
    raw[i*16+12]=1;raw[i*16+13]=0.0005;raw[i*16+14]=-1e-8;
  }
  let decoded=s.decode(l.coordinates,a,raw);
  assert.equal(decoded.length,48);
  assert.equal(decoded[0].status,'converged');
  assert.equal(decoded[0].angleLimbs[1],raw[2]);
  assert.equal(decoded[0].contactClassification,'within_1cm_uncertain');
  raw[0]=2;assert.throws(()=>s.decode(l.coordinates,a,raw),/Invalid DS shooting readback/);
  raw[0]=1;raw[1]=Infinity;assert.throws(()=>s.decode(l.coordinates,a,raw),/Invalid DS shooting readback/);
  raw[1]=a[0];raw[3]=0.1;assert.throws(()=>s.decode(l.coordinates,a,raw),/Invalid DS shooting readback/);
  assert.throws(()=>s.decode(l.coordinates,a,new Float32Array(1)),/readback size mismatch/);
});
function mockGpu(failPipeline=false){
  const buffers=[],shaders=[],counts=[],copies=[];
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const device={limits:{maxStorageBufferBindingSize:10000000},
    createShaderModule({code}){shaders.push(code);return {getCompilationInfo:async()=>({messages:[]})};},
    createComputePipelineAsync:async()=>{if(failPipeline)throw Error('synthetic pipeline error');return {getBindGroupLayout:()=>({})};},
    createBindGroup({entries}){assert.equal(entries.length,6);return entries;},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(o,l){return this.bytes.slice(o,o+l);},unmap(){}};
      buffers.push(b);return b;},
    createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}};},
      copyBufferToBuffer(a,ao,b,bo,len){copies.push(len);new Uint8Array(b.bytes).set(new Uint8Array(a.bytes,ao,len));},finish(){return {};}};},
    queue:{writeBuffer(b,off,data){if(data instanceof Uint32Array)counts.push(data[1]);
      new Uint8Array(b.bytes,off,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},submit(){}},
    destroy(){this.destroyed=true;}};
  const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  return {deps,device,buffers,shaders,counts,copies};
}
test('140.12.32: WebGPU session compiles ONE shader, two independent GPU dispatch/readbacks, tears down resources',async()=>{
  const l=ladder(),g=mockGpu(),session=await s.createSession(l.request,g.deps);
  try{
    const output=await session.solve(l.request,l.coordinates,angles());
    assert.equal(g.shaders.length,1);
    assert.deepEqual(g.counts,[256,512]);
    assert.deepEqual(g.copies,[48*64,48*64]);
    assert.deepEqual(Object.keys(output),['classic_ds_256','classic_ds_512']);
    assert.equal(output.classic_ds_512.traces.length,48);
    await assert.rejects(()=>session.solve({...l.request},l.coordinates,angles()),/request identity mismatch/);
    await assert.rejects(()=>session.solve(l.request,l.coordinates,angles().slice(1)),/48 matched targets/);
  }finally{session.close();session.close();}
  assert.ok(g.buffers.every(x=>x.destroyed));assert.equal(g.device.destroyed,true);
});
test('140.12.32: failure to build WGSL pipeline releases WebGPU device and propagates error',async()=>{
  const l=ladder(),g=mockGpu(true);
  await assert.rejects(()=>s.createSession(l.request,g.deps),/synthetic pipeline error/);
  assert.equal(g.device.destroyed,true);
});
test('140.12.32: isolated modern Compare UI wires versioned shader, GPU-first/CPU-last ordering and auto-export',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureGpuHighPrecisionShooting141232\.js\?v=140\.12\.32/);
  assert.match(html,/id="ModernGpuHighPrecisionShootingRun"/);
  assert.match(js,/runGpuHighPrecisionShooting141232/);
  assert.match(js,/numericAuditFailed\(pixelMode\?'140\.12\.33':'140\.12\.32'/);
  assert.match(js,/pixelMode\?'runGpuPixelSpaceAudit141233':'runGpuHighPrecisionShooting141232'/);
  assert.match(js,/numericAuditComplete\(report\)/);
  assert.match(js,/curvature-compare-140\.12\.32-gpu-ds-shooting\.json/);
  const fn=js.slice(js.indexOf('async function runGpuHighPrecisionShooting141232('),js.indexOf('  function bind(){',js.indexOf('async function runGpuHighPrecisionShooting141232(')));
  for(const token of ['predictor.solve','shootingAudit.validate','shootingAudit.createSession','ds.solve','contract.solveCpuBatch','shootingAudit.analyze'])
    assert.ok(fn.includes(token),token);
  assert.ok(fn.indexOf('ds.solve')<fn.indexOf('contract.solveCpuBatch'));
  assert.doesNotMatch(fn,/renderComposition|renderPhysical|cpuFallback|productionAuthorized:true/);
});
test('140.12.32: report compares GPU-owned outcomes with independent CPU root and keeps near-zero contact uncertain',()=>{
  const l=ladder(),a=angles();
  const predictor={response:{results:a.map((angle,i)=>({angle,target:l.request.targets[i]}))}};
  const cpu={results:a.map((angle,i)=>({angle,target:l.request.targets[i],status:'visible'}))};
  const traces=a.map((angle,i)=>{
    const root=s.cpuRoot(l.request,{...l.coordinates[i],targetIndex:i},angle);
    const b=require('../src/diagnostics/CurvatureBouguerInvariant141227')
      .f64(l.request,root.angleRadians,l.request.targets[i],2048);
    return {targetIndex:i,initialAngleRadians:angle,angleRadians:root.angleRadians,
      status:'converged',residualMetres:root.residualMetres,
      groundPhase:b.contactMarginSurfaceMetres===null?'no_ground':'ground_reachable',
      groundMarginSurfaceMetres:b.contactMarginSurfaceMetres};
  });
  const result=s.analyze(l,predictor,{classic_ds_256:{traces},classic_ds_512:{traces}},cpu);
  assert.equal(result.perCase.length,96);
  assert.equal(result.summary.classic_ds_256.converged,48);
  assert.equal(result.summary.classic_ds_512.converged,48);
  assert.equal(result.summary.classic_ds_256.cpuRootUnresolved,0);
  assert.equal(result.summary.classic_ds_256.groundDisagreementsBeyond1cm,0);
  assert.equal(result.productionAuthorized,false);
  assert.equal(result.cpuReferenceAfterGpu,true);
  assert.match(result.classificationScope,/uncertain/);
});
