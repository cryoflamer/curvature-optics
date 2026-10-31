'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const p=require('../src/diagnostics/CurvatureGpuPrecisionGeometry141229');
const arithmetic=require('../src/diagnostics/CurvatureGpuPrecisionFoundation141228');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');

test('140.12.29: independent high/low radius and local height retain source precision',()=>{
  const rows=p.cases();
  assert.equal(rows.length,48);
  assert.deepEqual(rows[0],{distance:60,height:0});
  assert.deepEqual(rows[rows.length-1],{distance:5400,height:50});
  const tenth={distance:5400,height:.1};
  const packed=p.packedInput([tenth]);
  assert.equal(packed.length,16);
  assert.deepEqual(Array.from(packed.slice(0,2)),arithmetic.split64(5400));
  assert.deepEqual(Array.from(packed.slice(2,4)),arithmetic.split64(.1));
  assert.deepEqual(Array.from(packed.slice(8,10)),arithmetic.split64(6371000.1));
  assert.deepEqual(Array.from(packed.slice(12,14)),arithmetic.split64(6371000));
  assert.notEqual(packed[3],0); // 0.1 has its OWN low limb.
  const absoluteReconstructed=packed[8]+packed[9];
  const localReconstructed=packed[2]+packed[3];
  assert.ok(Math.abs(localReconstructed-.1)<1e-15);
  assert.ok(Math.abs(absoluteReconstructed-6371000.1)<1e-8);
  assert.throws(()=>p.packedInput([]),/1\.\.1024/);
  assert.throws(()=>p.packedInput([{distance:-1,height:0}]),/Invalid geometry row/);
  assert.throws(()=>p.packedInput([{distance:5,height:-1}]),/Invalid geometry row/);
  assert.throws(()=>p.packedInput([{distance:5400,height:0}],10000),/bounded series domain/);
});

test('140.12.29: WGSL audits normalized atan2, separate local/absolute coordinates for Globe and Flat',()=>{
  assert.deepEqual(p.MODES,arithmetic.MODES);
  for(let i=0;i<p.MODES.length;i++){
    const shader=p.wgsl(p.MODES[i]);
    assert.match(shader,new RegExp('const MODE:u32='+i+'u;'));
    assert.match(shader,/let k=bitcast<f32>\(config\[2\]\)/);
    assert.match(shader,/let oldAngle=atan2\(k\*xy\.x,1\.0\+k\*xy\.z\)/);
    assert.match(shader,/let directArc=dsDiv\(distance,radius\)/);
    assert.match(shader,/var cartesianAngle=polarSeries\(targetX,radiusWithTargetY\)/);
    assert.match(shader,/let radiusWithHeight=dsAdd\(radius,height\)/);
    assert.match(shader,/dsSub\(radiusWithHeight,radius\)/);
    assert.match(shader,/dsSub\(absoluteR,radius\)/);
    assert.match(shader,/dsSub\(dsAdd\(origin,distance\),origin\)/);
    assert.match(shader,/dsSub\(absoluteX,origin\)/);
    assert.match(shader,/fn polarSeries/);
    assert.match(shader,/q3,ds\(3\.0,0\.0\)/);
    assert.match(shader,/q5,ds\(5\.0,0\.0\)/);
    assert.match(shader,/@compute @workgroup_size\(64\)/);
    assert.doesNotMatch(shader,/@MODE@|@HELPERS@|raySolve|groundContact|draw/);
  }
  assert.throws(()=>p.wgsl('f64'),/Unknown geometry arithmetic mode/);
});

test('140.12.29: decoder separates baseline polar angle, direct angle and input-construction variants',()=>{
  const raw=new Float32Array([.1,.2,.00000001,.3,.22,.00000002,.4,0,.1,.00000001,.1,0,60,0,60,0]);
  const decoded=p.decode([{distance:60,height:.1}],raw);
  assert.equal(decoded[0].normalizedAtan2F32,Math.fround(.1));
  assert.equal(decoded[0].directPolarAngleLimbs[1],Math.fround(1e-8));
  assert.equal(decoded[0].cartesianPolarAngleLimbs[1],Math.fround(2e-8));
  assert.equal(decoded[0].localHeightLimbs[1],Math.fround(1e-8));
  assert.equal(decoded[0].flatLocalDistance,60);
  assert.throws(()=>p.decode([{}],new Float32Array(4)),/readback length/);
  const bad=new Float32Array(16);bad[0]=NaN;
  assert.throws(()=>p.decode([{}],bad),/Invalid geometry GPU/);
});

test('140.12.29: analysis isolates input split floor from geometry calculation and retains no-production contract',()=>{
  const rows=[{distance:5400,height:.1},{distance:60,height:1e-6},{distance:350,height:0}];
  const results=rows.map(({distance,height})=>({
    normalizedAtan2F32:Math.fround(distance/6371000),
    directPolarAngle:distance/6371000,
    directArcF32:Math.fround(distance/6371000),
    cartesianPolarAngle:distance/6371000,
    directAtan2F32:Math.fround(distance/6371000),
    localHeight:height,packedAbsoluteHeight:6371000+height-6371000,
    flatLocalDistance:distance,flatPackedDistance:15000000.125+distance-15000000.125}));
  const runs={};
  for(const mode of p.MODES)runs[mode]={results,benchmarkMs:[5,2,3],benchmarkIterations:32};
  const output=p.analyze(rows,runs);
  assert.equal(output.version,'140.12.29');
  assert.equal(output.targets,3);
  assert.ok(output.maxOmittedPolarSeriesBoundSurfaceMetres<1e-9);
  assert.equal(output.summary.classic_ds.benchmarkWarmMedianMs,3);
  assert.ok(Math.abs(output.sourceInputDiagnostics[0].heightInputSplitErrorMetres)<1e-15);
  assert.ok(Math.abs(output.sourceInputDiagnostics[0].prepackedHeightVsLocalMetres)>1e-11);
  assert.equal(output.summary.classic_ds.maxAbsolutePolarErrorSurfaceMetres,0);
  assert.ok(output.summary.classic_ds.maxAbsoluteNormalizedAtan2ErrorSurfaceMetres>=0);
  assert.ok(output.summary.classic_ds.maxAbsoluteCartesianPolarErrorSurfaceMetres>=0);
  assert.equal(output.summary.classic_ds.localHeightOutside1um,0);
  assert.equal(output.framePaintingChanged,false);
  assert.equal(output.shootingChanged,false);
  assert.equal(output.contactClassificationsChanged,false);
  assert.equal(output.productionAuthorized,false);
  assert.match(output.inputCaveat,/Two f32 limbs/);
  assert.throws(()=>p.analyze(rows,{}),/Missing geometry mode/);
});

test('140.12.29: Compare action is isolated and exposes its own JSON export',()=>{
  assert.match(html,/CurvatureGpuPrecisionGeometry141229\.js/);
  assert.match(html,/ModernGpuPrecisionGeometryRun/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.30/);
  assert.match(app,/addEventListener\('click',runGpuPrecisionGeometry141229\)/);
  assert.match(app,/curvature-compare-140\.12\.29-gpu-precision-geometry\.json/);
  const body=app.slice(app.indexOf('async function runGpuPrecisionGeometry141229(){'),
    app.indexOf('function bindCompareGpuProbe(){'));
  assert.match(body,/precision\.cases\(\)/);
  assert.match(body,/await session\.run\(rows/);
  assert.match(body,/state\.probeFrameLast=report/);
  assert.doesNotMatch(body,/solveCpuBatch|renderComposition|renderPhysical|gpuRayField|cpuFallback|Redraw\(/);
});

function mockedGpu(){
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8},buffers=[],codes=[];
  let activePipeline,activeBind,dispatches=0,destroyed=false;
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){codes.push(code);return {code,getCompilationInfo:async()=>({messages:[]})};},
    async createComputePipelineAsync({compute}){return {code:compute.module.code,getBindGroupLayout:()=>({})};},
    createBindGroup({entries}){return entries;},
    createBuffer({size}){const b={bytes:new ArrayBuffer(size),destroy(){this.destroyed=true;},
      mapAsync:async()=>{},getMappedRange(offset,length){return this.bytes.slice(offset,offset+length);},unmap(){}};
      buffers.push(b);return b;},
    createCommandEncoder(){let copy;return {beginComputePass(){return {
      setPipeline(v){activePipeline=v;},setBindGroup(i,v){activeBind=v;},
      dispatchWorkgroups(){dispatches++;},end(){}};},
      copyBufferToBuffer(from,fromOffset,to,toOffset,length){copy={from,fromOffset,to,toOffset,length};},
      finish(){return {copy};}};},
    queue:{writeBuffer(buffer,offset,values){new Uint8Array(buffer.bytes,offset,values.byteLength).set(
      new Uint8Array(values.buffer,values.byteOffset,values.byteLength));},
      submit(commands){
        const copy=commands[0].copy;
        const input=new Float32Array(activeBind[0].resource.buffer.bytes);
        const output=new Float32Array(activeBind[1].resource.buffer.bytes);
        const config=new Uint32Array(activeBind[2].resource.buffer.bytes);
        const mode=Number(activePipeline.code.match(/const MODE:u32=(\d)u/)[1]);
        for(let i=0;i<config[0];i++){
          const j=i*16,d=input[j]+input[j+1],h=input[j+2]+input[j+3],
            x=input[j+4]+input[j+5],y=input[j+6]+input[j+7],
            absR=input[j+8]+input[j+9],absX=input[j+10]+input[j+11],
            R=input[j+12]+input[j+13],O=input[j+14]+input[j+15];
          const arc=d/R,hi=Math.fround(arc),cart=Math.atan2(x,R+y),cartHi=Math.fround(cart);
          output.set([Math.fround(cart),hi,mode===0?0:Math.fround(arc-hi),Math.fround(arc),
            cartHi,mode===0?0:Math.fround(cart-cartHi),Math.fround(cart),0,
            Math.fround(h),0,Math.fround(absR-R),0,
            Math.fround(d),0,Math.fround(absX-O),0],j);
        }
        new Uint8Array(copy.to.bytes,copy.toOffset,copy.length).set(
          new Uint8Array(copy.from.bytes,copy.fromOffset,copy.length));
      }},destroy(){destroyed=true;}};
  return {deps:{navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}},buffers,codes,
    get dispatches(){return dispatches;},get destroyed(){return destroyed;}};
}

test('140.12.29: three pipelines dispatch and export separately, release GPU resources',async()=>{
  const mock=mockedGpu(),rows=p.cases().slice(0,5);
  const session=await p.createSession(rows.length,mock.deps);
  try{
    const result=await session.run(rows,{warmRepeats:2,benchmarkIterations:8});
    assert.equal(result.perCase.length,15);
    assert.equal(mock.codes.length,3);
    assert.equal(mock.dispatches,12);
    assert.equal(result.summary.integer_residual_ds.benchmarkIterations,8);
    assert.equal(result.productionAuthorized,false);
    await assert.rejects(()=>session.run([...rows,...rows]),/exceed capacity/);
    await assert.rejects(()=>session.run(rows,{warmRepeats:21}),/Invalid geometry benchmark/);
  }finally{session.close();session.close();}
  assert.ok(mock.buffers.every(b=>b.destroyed));
  assert.equal(mock.destroyed,true);
  await assert.rejects(()=>session.run(rows),/closed/);
  await assert.rejects(()=>p.createSession(1,{navigator:{}}),/unavailable/);
});
